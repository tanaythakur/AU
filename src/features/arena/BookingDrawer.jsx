import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { CircleCheck, MessageCircle } from 'lucide-react'
import { Button, Drawer, FormField, Input, useToast } from '@/components/ui'
import PaymentPanel, { usePayment } from '@/components/payments/PaymentPanel'
import { addBooking, enrichBooking, getSettings } from '@/services/store'
import { formatDate, formatDuration, formatHour, formatINR, todayISO } from '@/utils/format'
import { bookingWhatsApp } from './whatsapp'
import SlotPicker from './SlotPicker'

export default function BookingDrawer({ open, onClose }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }) {
  const toast = useToast()
  const { hourly_rate } = getSettings()
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { customer_name: '', mobile: '', booking_date: todayISO(), details: '' },
  })
  const date = watch('booking_date')
  const [slots, setSlots] = useState(null) // {start, end}
  const [override, setOverride] = useState(null) // string | null (null = use hours × rate)
  const [lastDate, setLastDate] = useState(date)
  if (date !== lastDate) { // changing the date refreshes availability and clears the selection
    setLastDate(date)
    setSlots(null)
  }

  const hours = slots ? slots.end - slots.start : 0
  const calculated = hours * hourly_rate
  const total = override === null ? calculated : Number(override) || 0
  const pay = usePayment(total, '0') // advance defaults to nothing
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  const onSubmit = async (d) => {
    if (!slots) return toast.error('Pick at least one time slot.')
    setSaving(true)
    try {
      const { booking } = await addBooking({ ...d, start_hour: slots.start, end_hour: slots.end, total_amount: total, advance: pay.payload })
      setDone(enrichBooking(booking))
      toast.success('Booking created.')
    } catch (e) {
      toast.error(e.message)
      setSlots(null) // availability may have changed; let the admin re-pick
    } finally {
      setSaving(false)
    }
  }

  if (done)
    return (
      <Drawer open onClose={onClose} title="Booking confirmed" footer={<Button variant="secondary" className="flex-1" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center text-center">
          <CircleCheck size={48} className="text-success" />
          <p className="mt-3 text-h3">{done.customer_name}</p>
          <dl className="mt-4 w-full divide-y divide-border-light rounded-md border border-border text-left text-body">
            <Line k="Date" v={formatDate(done.booking_date)} />
            <Line k="Time" v={`${formatHour(done.start_hour)} to ${formatHour(done.end_hour)}`} />
            <Line k="Duration" v={formatDuration(done.hours)} />
            <Line k="Total amount" v={formatINR(done.total_amount)} />
            <Line k="Advance paid" v={formatINR(done.paid)} />
            <Line k="Remaining balance" v={formatINR(done.balance)} strong />
          </dl>
          <Button as="a" href={bookingWhatsApp(done)} target="_blank" rel="noreferrer" icon={MessageCircle} className="mt-5 w-full">Send Booking Confirmation on WhatsApp</Button>
          <p className="mt-2 text-caption text-text-secondary">Opens WhatsApp with the message ready. You press send yourself.</p>
        </div>
      </Drawer>
    )

  return (
    <Drawer open onClose={onClose} title="New arena booking"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={saving} disabled={!slots || total <= 0 || !pay.valid} onClick={handleSubmit(onSubmit)}>
            Save booking{pay.paying > 0 ? ` · ${formatINR(pay.paying)} advance` : ''}
          </Button>
        </>
      }>
      <form noValidate className="grid gap-4" onSubmit={(e) => e.preventDefault()}>
        <FormField label="Customer name" required error={errors.customer_name?.message}>
          <Input autoFocus error={errors.customer_name} {...register('customer_name', { required: 'Enter the customer name' })} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Mobile" required error={errors.mobile?.message}>
            <Input inputMode="tel" error={errors.mobile} {...register('mobile', { required: 'Required', pattern: { value: /^[6-9]\d{9}$/, message: '10-digit number' } })} />
          </FormField>
          <FormField label="Booking date" required error={errors.booking_date?.message}>
            <Input type="date" min={todayISO()} error={errors.booking_date} {...register('booking_date', { required: 'Required' })} />
          </FormField>
        </div>
      </form>

      <div>
        <p className="mb-2 text-body-sm font-medium text-text-primary">Time slots <span className="text-danger">*</span></p>
        <SlotPicker date={date} value={slots} onChange={(v) => { setSlots(v); setOverride(null) }} />
      </div>

      {slots && (
        <>
          <FormField label="Total amount (₹)" hint={override === null ? `${formatDuration(hours)} × ${formatINR(hourly_rate)} = ${formatINR(calculated)}. Edit to give a discount.` : <>Custom amount. <button type="button" className="font-medium text-primary underline" onClick={() => setOverride(null)}>Reset to {formatINR(calculated)}</button></>}>
            <Input type="number" inputMode="numeric" min="1" value={override === null ? calculated : override} onChange={(e) => setOverride(e.target.value)} />
          </FormField>
          {total > 0 && <PaymentPanel pay={pay} title="Advance paid" note="Arena booking" />}
        </>
      )}
    </Drawer>
  )
}

function Line({ k, v, strong }) {
  return <div className="flex justify-between px-3 py-2"><dt className="text-text-secondary">{k}</dt><dd className={strong ? 'font-semibold' : ''}>{v}</dd></div>
}
