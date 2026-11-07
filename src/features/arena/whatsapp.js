import { whatsappLink } from '@/services/store'
import { formatDate, formatDuration, formatHour, formatINR } from '@/utils/format'

/**
 * Prefilled WhatsApp message (wa.me link). It opens WhatsApp for the admin to press send;
 * nothing is sent automatically (that would need the official WhatsApp Business API).
 * b: enriched booking { customer_name, mobile, booking_date, start_hour, end_hour, hours, total_amount, paid, balance }
 */
export function bookingMessage(b) {
  return [
    `Hello ${b.customer_name},`,
    '',
    'Your cricket arena booking has been confirmed!',
    '',
    `Date: ${formatDate(b.booking_date)}`,
    `Time: ${formatHour(b.start_hour)} to ${formatHour(b.end_hour)}`,
    `Duration: ${formatDuration(b.hours)}`,
    `Total Amount: ${formatINR(b.total_amount)}`,
    `Advance Paid: ${formatINR(b.paid)}`,
    `Remaining Balance: ${formatINR(b.balance)}`,
    '',
    'Thank you for booking with us!',
  ].join('\n')
}
export const bookingWhatsApp = (b) => whatsappLink(b.mobile, bookingMessage(b))
