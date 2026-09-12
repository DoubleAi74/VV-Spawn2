'use client';

import { createContext, useContext, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isPageToDashboard } from '@/lib/dashboardNavigation';

const DashboardReturnContext = createContext(false);

export function DashboardNavigationProvider({ children }) {
  const pathname = usePathname();
  const [route, setRoute] = useState({ current: pathname, previous: null });

  if (pathname && pathname !== route.current) {
    // Update before rendering the destination, so even its first loading
    // frame knows where we came from. Both header and browser Back use this.
    setRoute({ current: pathname, previous: route.current });
  }

  return (
    <DashboardReturnContext.Provider value={isPageToDashboard(route.previous, pathname)}>
      {children}
    </DashboardReturnContext.Provider>
  );
}

export function useDashboardReturn() {
  return useContext(DashboardReturnContext);
}
