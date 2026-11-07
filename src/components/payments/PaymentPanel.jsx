import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Checkbox, FormField, Input, InlineAlert } from '@/components/ui'
import { PAYMENT_METHODS } from '@/data/mock'
import { getSettings, upiLink } from '@/services/store'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * State for a payment step. `amount === null` means "pay the full total".
 * A payment is only produced once the admin ticks the verification box, so a
 * displayed or scanned QR code is never treated as proof of payment.
 */
export function usePayment(total, initial = null) {
  const [s, setS] = useState({ amount: initial, method: 'upi', reference: '', verified: false })
  const paying = s.amount === null ? total : Number(s.amount) || 0
  const remaining = Math.max(0, total - paying)
  const tooMuch = paying > total
  const needsVerify = paying > 0
  const valid = !tooMuch && paying >= 0 && (!needsVerify || s.verified)
  return {
    state: s,
    set: (patch) => setS((x) => ({ ...x, ...patch })),
    reset: () => setS({ amount: initial, method: 'upi', reference: '', verified: false }),
    total, paying, remaining, tooMuch, valid,
    /** null when nothing is being paid now (balance simply stays outstanding) */
    payload: paying > 0 ? { amount: paying, payment_method: s.method, reference_number: s.reference } : null,
  }
}

const VERIFY_TEXT = {
  upi: 'I can see this UPI payment in my bank / UPI app',
  cash: 'I have received this cash',
  bank_transfer: 'I have confirmed this transfer in the bank account',
  card: 'The card payment was approved',
}

export default function PaymentPanel({ pay, payer, note = 'Fees', title = 'Payment', className }) {
  const { state, set, total, paying, remaining, tooMuch } = pay
  const { upi_id, name } = getSettings()
  const showQR = state.method === 'upi' && paying > 0 && !tooMuch

  return (
    <section className={cn('rounded-lg border border-border bg-background/60 p-4', className)}>
      <h3 className="mb-3 text-body font-semibold text-text-primary">{title}</h3>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Figure label="Total" value={formatINR(total)} />
        <Figure label="Paying now" value={formatINR(paying)} tone="primary" />
        <Figure label="Remaining" value={formatINR(remaining)} tone={remaining > 0 ? 'warning' : 'neutral'} />
      </div>

      <div className="mt-4 space-y-3">
        <FormField label="Amount being paid (₹)" error={tooMuch ? `Cannot be more than ${formatINR(total)}` : undefined}>
          <div className="flex gap-2">
            <Input
              type="number" inputMode="numeric" min="0" max={total} error={tooMuch}
              value={state.amount === null ? total : state.amount}
              onChange={(e) => set({ amount: e.target.value, verified: false })}
            />
            <button type="button" onClick={() => set({ amount: null, verified: false })} className="shrink-0 rounded-md border border-border-heavy bg-surface px-3 text-body-sm font-medium hover:bg-background">Full</button>
            <button type="button" onClick={() => set({ amount: String(Math.round(total / 2)), verified: false })} className="shrink-0 rounded-md border border-border-heavy bg-surface px-3 text-body-sm font-medium hover:bg-background">Half</button>
          </div>
        </FormField>

        {paying > 0 && !tooMuch && (
          <>
            <div>
              <p className="mb-1 text-body-sm font-medium text-text-primary">Payment method</p>
              <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Payment method">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.value} type="button" role="radio" aria-checked={state.method === m.value}
                    onClick={() => set({ method: m.value, verified: false })}
                    className={cn('h-9 rounded-md border px-1 text-body-sm font-medium transition-colors',
                      state.method === m.value ? 'border-primary bg-success-bg text-success-text' : 'border-border-heavy bg-surface text-text-secondary hover:bg-background')}
                  >
                    {m.label.replace(' transfer', '')}
                  </button>
                ))}
              </div>
            </div>

            {showQR && (
              upi_id ? (
                <div className="flex flex-col items-center rounded-md border border-border bg-surface p-3">
                  <QRCodeSVG value={upiLink({ vpa: upi_id, name, amount: paying, note: `${note}${payer ? ` - ${payer}` : ''}` })} size={150} />
                  <p className="mt-2 text-body-sm font-medium">Scan to pay {formatINR(paying)}</p>
                  <p className="text-caption text-text-secondary">{upi_id}</p>
                  <p className="mt-1 text-center text-caption text-text-secondary">Scanning does not confirm the payment. Check your UPI app, then tick the box below.</p>
                </div>
              ) : (
                <InlineAlert tone="info">
                  Add your UPI ID in <Link to="/settings" className="font-medium underline">Settings</Link> to show a payment QR here.
                </InlineAlert>
              )
            )}

            {state.method !== 'cash' && (
              <FormField label={state.method === 'upi' ? 'UPI reference / UTR (optional)' : 'Reference (optional)'}>
                <Input value={state.reference} onChange={(e) => set({ reference: e.target.value })} />
              </FormField>
            )}

            <Checkbox
              className="rounded-md border border-border bg-surface p-3"
              label={`${VERIFY_TEXT[state.method]} — ${formatINR(paying)}`}
              checked={state.verified}
              onChange={(e) => set({ verified: e.target.checked })}
            />
          </>
        )}
        {paying === 0 && <p className="text-body-sm text-text-secondary">No payment now. The full amount will stay as balance due.</p>}
      </div>
    </section>
  )
}

function Figure({ label, value, tone = 'neutral' }) {
  const color = { neutral: 'text-text-primary', primary: 'text-primary', warning: 'text-warning-text' }[tone]
  return (
    <div className="rounded-md bg-surface px-2 py-2 shadow-sm">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={cn('text-body-lg font-semibold tabular-nums', color)}>{value}</p>
    </div>
  )
}
