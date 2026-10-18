import type { Metadata } from "next"
import { Funnel_Sans } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"

const funnel = Funnel_Sans({ variable: "--font-funnel", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Fullstack | Trade",
  description: "Live order book and market search on Hyperliquid perps, in Fullstack's trading layout",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${funnel.variable} antialiased`}>
      <body>{children}</body>
    </html>
  )
}
