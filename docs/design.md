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

## Open design calls

- Row density. The example's 36.5 px rows fit 12 levels per side in a phone-sized panel. The feed gives 20 per side, so a desktop panel should fill its height.
- Price color. Binance colors prices by side, and the example keeps them white. Default to the example.
