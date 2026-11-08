import { useLocation, useNavigate } from 'react-router-dom'
import { Calendar, ChevronDown, LogOut, Menu, Settings, User } from 'lucide-react'
import { format } from 'date-fns'
import { Breadcrumbs, DropdownMenu, IconButton } from '@/components/ui'
import { initials } from '@/utils/format'
import { TODAY } from '@/data/db'
import { useAuth } from '@/features/auth/AuthContext'

const LABELS = {
  students: 'Students', memberships: 'Memberships', payments: 'Payments', arena: 'Arena Bookings',
  expenses: 'Expenses', accounts: 'Accounts', income: 'Income', ledger: 'Ledger', statements: 'P&L and Cash Flow', audit: 'Audit log', reports: 'Reports', settings: 'Settings',
  new: 'New', edit: 'Edit', receipt: 'Receipt',
}

function crumbsFor(pathname) {
  const parts = pathname.split('/').filter(Boolean)
  if (!parts.length) return [{ label: 'Dashboard' }]
  const crumbs = [{ label: 'Dashboard', to: '/' }]
  let acc = ''
  parts.forEach((p, i) => {
    acc += `/${p}`
    crumbs.push({ label: LABELS[p] || 'Details', to: i < parts.length - 1 ? acc : undefined })
  })
  return crumbs
}

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:px-8 print:hidden">
      <IconButton icon={Menu} label="Open menu" onClick={onMenu} className="md:hidden" />
      <Breadcrumbs items={crumbsFor(pathname)} className="flex-1" />
      <div className="hidden items-center gap-2 text-body-sm text-text-secondary sm:flex">
        <Calendar size={16} />
        {format(TODAY, 'EEE, dd MMM yyyy')}
      </div>
      <DropdownMenu
        label="Admin menu"
        trigger={() => (
          <span className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-background">
            <span className="flex size-8 items-center justify-center rounded-full bg-sidebar text-caption font-semibold text-white">
              {initials(user?.full_name)}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-body-sm font-medium leading-4 text-text-primary">{user?.full_name}</span>
              <span className="block text-caption text-text-secondary">Admin</span>
            </span>
            <ChevronDown size={14} className="text-text-tertiary" />
          </span>
        )}
        items={[
          { label: 'Admin profile', icon: User, onClick: () => navigate('/settings') },
          { label: 'Settings', icon: Settings, onClick: () => navigate('/settings') },
          { divider: true },
          { label: 'Log out', icon: LogOut, danger: true, onClick: signOut },
        ]}
      />
    </header>
  )
}
