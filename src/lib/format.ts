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
