import { useSyncExternalStore } from "react"
import { feed, type Status } from "./feed"

export const useFeedStatus = () =>
  useSyncExternalStore(
    (onChange) => feed.onStatus(onChange),
    () => feed.status,
    (): Status => "connecting",
  )
