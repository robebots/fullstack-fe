import { notifyManager, QueryClient } from "@tanstack/react-query"

notifyManager.setScheduler(queueMicrotask)

export const client = new QueryClient({ defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } } })
