import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../lib/firebase';
import { CustomerDetails } from '../types';

export interface CustomerPreferences {
  preferredMoods: string[];
  preferredScents: string[];
  preferredIntensity: string;
  preferredOccasions: string[];
}

export interface CustomerProfile {
  uid: string;
  email: string;
  fullName: string;
  phone?: string;
  role: 'customer' | 'admin';
  savedAddress?: CustomerDetails;
  preferences?: CustomerPreferences;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | null;
  isAdmin: boolean;
  loading: boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  isAccountOpen: boolean;
  setIsAccountOpen: (open: boolean) => void;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, fullName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<CustomerPreferences>) => Promise<void>;
  saveAddress: (address: CustomerDetails) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = ['justinsharon56@gmail.com'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Sync user profile from Firestore or bootstrap customer doc
  const loadCustomerProfile = async (firebaseUser: User) => {
    const isBootstrappedAdmin = ADMIN_EMAILS.includes(firebaseUser.email?.toLowerCase() || '');
    const userDocRef = doc(db, 'customers', firebaseUser.uid);

    try {
      const snap = await getDoc(userDocRef);
      if (snap.exists()) {
        const data = snap.data();
        setProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email || data.email,
          fullName: data.firstName || data.fullName || firebaseUser.displayName || 'Calm Seeker',
          phone: data.phone || '',
          role: isBootstrappedAdmin ? 'admin' : data.role || 'customer',
          savedAddress: data.addresses?.[0] || data.savedAddress,
          preferences: data.preferences,
          createdAt: data.createdAt || new Date().toISOString()
        });
      } else {
        // Initial customer profile creation
        const newProfile: CustomerProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          fullName: firebaseUser.displayName || 'Calm Seeker',
          phone: '',
          role: isBootstrappedAdmin ? 'admin' : 'customer',
          createdAt: new Date().toISOString(),
          preferences: {
            preferredMoods: ['calm', 'wind-down'],
            preferredScents: ['Herbal', 'Woody'],
            preferredIntensity: 'Balanced',
            preferredOccasions: ['Evening unwind']
          }
        };

        await setDoc(userDocRef, {
          id: firebaseUser.uid,
          email: newProfile.email,
          firstName: newProfile.fullName,
          role: newProfile.role,
          createdAt: newProfile.createdAt,
          preferences: newProfile.preferences
        });

        setProfile(newProfile);
      }
    } catch (err) {
      console.warn('Could not read user profile from Firestore:', err);
      // Fallback in-memory profile
      setProfile({
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        fullName: firebaseUser.displayName || 'Calm Seeker',
        role: isBootstrappedAdmin ? 'admin' : 'customer',
        createdAt: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await loadCustomerProfile(currentUser);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
    setIsAuthModalOpen(false);
  };

  const signUpWithEmail = async (email: string, pass: string, fullName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const userDocRef = doc(db, 'customers', cred.user.uid);
    const isBootstrappedAdmin = ADMIN_EMAILS.includes(email.toLowerCase());

    const initialData = {
      id: cred.user.uid,
      email,
      firstName: fullName,
      role: isBootstrappedAdmin ? 'admin' : 'customer',
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(userDocRef, initialData);
    } catch (e) {
      console.warn('Customer document write warning:', e);
    }

    setProfile({
      uid: cred.user.uid,
      email,
      fullName,
      role: isBootstrappedAdmin ? 'admin' : 'customer',
      createdAt: initialData.createdAt
    });

    setIsAuthModalOpen(false);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
    setIsAuthModalOpen(false);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
    setIsAccountOpen(false);
  };

  const updatePreferences = async (newPrefs: Partial<CustomerPreferences>) => {
    if (!user || !profile) return;
    const updated = {
      ...(profile.preferences || {
        preferredMoods: [],
        preferredScents: [],
        preferredIntensity: 'Balanced',
        preferredOccasions: []
      }),
      ...newPrefs
    };

    try {
      const userRef = doc(db, 'customers', user.uid);
      await updateDoc(userRef, { preferences: updated });
      setProfile((prev) => (prev ? { ...prev, preferences: updated } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `customers/${user.uid}`);
    }
  };

  const saveAddress = async (address: CustomerDetails) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'customers', user.uid);
      await updateDoc(userRef, {
        savedAddress: address,
        phone: address.phone,
        addresses: [address]
      });
      setProfile((prev) => (prev ? { ...prev, savedAddress: address, phone: address.phone } : null));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `customers/${user.uid}`);
    }
  };

  const isAdmin =
    profile?.role === 'admin' ||
    ADMIN_EMAILS.includes(user?.email?.toLowerCase() || '');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        loading,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isAccountOpen,
        setIsAccountOpen,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        resetPassword,
        signOut,
        updatePreferences,
        saveAddress
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
