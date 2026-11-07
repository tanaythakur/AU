import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from './Button'
import { EmptyState, ErrorState, TableSkeleton } from './Feedback'

export function Pagination({ page, pageCount, total, pageSize, onChange }) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 sm:flex-row">
      <p className="text-body-sm text-text-secondary">
        Showing <span className="font-medium text-text-primary">{from}–{to}</span> of <span className="font-medium text-text-primary">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page" />
        <span className="px-2 text-body-sm text-text-secondary">Page {page} of {pageCount}</span>
        <Button variant="secondary" size="sm" icon={ChevronRight} disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label="Next page" />
      </div>
    </div>
  )
}

/**
 * columns: [{key, header, render?(row), sortable?, sortValue?(row), align?, className?, width?}]
 * Horizontal scroll on small screens; client-side sort + pagination.
 */
export function DataTable({
  columns, rows, loading, error, onRetry, pageSize = 10, empty, onRowClick, initialSort, paginate = true, className, dense,
  rowKey = (r) => r.id, minWidth = 720,
}) {
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(initialSort || null)

  useEffect(() => setPage(1), [rows?.length])

  const sorted = useMemo(() => {
    if (!sort || !rows) return rows || []
    const col = columns.find((c) => c.key === sort.key)
    const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key])
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b)
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const visible = paginate ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted

  const toggleSort = (key) => setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))
  const pad = dense ? 'px-4 py-2.5' : 'px-4 py-3'

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-surface shadow-card', className)}>
      {error ? (
        <ErrorState onRetry={onRetry} />
      ) : loading ? (
        <TableSkeleton cols={Math.min(columns.length, 6)} />
      ) : sorted.length === 0 ? (
        empty || <EmptyState title="No records found" description="Try changing your search or filters." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth }}>
              <thead>
                <tr className="bg-background">
                  {columns.map((c) => {
                    const active = sort?.key === c.key
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        style={{ width: c.width }}
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={cn('border-b border-border px-4 py-3 text-caption font-medium uppercase tracking-wide text-text-secondary', c.align === 'right' && 'text-right', c.className)}
                      >
                        {c.sortable ? (
                          <button type="button" onClick={() => toggleSort(c.key)} className={cn('inline-flex items-center gap-1 uppercase hover:text-text-primary', active && 'text-text-primary')}>
                            {c.header}
                            {active ? (sort.dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} className="text-text-tertiary" />}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('transition-colors hover:bg-background', onRowClick && 'cursor-pointer')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('whitespace-nowrap border-b border-border-light text-body text-text-primary', pad, c.align === 'right' && 'text-right tabular-nums', c.className)}>
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paginate && sorted.length > pageSize && <Pagination page={page} pageCount={pageCount} total={sorted.length} pageSize={pageSize} onChange={setPage} />}
        </>
      )}
    </div>
  )
}
