import { LoaderCircle } from 'lucide-react'
import { cn } from '@/utils/cn'

const variants = {
  primary: 'bg-primary text-white border-transparent shadow-sm hover:bg-primary-hover active:bg-primary-active',
  secondary: 'bg-surface text-text-primary border-border-heavy shadow-sm hover:bg-background',
  danger: 'bg-danger text-white border-transparent shadow-sm hover:bg-red-600',
  ghost: 'bg-transparent text-text-secondary border-transparent hover:bg-border-light hover:text-text-primary',
}
const sizes = { md: 'h-10 px-4 text-body', sm: 'h-8 px-3 text-body-sm', lg: 'h-11 px-5 text-body-lg' }

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, as: Comp = 'button', className, children, disabled, ...props }) {
  const extra = Comp === 'button' ? { type: props.type || 'button', disabled: disabled || loading } : {}
  return (
    <Comp
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
      {...extra}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </Comp>
  )
}

export function IconButton({ icon: Icon, label, as: Comp = 'button', className, size = 'md', ...props }) {
  const extra = Comp === 'button' ? { type: props.type || 'button' } : {}
  return (
    <Comp
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-border-light hover:text-text-primary',
        size === 'sm' ? 'size-8' : 'size-9',
        className,
      )}
      {...props}
      {...extra}
    >
      <Icon size={size === 'sm' ? 16 : 18} />
    </Comp>
  )
}
