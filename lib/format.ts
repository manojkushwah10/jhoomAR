const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })

export const formatInr = (amount: number) => inr.format(amount)

/** 80 → "80 cm (2 ft 7 in)" */
export function formatCm(cm: number): string {
  const totalIn = Math.round(cm / 2.54)
  const ft = Math.floor(totalIn / 12)
  const inch = totalIn % 12
  return `${cm} cm (${ft ? `${ft} ft ` : ""}${inch} in)`
}
