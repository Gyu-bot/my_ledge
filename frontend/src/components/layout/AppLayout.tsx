import { useCallback, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileDrawer } from './MobileDrawer'
import { AppTopbar } from './AppTopbar'
import { ChromeContext } from './chromeContext'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [metaBadge, setMetaBadge] = useState<React.ReactNode>(null)
  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const toggleSidebar = useCallback(() => setSidebarCollapsed((current) => !current), [])

  return (
    <ChromeContext.Provider value={{ setMetaBadge }}>
      <div className="flex h-screen bg-surface-panel overflow-hidden">
        <AppSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <MobileDrawer open={drawerOpen} onClose={closeDrawer} />
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
          <AppTopbar onMobileMenuOpen={openDrawer} metaBadge={metaBadge} />
          <main className="flex-1 p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </ChromeContext.Provider>
  )
}
