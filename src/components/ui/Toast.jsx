import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/utils/cn'

const ToastContext = createContext(null)
const icons = { success: CircleCheck, error: CircleAlert, info: Info }
const colors = { success: 'text-success', error: 'text-danger', info: 'text-info' }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (message, type = 'success') => {
      const id = crypto.randomUUID()
      setToasts((t) => [...t, { id, message, type }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss],
  )
  const api = useMemo(
    () => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 print:hidden">
        {toasts.map((t) => {
          const Icon = icons[t.type]
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-surface p-3 shadow-dropdown">
              <Icon size={18} className={cn('mt-0.5 shrink-0', colors[t.type])} />
              <p className="flex-1 text-body text-text-primary">{t.message}</p>
              <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-text-tertiary hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
