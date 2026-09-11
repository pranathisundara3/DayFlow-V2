
'use client';

import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import * as api from '@/lib/api-client';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOutUser: () => Promise<void>;
  // Re-fetches the current user from the backend (e.g. after a profile edit)
  // so components reading `user` elsewhere (like the header) update without
  // requiring a full re-login.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  signInAsGuest: async () => {},
  signOutUser: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function fromApiUser(apiUser: api.ApiUser): AppUser {
  return {
    uid: apiUser.id,
    email: apiUser.email,
    displayName: apiUser.username,
    photoURL: apiUser.photoUrl,
    isAnonymous: apiUser.isAnonymous,
  };
}

async function loadCurrentUser(): Promise<AppUser> {
  const apiUser = await api.fetchCurrentUser();
  return fromApiUser(apiUser);
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a session on load via the httpOnly refresh-token cookie.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await api.refreshSession();
      if (token) {
        try {
          const appUser = await loadCurrentUser();
          if (!cancelled) setUser(appUser);
        } catch (error) {
          console.error('Failed to restore session:', error);
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await api.login(email, password);
    setUser(await loadCurrentUser());
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, username: string) => {
    await api.register(email, password, username);
    setUser(await loadCurrentUser());
  }, []);

  const signInAsGuest = useCallback(async () => {
    await api.guestLogin();
    setUser(await loadCurrentUser());
  }, []);

  const signOutUser = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await loadCurrentUser());
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, []);

  const value: AuthContextType = { user, loading, signInWithEmail, signUpWithEmail, signInAsGuest, signOutUser, refreshUser };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
         <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p>Authenticating...</p>
            </div>
         </main>
      ) : children}
    </AuthContext.Provider>
  );
};
