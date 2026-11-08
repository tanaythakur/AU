import { TriangleAlert } from 'lucide-react'
import { configError } from '@/lib/supabaseClient'

/** Shown instead of the app when Supabase is not (correctly) configured. There is deliberately no demo fallback. */
export default function ConfigErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-6 shadow-card">
        <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger"><TriangleAlert size={24} /></span>
        <h1 className="text-h2">Configuration problem</h1>
        <p className="mt-2 text-body text-text-primary">{configError}</p>
        <div className="mt-4 rounded-md bg-background p-3 text-body-sm text-text-secondary">
          <p className="font-medium text-text-primary">Fix it in the project's <code>.env</code> file:</p>
          <pre className="mt-1 overflow-x-auto">VITE_SUPABASE_URL=https://&lt;project-ref&gt;.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=&lt;anon or publishable key&gt;</pre>
          <p className="mt-2">Find both in Supabase → Project Settings → API. Then restart <code>npm run dev</code>.</p>
        </div>
      </div>
    </div>
  )
}
