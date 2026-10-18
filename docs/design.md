# Design reference

Everything here comes from [reference/example-orderbook.png](reference/example-orderbook.png), the screenshot attached to the brief. It is 418×1222 px.

The PNG is a Mac screenshot tagged with a Display P3 profile, so its raw pixel values are not sRGB. Color-managed viewers convert them, and a saturated color like the tab underline reads `#e25a29` raw but `#f5540e` on screen. Every color below is converted to sRGB with the embedded profile first. Grays come out the same either way.

The example runs on placeholder data. Every row reads 105,533 / 0.00151 / 5.12351 and the spread row reads 0.00151 / 3.35%, so take look and layout from it and nothing else.

## Palette

| Token | Hex | Used for |
|---|---|---|
| `canvas` | `#444444` | Background around the cards |
| `border` | `#404040` | 1 px card edge, dotted rule under the tabs |
| `surface` | `#171717` | Header card, panel, row background |
| `surface-raised` | `#262626` | Spread row, leverage chip |
| `ask-bar` | `#3a1a1a` | Ask depth bars |
| `bid-bar` | `#183a31` | Bid depth bars |
| `accent` | `#f5540e` | Active tab underline |
| `coin` | `#f7931a` | Bitcoin mark |
| `text` | `#ffffff` | Prices, sizes, totals, active tab, active unit |
| `text-chip` | `#d4d4d4` | Leverage chip |
| `text-title` | `#ababab` | Section title |
| `text-muted` | `#a1a1a1` | Column headers, inactive tab, "Perpetuals", footer controls |
| `text-spread` | `#929292` | Spread label and percentage |
| `icon-muted` | `#525252` | Menu icon, precision chevron |

The grays are Tailwind v4's neutral scale: 900 is `#171717`, 800 `#262626`, 700 `#404040`, 600 `#525252`, 400 `#a1a1a1` and 300 `#d4d4d4`.

## Layout, top to bottom

1. Header card with the coin icon, `BTC-USD` over `Perpetuals`, a `10×` leverage chip and a menu icon.
2. Section title `Orders`, sitting on the canvas.
3. The panel:
   - `Orders` and `Trades` tabs over a dotted rule. The active tab is white with the accent underline sitting on the rule.
   - Column headers `Price`, `Size (BTC)`, `Total (BTC)`.
   - 12 ask rows. The worst price is on top and the best ask sits against the spread row.
   - Spread row with a label, the spread value and a percentage.
   - 12 bid rows, best bid on top.
   - Footer with a precision control `0.1 ^` on the left and a `USD` / `BTC` unit toggle on the right.

## What the example implies

- Bars show cumulative depth. They grow from the left edge, and the deepest row is the widest, so the top of the asks and the bottom of the bids carry the longest bars.
- Every number is white. Side reads from bar color alone.
- The precision control shows a tick size such as `0.1`. It never shows an nSigFigs number.
- The unit toggle switches size and total between the coin and USD.
- The `Trades` tab means a trades view lives next to the book.

## Measured layout at 1x

| Element | Mock |
|---|---|
| Canvas | `#444444`, cards 379 px wide, panel running to the bottom edge |
| Header card | 80 px tall, content 2 px above center. 36 px Bitcoin mark at 22 px from the left. Pair name at 22 px, "Perpetuals" at 16 px. Leverage chip 35 px tall, `10` at 16 px with a 12 px `×`. Menu icon of three 20 px lines, 2 px thick and 6 px apart, 18 px right of the chip. The chip shows Hyperliquid's real max leverage (40× BTC, 25× ETH) instead of the placeholder 10×. |
| Section title | "Orders", 22 px |
| Tabs | 52 px tall, labels at 17 px. The inactive label sits 3 px lower than the active one. A 3 px underline 10 px wider than the label on each side, sitting on a 1 px dotted rule. |
| Column header | 56 px tall, 13.5 px text, labels 3.5 px below center. Price at 20 px, Size left-aligned at 164 px, Total right-aligned 16 px from the edge. |
| Rows | 36.45 px pitch, 28 px bars inset 4 px, 16 px white text. Price and size use proportional digits. Totals are spaced 0.05em wider. |
| Spread row | 35 px with 1.5 px above and below. Label and percentage at 15 px, value at 16 px. |
| Footer | 52 px, text 2 px below center. Precision with tabular digits, so its `1` has a foot. |
| Type | Inter. It matched the mock's text proportions within 2%, closer than nine other fonts we tested. |

Rendered with the mock's own placeholder data at 418 x 1222, the widget fits 12 rows a side like the mock, and every measured text box, bar and rule sits within 2 px of it. The whole card sits 3 px further right, because ours is centered and the mock's isn't.

## Desktop: mouse and trackpad

Mobile follows the mock and comes first. On a fine pointer (`pointer-fine:`), the same components switch to Hyperliquid's desktop book, measured live at 1600 x 1000 and 1280 x 800:

| Element | Hyperliquid | Ours |
|---|---|---|
| Panel | 296 x 674 px column | 296 px wide. The demo gives each widget 760 px with its header. |
| Tabs | 42 px row, 12 px labels, full-width underline | same |
| Controls | precision and unit in a 31 px row under the tabs | same row, moved with CSS `order` |
| Column header | 12 px grey, Size and Total right-aligned | same |
| Rows | 23 px, columns 20% / 40% / 40%, 10 px side padding, full-height bars | same, with the pitch fitted to the height in whole pixels so touching bars never leave a seam |
| Spread | centered "Spread 1 0.001%" in a 23 px row | same |
| Header | market bar | the mock's header card, compacted to 56 px, with the last price and a market chevron |

The colors stay the mock's on desktop too. The section title hides on desktop because Hyperliquid's panel has none.

## Added to the mock

These carry the colors the mock already uses.

| Element | Look |
|---|---|
| Wall layer | inside each depth bar, the level's own size in the side color at 20% |
| Imbalance line | 2 px under the spread row, bid share in the bid color at 80% over the ask color at 60% |
| Flash | the side color, peak opacity 0.08 to 0.35 by size change |
| Tapped level | white at 15% over the row, levels the sweep eats at 7% |
| Fill price | replaces the footer controls while a level is tapped: side in its color, size and average in white, the rest grey, and a close button |
| Last price | in the header next to the leverage chip, green after a market buy and red after a market sell |
| Market picker | the pair name and the menu icon both open it. The chevron only shows on desktop, since the mock has none. |
