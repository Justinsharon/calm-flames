import React, { createContext, useContext, useEffect, useState } from 'react';
import { type User, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../lib/firebase';

/**
 * Google sign-in only (Firebase Auth). Guests browse and buy without an account.
 * The admin role is read ONLY from customers/{uid}.role (set by `npm run grant-admin`);
 * firestore.rules stop users from granting it to themselves.
 */
export interface CustomerProfile {
  uid: string;
  email: string;
  fullName: string;
  role: 'customer' | 'admin';
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  profile: CustomerProfile | null;
  isAdmin: boolean;
  loading: boolean;
  /** The sign-in modal (the /sign-in page shows the same panel). */
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Fresh Firebase ID token for server calls (links an order to the account). */
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (!u) {
          setProfile(null);
          setLoading(false);
          return;
        }
        const base: CustomerProfile = { uid: u.uid, email: u.email || '', fullName: u.displayName || '', role: 'customer', createdAt: new Date().toISOString() };
        try {
          const ref = doc(db, 'customers', u.uid);
          const snap = await getDoc(ref);
          if (snap.exists()) {
            const d = snap.data();
            setProfile({ ...base, fullName: u.displayName || d.firstName || d.fullName || '', role: d.role === 'admin' ? 'admin' : 'customer', createdAt: d.createdAt || base.createdAt });
          } else {
            // Only the name and email from Google are kept.
            await setDoc(ref, { id: u.uid, email: base.email, firstName: base.fullName, role: 'customer', createdAt: base.createdAt });
            setProfile(base);
          }
        } catch (e) {
          console.warn('Could not read the customer profile:', e);
          setProfile(base);
        }
        setLoading(false);
      }),
    []
  );

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
    setIsAuthModalOpen(false);
  };
  const signOut = async () => {
    await firebaseSignOut(auth);
    setProfile(null);
  };
  const getIdToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

  return (
    <AuthContext.Provider value={{ user, profile, isAdmin: profile?.role === 'admin', loading, isAuthModalOpen, setIsAuthModalOpen, signInWithGoogle, signOut, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const c = useContext(AuthContext);
  if (!c) throw new Error('useAuth must be used within an AuthProvider');
  return c;
};
