const formats = new Map<string, Intl.NumberFormat>()

export function formatNumber(value: number, minDecimals: number, maxDecimals = minDecimals) {
  const key = `${minDecimals}:${maxDecimals}`
  let format = formats.get(key)
  if (!format) {
    format = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    })
    formats.set(key, format)
  }
  return format.format(value)
}

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })

export const formatTime = (time: number) => clock.format(time)

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 })

export const formatCompact = (value: number) => `$${compact.format(value)}`

export const formatSigned = (value: number, decimals: number) =>
  `${value >= 0 ? "+" : ""}${formatNumber(value, decimals)}`

export function priceDecimals(price: number, szDecimals: number) {
  if (!price) return 0
  const significant = Math.max(0, 4 - Math.floor(Math.log10(Math.abs(price))))
  return Math.min(6 - szDecimals, significant)
}
