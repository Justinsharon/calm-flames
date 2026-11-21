import React, { useState } from 'react';
import { X, Sparkles, Mail, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const AuthModal: React.FC = () => {
  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    resetPassword
  } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password);
      } else if (mode === 'signup') {
        if (!fullName.trim()) throw new Error('Please enter your full name.');
        await signUpWithEmail(email, password, fullName);
      } else if (mode === 'forgot') {
        await resetPassword(email);
        setMessage('Password reset email sent. Please check your inbox.');
      }
    } catch (err: any) {
      console.error(err);
      let userMsg = 'Authentication error. Please try again.';
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        userMsg = 'Invalid email or password.';
      } else if (err.code === 'auth/email-already-in-use') {
        userMsg = 'An account already exists with this email. Try signing in.';
      } else if (err.code === 'auth/weak-password') {
        userMsg = 'Password must be at least 6 characters.';
      } else if (err.message) {
        userMsg = err.message;
      }
      setError(userMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError('Could not complete Google sign-in. You can sign in with email.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#FAF7F2] border border-[#E5DCCE] rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#E5DCCE]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#D18D4D]" />
            <h3 className="text-sm font-semibold uppercase tracking-widest text-[#1F1B18]">
              {mode === 'signin' ? 'Sign In to Calm Flame' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
            </h3>
          </div>
          <button
            onClick={() => setIsAuthModalOpen(false)}
            className="p-1.5 text-stone-500 hover:text-stone-900 rounded-full hover:bg-stone-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <span>{message}</span>
          </div>
        )}

        {/* 1-Click Google Sign In */}
        {mode !== 'forgot' && (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 bg-white hover:bg-stone-50 border border-[#DBC4A9] rounded-xl text-xs font-semibold text-[#1F1B18] flex items-center justify-center gap-3 transition-colors shadow-2xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        )}

        {mode !== 'forgot' && (
          <div className="flex items-center gap-3 text-xs text-[#79716B]">
            <div className="flex-1 h-px bg-[#E5DCCE]" />
            <span>or email</span>
            <div className="flex-1 h-px bg-[#E5DCCE]" />
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-[11px] font-medium text-[#79716B] mb-1">Your Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="e.g. Justin Sharon"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-medium text-[#79716B] mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[11px] font-medium text-[#79716B]">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] text-[#9E6D47] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#DBC4A9] bg-white text-xs text-[#1F1B18] focus:outline-none focus:ring-1 focus:ring-[#D18D4D]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-[#2A2521] hover:bg-[#4A2F22] disabled:opacity-60 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {isSubmitting ? (
              <span>Please wait...</span>
            ) : mode === 'signin' ? (
              <span>Sign In</span>
            ) : mode === 'signup' ? (
              <span>Create Account</span>
            ) : (
              <span>Send Reset Instructions</span>
            )}
            <ArrowRight className="w-3.5 h-3.5 text-[#D18D4D]" />
          </button>
        </form>

        {/* Mode Toggle Footer */}
        <div className="text-center text-xs text-[#79716B] pt-2 border-t border-[#E5DCCE]">
          {mode === 'signin' ? (
            <p>
              New to The Calm Flame?{' '}
              <button
                type="button"
                onClick={() => setMode('signup')}
                className="text-[#9E6D47] font-semibold underline underline-offset-2 ml-1"
              >
                Create Account
              </button>
            </p>
          ) : mode === 'signup' ? (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-[#9E6D47] font-semibold underline underline-offset-2 ml-1"
              >
                Sign In
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setMode('signin')}
              className="text-[#9E6D47] font-semibold underline underline-offset-2"
            >
              Back to Sign In
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
