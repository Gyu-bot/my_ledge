import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { MobileDrawer } from './MobileDrawer'
import { AppTopbar } from './AppTopbar'

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen bg-surface-panel overflow-hidden">
      <AppSidebar onMobileOpen={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 overflow-y-auto">
        <AppTopbar onMobileMenuOpen={() => setDrawerOpen(true)} />
        <main className="flex-1 p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
