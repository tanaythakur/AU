import { todayISO } from '@/utils/format'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { CircleCheck, MessageCircle } from 'lucide-react'
import { Button, Drawer, FormField, Input, useToast } from '@/components/ui'
import PaymentPanel, { usePayment } from '@/components/payments/PaymentPanel'
import { addBooking, enrichBooking } from '@/services/store'
import { formatINR } from '@/utils/format'
import { bookingWhatsApp } from './whatsapp'

export default function BookingDrawer({ open, onClose }) {
  if (!open) return null
  return <Inner onClose={onClose} />
}

function Inner({ onClose }) {
  const toast = useToast()
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: { customer_name: '', mobile: '', booking_date: todayISO(), details: '', total_amount: '' },
  })
  const total = Number(watch('total_amount')) || 0
  const pay = usePayment(total, '0') // advance defaults to nothing
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  const onSubmit = async (d) => {
    setSaving(true)
    try {
      await new Promise((r) => setTimeout(r, 350))
      const { booking } = addBooking({ ...d, advance: pay.payload })
      setDone(enrichBooking(booking))
      toast.success('Booking created.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (done)
    return (
      <Drawer open onClose={onClose} title="Booking created" footer={<Button variant="secondary" className="flex-1" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center py-4 text-center">
          <CircleCheck size={48} className="text-success" />
          <p className="mt-3 text-h3">{done.customer_name}</p>
          <p className="text-body text-text-secondary">{done.details}</p>
          <p className="mt-3 text-body">Total <b>{formatINR(done.total_amount)}</b> · Advance <b>{formatINR(done.paid)}</b> · Balance <b>{formatINR(done.balance)}</b></p>
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
          <Button className="flex-1" loading={saving} disabled={!pay.valid} onClick={handleSubmit(onSubmit)}>Save booking{pay.paying > 0 ? ` · ${formatINR(pay.paying)} advance` : ''}</Button>
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
            <Input type="date" error={errors.booking_date} {...register('booking_date', { required: 'Required' })} />
          </FormField>
        </div>
        <FormField label="Booking / service details" required error={errors.details?.message}>
          <Input placeholder="e.g. Indoor turf, 7–8 PM" error={errors.details} {...register('details', { required: 'Add a short description' })} />
        </FormField>
        <FormField label="Total booking amount (₹)" required error={errors.total_amount?.message}>
          <Input type="number" inputMode="numeric" min="1" error={errors.total_amount} {...register('total_amount', { required: 'Enter the amount', min: { value: 1, message: 'Must be more than 0' } })} />
        </FormField>
      </form>
      {total > 0 && <PaymentPanel pay={pay} title="Advance paid" note="Arena booking" />}
    </Drawer>
  )
}
