import Providers from './providers'
import AppRoutes from './router'
import ConfigErrorPage from '@/features/auth/ConfigErrorPage'
import { isSupabaseConfigured } from '@/lib/supabaseClient'

export default function App() {
  if (!isSupabaseConfigured) return <ConfigErrorPage />
  return (
    <Providers>
      <AppRoutes />
    </Providers>
  )
}
