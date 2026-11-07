import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="md:ml-20 lg:ml-64 print:ml-0">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-content p-4 md:p-[var(--content-padding)] print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
