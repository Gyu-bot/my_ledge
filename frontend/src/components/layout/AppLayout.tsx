import { useState, createContext, useContext } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileDrawer } from './MobileDrawer'
import { AppTopbar } from './AppTopbar'

interface ChromeContextValue {
  setMetaBadge: (badge: React.ReactNode) => void
}

export const ChromeContext = createContext<ChromeContextValue>({ setMetaBadge: () => {} })
export const useChromeContext = () => useContext(ChromeContext)

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [metaBadge, setMetaBadge] = useState<React.ReactNode>(null)

  return (
    <ChromeContext.Provider value={{ setMetaBadge }}>
      <div className="flex h-screen bg-surface-panel overflow-hidden">
        <AppSidebar onMobileOpen={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
          <AppTopbar onMobileMenuOpen={() => setDrawerOpen(true)} metaBadge={metaBadge} />
          <main className="flex-1 p-5">
            <Outlet />
          </main>
        </div>
      </div>
    </ChromeContext.Provider>
  )
}
