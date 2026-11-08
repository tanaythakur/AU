import { NavLink } from 'react-router-dom'
import { Calculator, ChartColumn, IndianRupee, LayoutDashboard, LogOut, Settings, Trophy, Users, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'
import { BRAND } from '@/data/db'
import { useAuth } from '@/features/auth/AuthContext'

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/students', label: 'Students', icon: Users },
  { to: '/arena', label: 'Arena Bookings', icon: Trophy },
  { to: '/payments', label: 'Payments', icon: IndianRupee },
  { to: '/accounts', label: 'Accounts', icon: Calculator },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/** lg+: 256px full. md: 80px icon rail. below md: off-canvas drawer (labels shown). */
export default function Sidebar({ open, onClose }) {
  const { user, signOut } = useAuth()
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        aria-label="Primary"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-white transition-transform duration-200 md:w-20 md:translate-x-0 lg:w-64 print:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5 md:justify-center md:px-0 lg:justify-start lg:px-5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-body-sm font-bold">CA</div>
          <div className="min-w-0 flex-1 md:hidden lg:block">
            <p className="truncate text-body-lg font-semibold leading-5">{BRAND.name}</p>
            <p className="truncate text-caption text-text-tertiary">{BRAND.tagline}</p>
          </div>
          <button aria-label="Close menu" onClick={onClose} className="rounded p-1 text-text-tertiary hover:text-white md:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={label}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-body font-medium transition-colors md:justify-center md:px-0 lg:justify-start lg:px-3',
                  isActive ? 'bg-primary text-white' : 'text-text-tertiary hover:bg-sidebar-hover hover:text-slate-50',
                )
              }
            >
              <Icon size={20} className="shrink-0" />
              <span className="leading-tight md:hidden lg:inline">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="flex items-center gap-3 md:justify-center lg:justify-start">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-hover text-body-sm font-semibold">
              {initials(user?.full_name)}
            </div>
            <div className="min-w-0 flex-1 md:hidden lg:block">
              <p className="truncate text-body font-medium">{user?.full_name}</p>
              <p className="text-caption text-text-tertiary">Admin</p>
            </div>
            <button
              aria-label="Log out"
              title="Log out"
              onClick={signOut}
              className="rounded-md p-2 text-text-tertiary hover:bg-sidebar-hover hover:text-white md:hidden lg:block"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
