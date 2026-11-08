import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { Button, ErrorState } from '@/components/ui'
import { loadAll, useDataStatus } from '@/services/dataLoader'
import { useAuth } from './AuthContext'

const Spinner = ({ text }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-text-secondary" role="status">
    <LoaderCircle className="animate-spin text-primary" size={28} />
    <p className="text-body">{text}</p>
  </div>
)

/** Signed out -> /login. Signed in -> load the database once, then show the app. No data is rendered before both. */
export default function ProtectedRoute() {
  const { user, loading, signOut } = useAuth()
  const status = useDataStatus()
  const location = useLocation()

  useEffect(() => {
    if (user && status.state === 'idle') loadAll()
  }, [user, status.state])

  if (loading) return <Spinner text="Checking your session…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (status.state === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface shadow-card">
          <ErrorState title="Could not load your data" message={status.error} onRetry={loadAll} />
          <div className="border-t border-border p-3 text-center"><Button variant="ghost" onClick={signOut}>Sign out</Button></div>
        </div>
      </div>
    )
  }
  if (status.state !== 'ready') return <Spinner text="Loading your data…" />
  return <Outlet />
}
