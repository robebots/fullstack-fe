import type { Metadata } from "next"
import { Inter } from "next/font/google"
import type { ReactNode } from "react"
import { Providers } from "./providers"
import "./globals.css"

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Order book",
  description: "Live Hyperliquid order book for BTC and ETH",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} antialiased`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
