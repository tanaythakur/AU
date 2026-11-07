import { getSettings, whatsappLink } from '@/services/store'
import { formatDate, formatINR } from '@/utils/format'

/**
 * Prefilled WhatsApp message (wa.me link). It opens WhatsApp for the admin to press send;
 * nothing is sent automatically (that would need the official WhatsApp Business API).
 * b: { customer_name, mobile, booking_date, details, total_amount, paid, balance }
 */
export function bookingMessage(b) {
  const { name, phone } = getSettings()
  return [
    `Hello ${b.customer_name},`,
    `Your booking at ${name} is confirmed.`,
    '',
    `Date: ${formatDate(b.booking_date)}`,
    `Details: ${b.details}`,
    `Booking amount: ${formatINR(b.total_amount)}`,
    `Advance received: ${formatINR(b.paid)}`,
    `Balance to pay: ${formatINR(b.balance)}`,
    phone ? `\nContact: ${phone}` : '',
    '\nThank you!',
  ].filter((l) => l !== '').join('\n')
}
export const bookingWhatsApp = (b) => whatsappLink(b.mobile, bookingMessage(b))
