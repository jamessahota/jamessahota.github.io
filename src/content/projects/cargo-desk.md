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

You start with 6,000 barrels of crude in a 10,000-barrel tank at Cushing, hedged with six short WTI futures. Each cycle is one trading day. You fill in a morning ticket, commit it and watch the session trade. If news lands at midday you get a shorter afternoon ticket before the market moves overnight.

- **Physical trades.** One order per ticket: buy, sell locally or, when a pipeline slot opens, ship to the Gulf Coast. Local bids and offers move around spot with events at the terminal, such as a refinery short of prompt crude or an outbound line down for maintenance.
- **Negotiation.** A local price is an opening price. You can ask the counterparty for more. They may agree, come back once with a counter, or walk away and close the route for the session.
- **Storage.** The tank costs a fixed lease whether it is full or empty. Clients pay per barrel to use it. Anything that does not fit, yours or theirs, needs overflow space booked off-site.
- **Hedging and the roll.** Four futures months trade on the ticket. Crude owned plus futures must stay within two lots of flat. The front month expires at the close of the fifth day, so the hedge has to be rolled into the next month.
- **The curve.** When futures sit above spot, hedged crude in the tank gains as the gap closes, so storing pays. When they sit below spot, the same position loses.
- **Events and the stocks report.** Some days an event is on watch for the coming night, with its odds and roughly what it would do to futures and to spot, and midday news can move those odds. The weekly stocks report lands at midday on both Wednesdays.
- **Shocks.** About one day in ten the market is hit by something nobody saw coming and prices move by several dollars. A shock that moves every price does nothing to a hedged book. One that moves spot hardest hits anyone holding crude.

The ticket is live. The tank drawing, the position gauge and the profit-and-loss estimate update as you change an order, so you can see what a ticket does before it is sent.

## Reading the result

After each ticket the desk explains the profit or loss: trade prices against spot, the whole curve moving on the net position, spot moving against futures, calendar spreads, client income and costs. The debrief adds these up over the run, grades the return against the largest fall along the way, and compares the result with simply holding the hedged cargo and never trading.

## Historical scenarios

From New run you can also play four real episodes on real prices: the two weeks in April 2020 when WTI settled below zero, the March 2020 price war, the weeks after Russia invaded Ukraine in 2022, and the attack on Abqaiq in September 2019. Each is ten real trading days. Every morning you get a briefing on what was known at the time, and every evening the day's actual settlement.

The prices are the U.S. Energy Information Administration's daily series for the Cushing WTI spot price and the first four NYMEX futures contracts. The bids and offers around spot, the clients, the storage rates and the counterparties are still the game's own, tuned to suit each period. Scenarios are practice runs: the outcome is a matter of record, so they are not ranked.

## Ranked and practice runs

A market is generated from a seed, and its prices are the same every time that seed is played. Only the first play of a fresh random market is ranked on the leaderboard. Typing in a seed, or replaying one already seen, is a practice run. Scores are kept in your own browser and are not shared.

## Limits of the model

Outside the historical scenarios, all prices, bids and events are simulated. The price moves, event odds, shock sizes, storage rates and client fees are set for a short game and are not calibrated to market data. In a scenario the daily settlement prices are real, but the path a price takes within a day on the animated tape is drawn for effect. Futures have no margin, the expiring month settles in cash at spot and not by delivery, and the terminal is a single tank. The counterparties are invented. It is a game about the trade-offs of a physical book and not a forecast or a trading tool.

## How it was built

I directed the project and used AI coding tools, Codex and Claude Code, for the design detail and the implementation. The rules run in a separate engine that is tested by playing thousands of simulated days of random orders and checking that the accounting always reconciles.
