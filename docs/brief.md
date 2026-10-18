# Brief

Fullstack's frontend take-home, as sent. Rob shared it on 2026-10-18. The example image it mentions is [reference/example-orderbook.png](reference/example-orderbook.png).

```text
Fullstack Frontend Take Home

We would like you to build an orderbook widget from a live websocket feed from Hyperliquid.

An example of a finished product might look something like below. Please use the same/similar colors/theme as in this example. Primarily we are looking for good style and liveness, as well as a demonstrated understanding of what makes a good orderbook display for traders.


Examples:
* Examples of existing trading platforms
    * https://app.hyperliquid.xyz/trade/BTC,
    * https://www.binance.com/en/trade/BTC_USDT?type=spot,
    * https://www.bybit.com/trade/usdt/BTCUSDT

Priorities 
* Liveness: the widget should be dynamically updating with new websocket updates
* Smoothness: the orderbook should move smoothly and be pleasant to look at. Prices can move both very fast and slow and the widget should feel fluid and alive in both.
* Readability: a user should be able to clearly see the current prices and have feedback mechanisms to know what is changing.
* Information: Order books give subtle information using more than just text, make sure to pay attention to this as well as add your own ideas.
Websocket endpoint: 
* Listen to the websocket for the l2Book at https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions
Guidelines:
* Time duration: 3 days
* Support for 2 symbols that can be selected through a drop down, ETH  and BTC
* The websocket endpoint has another parameter which is nSigFigs, this will adjust the precision that the prices are returned at, make sure there is a drop down to select/change this value.
* Live demo webpage containing the widget that can be shared.
* Code should be committed and shared to github/gitlab.
* Given what is possible with AI tooling we know what can be done with less than 5 minutes and 2-3 prompts, it's for you to go above and beyond that bar.
* Performance is important, excessive re-renders should be avoided.
* Ideally the widget should be written in react/nextjs.
```
