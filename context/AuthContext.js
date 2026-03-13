'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { createContext, useContext } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}

export function useAuth() {
  const { data: session, status, update } = useSession();
  return {
    session,
    user: session?.user ?? null,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    updateSession: update,
  };
}
