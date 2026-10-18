# Design reference

Everything here comes from [reference/example-orderbook.png](reference/example-orderbook.png), the screenshot attached to the brief. It is 418×1222 px. The colors are sampled pixel values.

The example runs on placeholder data. Every row reads 105,533 / 0.00151 / 5.12351 and the spread row reads 0.00151 / 3.35%, so take look and layout from it and nothing else.

## Palette

| Token | Hex | Used for |
|---|---|---|
| `canvas` | `#444444` | Background around the cards. This may be the screenshot frame rather than the page. |
| `border` | `#404040` | 1 px card edge |
| `surface` | `#171717` | Header card, panel, row background |
| `surface-raised` | `#262626` | Spread row, leverage chip |
| `ask-bar` | `#361c1b` | Ask depth bars |
| `bid-bar` | `#213931` | Bid depth bars |
| `accent` | `#e25727` | Active tab underline |
| `text` | `#ffffff` | Prices, sizes, totals, active tab, active unit |
| `text-muted` | `#a1a1a1` | Column headers, inactive tab, "Perpetuals", footer controls |
| `text-spread` | `#929292` | Spread label and percentage. The glyphs are thin, so this may be `text-muted` after anti-aliasing. |

The grays are Tailwind v4's neutral scale, exactly. 900 is `#171717`, 800 is `#262626`, 700 is `#404040` and 400 is `#a1a1a1`. Stock Tailwind tokens cover the theme.

Both bar colors fit a red and a mint green at about 14% alpha over `#171717`. Defining them as alpha overlays lets hover and flash states raise the alpha instead of adding hex values.

## Layout, top to bottom

1. Header card with the coin icon, `BTC-USD` over `Perpetuals`, a `10×` leverage chip and a menu icon.
2. Section title `Orders`, sitting on the canvas.
3. The panel:
   - `Orders` and `Trades` tabs. The active tab is white with the accent underline.
   - Column headers `Price`, `Size (BTC)`, `Total (BTC)`.
   - 12 ask rows. The worst price is on top and the best ask sits against the spread row.
   - Spread row with a label, the spread value and a percentage.
   - 12 bid rows, best bid on top.
   - Footer with a precision control `0.1 ^` on the left and a `USD` / `BTC` unit toggle on the right.

At the screenshot's scale the row pitch is about 36.5 px, bars are 28 px tall and gaps are 8 px.

## What the example implies

- Bars show cumulative depth. They grow from the left edge, and the deepest row is the widest, so the top of the asks and the bottom of the bids carry the longest bars.
- Every number is white. Side reads from bar color alone.
- The precision control shows a tick size such as `0.1`. It never shows an nSigFigs number.
- The unit toggle switches size and total between the coin and USD.
- The `Trades` tab means a trades view lives next to the book.

## Measured layout at 1x

| Element | Mock |
|---|---|
| Canvas | `#444444`, cards 379 px wide |
| Header card | 80 px tall. 36 px coin icon at 22 px from the left. Pair name at 22 px, "Perpetuals" at 15 px. Leverage chip 35 px tall on `#262626`, showing Hyperliquid's real max leverage (40× BTC, 25× ETH) instead of the mock's placeholder 10×. Menu icon at the right. |
| Section title | "Orders", 22 px, `#ababab`, between the cards |
| Tabs | 52 px tall, two halves, labels at 17 px, a 3 px `#e25727` underline 9 px wider than the label on each side |
| Column header | 56 px tall, 13 px text. Price at 20 px, Size left-aligned at 164 px, Total right-aligned 16 px from the edge. |
| Rows | 36.5 px pitch, 28 px bars inset 4 px, 16 px white text |
| Spread row | 35 px on `#262626`. Label and percentage grey, value white. |
| Footer | 56 px, 16 px text. Precision with a chevron on the left, USD and coin as plain text on the right, active one white. |
| Type | Inter. It matched the mock's text proportions within 2%, closer than nine other fonts we tested. |

The live widget sits within 1 to 5 px of these numbers, measured from a 1x screenshot at 418 x 1222.

## Desktop, 1024 px and up

Mobile follows the mock and comes first. From 1024 px up, the same components switch to Hyperliquid's desktop book, measured live at 1600 x 1000 and 1280 x 800:

| Element | Hyperliquid | Ours |
|---|---|---|
| Panel | 296 x 674 px column | 296 px wide, 673 px tall |
| Tabs | 42 px row, 12 px labels, full-width underline | same |
| Controls | precision and unit in a 31 px row under the tabs | same row, moved with CSS `order` |
| Column header | 12 px grey, Size and Total right-aligned | same |
| Rows | 23 px, columns 20% / 40% / 40%, 10 px side padding, full-height bars | same |
| Spread | centered "Spread 1 0.001%" in a 23 px row | same |
| Header | market bar | the mock's header card, compacted to 56 px |

The colors stay the mock's on desktop too. The section title hides on desktop because Hyperliquid's panel has none.
