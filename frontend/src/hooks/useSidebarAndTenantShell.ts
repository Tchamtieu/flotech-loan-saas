import { useState, useCallback } from 'react';

export interface TenantSwitcherOption {
  businessId: string;
  businessCode: string;
  businessName: string;
  roleName: string;
  currencyCode: string;
}

/**
 * Manages the active business selection in the frontend UI shell,
 * while reminding callers that actual authorization and tenant isolation
 * are strictly validated on the backend per request via PostgreSQL.
 */
export function useSidebarAndTenantShell(initialOptions: TenantSwitcherOption[]) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<TenantSwitcherOption | undefined>(
    initialOptions[0]
  );

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((prev) => !prev);
  }, []);

  const toggleMobileDrawer = useCallback(() => {
    setIsMobileDrawerOpen((prev) => !prev);
  }, []);

  return {
    isSidebarCollapsed,
    isMobileDrawerOpen,
    selectedBusiness,
    setSelectedBusiness,
    toggleSidebar,
    toggleMobileDrawer,
    closeMobileDrawer: () => setIsMobileDrawerOpen(false),
  };
}
