import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

export const favoritesAtom = atomWithStorage<string[]>("fullstack:favorites", ["BTC", "ETH", "HYPE"])

export const toggleFavoriteAtom = atom(null, (get, set, coin: string) => {
  const favorites = get(favoritesAtom)
  set(favoritesAtom, favorites.includes(coin) ? favorites.filter((name) => name !== coin) : [...favorites, coin])
})
