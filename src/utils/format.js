import { format, parseISO } from 'date-fns'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const toDate = (d) => (typeof d === 'string' ? parseISO(d) : d)

export const formatINR = (n) => inr.format(Number(n) || 0)

/** Compact INR for chart axes: ₹1.2L, ₹45K */
export function formatCompactINR(n) {
  const v = Number(n) || 0
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${Math.round(v / 1000)}K`
  return `₹${v}`
}

export const formatNumber = (n) => new Intl.NumberFormat('en-IN').format(Number(n) || 0)
export const formatDate = (d) => (d ? format(toDate(d), 'dd MMM yyyy') : '—')
export const formatDateTime = (d) => (d ? format(toDate(d), 'dd MMM yyyy, hh:mm a') : '—')
export const formatMonth = (d) => format(toDate(d), 'MMM yyyy')

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')

/** Client-side CSV export (Phase 1). rows: array of flat objects. */
export function downloadCSV(filename, rows) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Today as YYYY-MM-DD in the browser's local time zone (toISOString would give the UTC date). */
export const todayISO = () => format(new Date(), 'yyyy-MM-dd')
