"use client"

import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Provider } from "jotai"
import { type ReactNode, useState } from "react"

notifyManager.setScheduler(queueMicrotask)

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <Provider>{children}</Provider>
    </QueryClientProvider>
  )
}
