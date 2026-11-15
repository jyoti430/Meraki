import { useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar, { navigation } from './Sidebar'
import Header from './Header'

export default function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const isFarmerWorkspace = location.pathname === '/farmers-plots' || location.pathname.startsWith('/farmers-plots/') || location.pathname.startsWith('/plots/') || location.pathname.startsWith('/crop-cycles/')
  const current = isFarmerWorkspace ? navigation.find(({ to }) => to === '/farmers-plots') : navigation.find(({ to }) => to === location.pathname) ?? navigation.find(({ to }) => to !== '/' && location.pathname.startsWith(to))
  const title = current?.label ?? 'Dashboard'
  const description = title === 'Dashboard' ? 'Welcome back. Here’s what needs your attention today.' : title === 'Buyer Orders' ? 'Capture buyer requirements and track order readiness from one place.' : title === 'Farmers & Plots' ? 'Manage FPO membership, supply participation and farm records.' : 'Manage this part of your FPO supply operations.'
  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onToggle={() => setSidebarOpen((open) => !open)} />
      <main className="main-panel"><Header title={title} description={description} /><div className="page-content">{children}</div></main>
    </div>
  )
}
