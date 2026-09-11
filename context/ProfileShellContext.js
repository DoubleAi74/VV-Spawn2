'use client';

import { createContext, useContext } from 'react';

const ProfileShellContext = createContext(null);

export function ProfileShellProvider({ value, children }) {
  return <ProfileShellContext.Provider value={value}>{children}</ProfileShellContext.Provider>;
}

export function useProfileShell(usernameTag) {
  const shell = useContext(ProfileShellContext);
  return shell?.usernameTag === usernameTag ? shell : null;
}
