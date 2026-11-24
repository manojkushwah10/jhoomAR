/** wa.me deep link with a pre-filled message. `number` = country code + digits, e.g. 919876543210. */
export function whatsappLink(number: string, message: string): string {
  const digits = number.replace(/\D/g, "")
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export function productEnquiryMessage(p: { name: string; code: string; url: string }): string {
  return `Hello! I'm interested in the ${p.name} (code ${p.code}). Please share price and availability.\n${p.url}`
}
