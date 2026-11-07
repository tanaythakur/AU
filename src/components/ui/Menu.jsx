import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'

/**
 * items: [{label, icon?, onClick?, to?, danger?, divider?}]
 * trigger: ({open}) => node  (rendered inside a button)
 */
export function DropdownMenu({ trigger, items, align = 'right', label = 'Actions', className, triggerClassName, width = 'w-52' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={triggerClassName}>
        {trigger({ open })}
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-30 mt-1 rounded-md border border-border bg-surface py-1 shadow-dropdown', width, align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) => {
            if (it.divider) return <div key={i} className="my-1 border-t border-border-light" />
            const cls = cn(
              'flex w-full items-center gap-2.5 px-3 py-2 text-left text-body transition-colors hover:bg-background',
              it.danger ? 'text-danger-text' : 'text-text-primary',
            )
            const content = (
              <>
                {it.icon && <it.icon size={16} className={it.danger ? '' : 'text-text-secondary'} />}
                {it.label}
              </>
            )
            return it.to ? (
              <Link key={i} role="menuitem" to={it.to} className={cls} onClick={() => setOpen(false)}>{content}</Link>
            ) : (
              <button key={i} role="menuitem" type="button" className={cls} onClick={() => { setOpen(false); it.onClick?.() }}>{content}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}
