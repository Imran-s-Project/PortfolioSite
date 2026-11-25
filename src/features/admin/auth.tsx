'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmailAuthProvider, GoogleAuthProvider, onAuthStateChanged, reauthenticateWithCredential, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, updatePassword, updateProfile, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { getAuthClient, getDb } from '@/lib/firebase/client';
import type { AdminProfile } from '@/types';

export type AuthStatus = 'loading' | 'signedOut' | 'unauthorized' | 'admin';
interface AuthCtx {
  status: AuthStatus;
  user: User | null;
  profile: AdminProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  sendVerification: () => Promise<void>;
  renameSelf: (displayName: string) => Promise<void>;
  /** Fresh Firebase ID token for the server-side revalidation call. */
  idToken: () => Promise<string | null>;
}
const Ctx = createContext<AuthCtx | null>(null);

/**
 * Who is signed in and are they an administrator? "Administrator" means: a document /adminProfiles/{uid} with role 'admin'
 * exists. The same check is enforced by the Security Rules on every read and write — this provider only decides what to SHOW.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: AuthStatus; user: User | null; profile: AdminProfile | null }>({ status: 'loading', user: null, profile: null });

  useEffect(() => {
    const auth = getAuthClient();
    // Each sign-in / sign-out starts a new "round". The profile lookup of an earlier round may finish late (a quick sign-out right
    // after signing in), and must not turn the screen back into an administrator's after the account has signed out.
    let round = 0;
    return onAuthStateChanged(auth, (user) => {
      const mine = ++round;
      if (!user) {
        setState({ status: 'signedOut', user: null, profile: null });
        return;
      }
      void getDoc(doc(getDb(), 'adminProfiles', user.uid))
        .then((snap) => {
          if (mine !== round) return;
          const d = snap.data();
          if (snap.exists() && d?.role === 'admin') {
            setState({ status: 'admin', user, profile: { uid: user.uid, role: 'admin', displayName: String(d.displayName ?? user.displayName ?? ''), email: String(d.email ?? user.email ?? ''), photoURL: typeof d.photoURL === 'string' ? d.photoURL : undefined } });
          } else setState({ status: 'unauthorized', user, profile: null });
        })
        .catch(() => {
          if (mine === round) setState({ status: 'unauthorized', user, profile: null });
        });
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getAuthClient(), email, password);
  }, []);
  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(getAuthClient(), new GoogleAuthProvider());
  }, []);
  const signOut = useCallback(async () => {
    await fbSignOut(getAuthClient());
  }, []);
  const changePassword = useCallback(async (current: string, next: string) => {
    const user = getAuthClient().currentUser;
    if (!user?.email) throw new Error('no-email-user');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
    await updatePassword(user, next);
  }, []);
  const sendVerification = useCallback(async () => {
    const user = getAuthClient().currentUser;
    if (user) await sendEmailVerification(user);
  }, []);
  const renameSelf = useCallback(async (displayName: string) => {
    const user = getAuthClient().currentUser;
    if (!user) return;
    await updateProfile(user, { displayName });
    setState((s) => (s.profile ? { ...s, profile: { ...s.profile, displayName } } : s));
  }, []);
  const idToken = useCallback(async () => (getAuthClient().currentUser ? getAuthClient().currentUser!.getIdToken() : null), []);

  const value = useMemo<AuthCtx>(() => ({ ...state, signIn, signInWithGoogle, signOut, changePassword, sendVerification, renameSelf, idToken }), [state, signIn, signInWithGoogle, signOut, changePassword, sendVerification, renameSelf, idToken]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider is missing');
  return c;
}
