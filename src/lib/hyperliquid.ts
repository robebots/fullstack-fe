export const MARKETS = { BTC: { szDecimals: 5 }, ETH: { szDecimals: 4 } } as const

export type Coin = keyof typeof MARKETS

export const COINS = Object.keys(MARKETS) as Coin[]

export type Precision = { id: string; nSigFigs: 2 | 3 | 4 | 5 | null; mantissa?: 2 | 5 }

export const PRECISIONS: readonly Precision[] = [
  { id: "full", nSigFigs: null },
  { id: "5", nSigFigs: 5 },
  { id: "5x2", nSigFigs: 5, mantissa: 2 },
  { id: "5x5", nSigFigs: 5, mantissa: 5 },
  { id: "4", nSigFigs: 4 },
  { id: "3", nSigFigs: 3 },
  { id: "2", nSigFigs: 2 },
]

export type Level = { px: string; sz: string; n: number }

export type Book = { coin: Coin; time: number; levels: [Level[], Level[]]; fast?: true }

export type Bbo = { coin: Coin; time: number; bbo: [Level | null, Level | null] }

export const magnitudeOf = (price: number) => Math.floor(Math.log10(price))

export function tickSize({ nSigFigs, mantissa }: Precision, magnitude: number, szDecimals: number) {
  return nSigFigs === null
    ? Math.min(1, Math.max(10 ** (magnitude - 4), 10 ** (szDecimals - 6)))
    : 10 ** (magnitude + 1 - nSigFigs) * (mantissa ?? 1)
}

export const decimalsOf = (tick: number) => Math.max(0, Math.ceil(-Math.log10(tick) - 1e-9))

export function precisionOptions(magnitude: number | undefined, szDecimals: number) {
  const seen = new Set<number>()
  return PRECISIONS.flatMap((precision): { precision: Precision; tick?: number }[] => {
    if (magnitude === undefined) return [{ precision }]
    const tick = tickSize(precision, magnitude, szDecimals)
    if (seen.has(tick)) return []
    seen.add(tick)
    return [{ precision, tick }]
  })
}
