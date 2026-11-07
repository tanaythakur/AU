import { cn } from '@/utils/cn'

const tones = {
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  danger: 'bg-danger-bg text-danger-text',
  info: 'bg-info-bg text-info-text',
  neutral: 'bg-border-light text-text-secondary',
}

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium', tones[tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  )
}

// status key -> [tone, label]
const STATUS = {
  active: ['success', 'Active'],
  expiring_soon: ['warning', 'Expiring soon'],
  expired: ['danger', 'Expired'],
  upcoming: ['info', 'Upcoming'],
  cancelled: ['neutral', 'Cancelled'],
  archived: ['neutral', 'Archived'],
  inactive: ['neutral', 'Inactive'],
  none: ['neutral', 'No membership'],
  completed: ['success', 'Completed'],
  pending: ['warning', 'Pending'],
  failed: ['danger', 'Failed'],
  refunded: ['neutral', 'Refunded'],
  paid: ['success', 'Paid'],
  unpaid: ['danger', 'Unpaid'],
  partial: ['warning', 'Partial'],
  in_stock: ['success', 'In stock'],
  low_stock: ['warning', 'Low stock'],
  out_of_stock: ['danger', 'Out of stock'],
  contract_completed: ['neutral', 'Completed'],
}

export function StatusBadge({ status, className }) {
  const [tone, label] = STATUS[status] || ['neutral', status]
  return <Badge tone={tone} className={className}>{label}</Badge>
}
