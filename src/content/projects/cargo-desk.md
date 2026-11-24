---
title: Cargo Desk
summary: >-
  A browser game about running a physical crude oil book at Cushing. Ten trading days with one
  tank, a hedged cargo, clients who want storage and a desk limit, played on simulated prices.
homeSummary: >-
  A browser game about running a physical crude oil book at Cushing: one tank, a hedged cargo,
  clients who want storage and a desk limit.
kind: Trading game
start: 2026-11
end: 2026-11
visibility: public
game: cargo-desk
facts:
  - value: "10"
    label: Trading days in a run
  - value: "10,000 bbl"
    label: Tank capacity
  - value: "±2 lots"
    label: Desk limit on crude plus futures, where one lot is 1,000 barrels
---

## What the game models

You start with 6,000 barrels of crude in a 10,000-barrel tank at Cushing, hedged with six short WTI futures. Each cycle is one trading day. You fill in one order ticket, commit it, and the market moves before the next day opens.

- **Physical trades.** One order a day: buy, sell locally or, when a pipeline slot opens, ship to the Gulf Coast. Local bids and offers move around spot with events at the terminal, such as a refinery short of prompt crude or an outbound line down for maintenance.
- **Storage.** The tank costs a fixed lease whether it is full or empty. Clients pay per barrel to use it. Anything that does not fit, yours or theirs, needs overflow space booked off-site.
- **Hedging.** Four futures months trade on the ticket. Crude owned plus futures must stay within two lots of flat, so selling barrels means buying back futures on the same ticket.
- **The curve.** When futures sit above spot, hedged crude in the tank gains as the gap closes, so storing pays. When they sit below spot, the same position loses.
- **Events on watch.** Some days an event is flagged for tomorrow, such as a pipeline repair or a producers' meeting, with its odds and roughly what it would do to futures and to spot. The ticket shows what your book would make or lose each way before you commit.
- **Shocks.** About one day in ten the market is hit by something nobody saw coming and prices move by several dollars. A shock that moves every price does nothing to a hedged book. One that moves spot hardest hits anyone holding crude.

The order ticket is live. The tank drawing, the position gauge and the profit-and-loss estimate all update as you change an order, so you can see what a ticket does before it is sent.

## Ranked and practice runs

A market is generated from a seed, and its prices are the same every time that seed is played. Only the first play of a fresh random market is ranked on the leaderboard. Typing in a seed, or replaying one already seen, is a practice run. Scores are kept in your own browser and are not shared.

## Limits of the model

All prices, bids and events are simulated. The price moves, event odds, shock sizes, storage rates and client fees are set for a short game and are not calibrated to market data. Futures have no margin, expiry or roll, and the terminal is a single tank. It is a game about the trade-offs of a physical book and not a forecast or a trading tool.

## How it was built

I directed the project and used AI coding tools, Codex and Claude Code, for the design detail and the implementation. The rules run in a separate engine that is tested by playing thousands of simulated days of random orders and checking that the accounting always reconciles.
