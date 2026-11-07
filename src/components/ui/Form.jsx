import { createContext, useContext, useId } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { PERIOD_OPTIONS } from '@/data/mock'

const control =
  'h-10 w-full rounded-md border bg-surface px-3 text-body text-text-primary shadow-sm transition-colors placeholder:text-text-tertiary ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:cursor-not-allowed disabled:bg-background disabled:text-text-tertiary'

const FieldId = createContext(undefined)

export function FormField({ label, required, error, hint, className, htmlFor, children }) {
  const auto = useId()
  const id = htmlFor || auto
  return (
    <FieldId.Provider value={id}>
    <div className={cn('flex flex-col', className)}>
      {label && (
        <label htmlFor={id} className="mb-1 text-body-sm font-medium text-text-primary">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-caption text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-caption text-text-secondary">{hint}</p>
      ) : null}
    </div>
    </FieldId.Provider>
  )
}

export function Input({ error, className, ref, ...props }) {
  const fid = useContext(FieldId)
  return <input id={fid} ref={ref} className={cn(control, error ? 'border-danger' : 'border-border-heavy', className)} {...props} />
}

export function Textarea({ error, className, ref, rows = 3, ...props }) {
  const fid = useContext(FieldId)
  return (
    <textarea
      id={fid}
      ref={ref}
      rows={rows}
      className={cn(control, 'h-auto py-2', error ? 'border-danger' : 'border-border-heavy', className)}
      {...props}
    />
  )
}

export function Select({ error, className, children, ref, placeholder, ...props }) {
  const fid = useContext(FieldId)
  return (
    <div className="relative">
      <select
        id={fid}
        ref={ref}
        className={cn(control, 'appearance-none pr-9', error ? 'border-danger' : 'border-border-heavy', className)}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
    </div>
  )
}

export function Checkbox({ label, hint, className, ref, ...props }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 size-4 rounded-sm border-border-heavy accent-primary" {...props} />
      <span>
        <span className="text-body text-text-primary">{label}</span>
        {hint && <span className="block text-caption text-text-secondary">{hint}</span>}
      </span>
    </label>
  )
}

export function FormSection({ title, description, children, columns = 2 }) {
  return (
    <section className="border-b border-border-light py-6 first:pt-0 last:border-0 last:pb-0">
      <div className="mb-4">
        <h3 className="text-body-lg font-semibold text-text-primary">{title}</h3>
        {description && <p className="mt-0.5 text-body-sm text-text-secondary">{description}</p>}
      </div>
      <div className={cn('grid gap-4', columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : '')}>{children}</div>
    </section>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }) {
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(control, 'border-border-heavy pl-9', value && 'pr-9')}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-tertiary hover:text-text-primary">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

/** Compact select used in filter rows. options: [{value,label}] */
export function FilterSelect({ value, onChange, options, label, className }) {
  return (
    <div className={cn('relative w-full sm:w-auto', className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={cn(control, 'appearance-none border-border-heavy pr-9 sm:w-44')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
    </div>
  )
}

/** Preset period select + custom range inputs. value: {preset, from, to} */
export function DateRangePicker({ value, onChange, className }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <FilterSelect
        label="Period"
        value={value.preset}
        onChange={(preset) => onChange({ ...value, preset })}
        options={PERIOD_OPTIONS}
      />
      {value.preset === 'custom' && (
        <>
          <input type="date" aria-label="From date" value={value.from || ''} onChange={(e) => onChange({ ...value, from: e.target.value })} className={cn(control, 'w-40 border-border-heavy')} />
          <span className="text-body-sm text-text-secondary">to</span>
          <input type="date" aria-label="To date" value={value.to || ''} onChange={(e) => onChange({ ...value, to: e.target.value })} className={cn(control, 'w-40 border-border-heavy')} />
        </>
      )}
    </div>
  )
}
