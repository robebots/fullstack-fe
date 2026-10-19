import { OrderBook } from "@/components/order-book"

export default async function Embed({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params
  return (
    <main className="h-svh bg-background p-1">
      <OrderBook market={decodeURIComponent(market)} />
    </main>
  )
}
