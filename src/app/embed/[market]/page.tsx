import { notFound } from "next/navigation"
import { OrderBook } from "@/components/order-book"
import { COINS, type Coin } from "@/lib/hyperliquid"

export const generateStaticParams = () => COINS.map((market) => ({ market }))

export default async function Embed({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params
  if (!COINS.includes(market as Coin)) notFound()
  return (
    <main className="h-dvh p-1">
      <OrderBook market={market as Coin} />
    </main>
  )
}
