# Design

The page is Hyperliquid's trade layout in Fullstack's brand. The brief points to Hyperliquid's design as the bar, and Fullstack's own trading app isn't public yet, so the brand comes from [fullstack.trade](https://www.fullstack.trade/) and the structure from [app.hyperliquid.xyz](https://app.hyperliquid.xyz/trade/BTC).

The brief's screenshot, [reference/example-orderbook.png](reference/example-orderbook.png), is a phone component from Fullstack's app. The first build matched it within 2 px. That version and its measurements are in git history before commit b795c33. Its lessons carried over: the PNG is tagged Display P3, so colors have to be converted to sRGB before sampling, and right-aligned numbers need tabular digits.

## Brand, from fullstack.trade

| Token | Value | Used for |
|---|---|---|
| Font | Funnel Sans | everything, with tabular digits in numbers |
| `background` | `#000000` | page |
| `panel` | `#0d0f13` | every panel |
| `line` | `#1a1e24` | rules, tab bars, the spread row, chips |
| `accent` | `#303740` | hover fills, card borders |
| `foreground` | `#eaecee` | text |
| `muted-foreground` | `#7e8a99` | labels |
| `primary` | `#eb8c52` | the logo, tab underlines, Connect, leverage chips, links, focus |
| Radius | 3 px | panels and controls, their `--cell-rounded` |
| Logo | three-stripe mark plus a tracked FULLSTACK wordmark | nav |

Fullstack's site sets these as CSS variables (`--steel-100` to `--steel-800`, `--primary`, `--panel-background`, `--cell-rounded`), read from its stylesheet.

## Trading colors, from Hyperliquid

| Token | Value |
|---|---|
| `bid` | `#1fa67d` |
| `ask` | `#ed7088` |
| `bid-bar` | `#0f2c24` |
| `ask-bar` | `#33191f` |

Bars use the bar colors. The wall layer is the side color at 20%, the flash the side color at 0.08 to 0.35, and the hover tint white at 4% with a dashed edge in the muted color.

## Desktop, 1024 px and up

| Area | Layout |
|---|---|
| Nav | 50 px: logo, Trade, Markets, Portfolio, Rewards, Leaderboard, More, then Connect, language and settings |
| Favorites | 32 px strip of starred markets with leverage and 24h change |
| Market bar | 56 px: coin icon, pair with a chevron that opens search, max leverage, Mark, Oracle, 24h Change, 24h Volume, Open Interest, Funding / Countdown |
| Chart | Chart and Funding tabs, a toolbar, a gridded placeholder |
| Book | 296 px column, 592 px in Large mode. 40 px tab bar with ⋮, a 32 px controls row (precision, unit), 24 px column headers, rows from 23 px, a 24 px centered spread row |
| Order ticket | 296 px: Cross, leverage and Unified chips, Market, Limit and Pro tabs, Buy / Long and Sell / Short, price with Mid, size, a slider, two checkboxes, Enable Trading, a summary |
| Account | 240 px: Balances, Positions, Open Orders, TWAP, Trade History, Funding History and Order History tabs over a positions table |
| Footer | 28 px: connection pill, then Docs, Support, Terms and Privacy Policy |

Panels sit 4 px apart on the black page.

## Mobile, below 1024 px

Hyperliquid's mobile view: a compact nav with a menu button and the logo mark, a market bar with price and 24h change that expands to the full stats, page tabs for Chart, Order Book, Trades and Funding, the book side by side in a 480 px panel, then the account tabs and the footer. Search opens full screen with two-line rows: volume over open interest, price over 24h change.

## Book details

- Columns are 30% / 35% / 35% with 10 px side padding. Price takes its side's color. Size and total are right-aligned.
- Split rows put total and price on the bid half, price and total on the ask half, with each bar growing out from the center.
- The hover card is 216 by 104 px on `popover` with an `accent` border, placed left of the widget, or right when there's no room.
- The tap strip appears under the book on touch only.
- Trades end in a small external-link icon in `primary`.

## Search

| Element | Look |
|---|---|
| Panel | 1180 px wide at most, 112 px from the top, up to 640 px tall. Full screen on mobile. |
| Header | a search field with a magnifier, and a Strict / All toggle with the active side in `primary` |
| Tabs | All, Perps, Spot, Outcome, Crypto, Tradfi, HIP-3, HIP-4, Trending, with a `primary` underline |
| Columns | Market, Last Price, 24h Change, 8h Funding, Volume, Open Interest. The sorted column shows a chevron. |
| Row | star, coin icon, pair, leverage chip, and a delisted tag when it applies. The keyboard row gets a `line` fill. |
| Footer | key hints: ⌘K Open, ↑↓ Navigate, Enter Select, ⌘S Favorite, Esc Close |
