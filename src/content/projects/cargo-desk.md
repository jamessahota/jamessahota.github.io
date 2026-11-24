---
title: Cargo Desk
summary: >-
  A browser game about running a physical crude oil book at Cushing. Ten trading days with one
  tank, a hedged cargo, clients who want storage and a delivery calendar. Play generated markets
  or replay seven historical episodes.
homeSummary: >-
  Run a hedged crude book at Cushing. Manage tank space, trade WTI futures and book deliveries
  across seven historical scenarios using EIA prices.
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
  - value: "±8 lots"
    label: Net position limit in ranked runs
---

## What the game models

You start with 6,000 barrels of crude in a 10,000-barrel tank at Cushing, hedged with six short WTI futures. Each cycle is one trading day. You fill in a morning ticket, commit it and watch the session trade. If news lands at midday you get a shorter afternoon ticket before the market moves overnight.

- **Physical trades.** One order per ticket: buy, sell locally or, when a pipeline slot opens, ship to the Gulf Coast. Local bids and offers move around spot with events at the terminal, such as a refinery short of prompt crude or an outbound line down for maintenance.
- **Forward delivery.** On a morning ticket, book a local sale or Gulf delivery for a later cycle. Your chosen WTI quote and the route basis fix the price. The calendar reserves the barrels and storage through delivery, and shows the route tariff and the margin against current spot after costs. Futures still trade on the ticket for the remaining open exposure.
- **Negotiation.** A local price is an opening price. You can ask the counterparty for more. They may agree, come back once with a counter, or walk away and close the route for the session. An emergency bid can clear an existing overflow shortfall after a local buyer walks.
- **Storage.** The tank costs a fixed lease whether it is full or empty. Clients pay per barrel to use it. Anything that does not fit, yours or theirs, needs overflow space booked off-site.
- **Hedging and the roll.** Four futures months trade on the ticket, with a 20-lot gross cap across all months. Ranked runs cap the combined exposure from uncommitted crude and futures at eight net lots long or short. Practice runs, including historical scenarios, have no net cap. The first month expires at the close of the fifth day in generated markets. Historical scenarios use their own expiry dates. The hedge shortcut adjusts within the limits for the run.
- **The curve.** When futures trade above spot (contango), the spread can make it worthwhile to store hedged crude if it covers tank rent, fees and the cost of getting the crude to a buyer.
- **Events and the stocks report.** Some days an event is on watch for the coming night, with its odds and roughly what it would do to futures and to spot, and midday news can move those odds. The weekly stocks report lands at midday on both Wednesdays.
- **Shocks.** About one day in ten the market is hit by something nobody saw coming and prices move by several dollars. A shock that moves every price does nothing to a hedged book. One that moves spot hardest hits anyone holding crude.

The ticket is live, and parts you are not using stay folded away. Dragging the tank handle drafts the physical order and shows the volume beside the tank. The tank drawing, the position gauge and the profit-and-loss estimate update as you change an order, so you can see what a ticket does before it is sent.

## Reading the result

After each ticket the desk explains the profit or loss: trade prices against spot, the whole curve moving on the net position, spot moving against futures, calendar spreads, client income and costs. The debrief adds these up over the run, grades the return against the largest fall along the way, and compares the result with simply holding the hedged cargo and never trading.

## Historical scenarios

Open **Historical scenarios** to play seven episodes using real prices: the two weeks in April 2020 when WTI settled below zero, the March 2020 price war, the weeks after Russia invaded Ukraine in 2022, the attack on Abqaiq in September 2019, the Lehman week of September 2008 with its record squeeze on the expiring contract, OPEC’s decision not to cut output in November 2014, and Hurricane Harvey in 2017. Each is ten real trading days. Every morning you get a briefing on what was known at the time, and the day's closing marks after you commit.

Trading marks use the U.S. Energy Information Administration’s daily Cushing spot and NYMEX WTI futures series. Where a settlement is unavailable, the displayed estimate is view-only. The bids and offers around spot, the clients, the storage rates and the counterparties are still the game's own, tuned to suit each period. Scenarios are practice runs: the outcome is a matter of record, so they are not ranked.

## Ranked and practice runs

A market is generated from a seed, and its prices are the same every time that seed is played. Only the first play of a fresh random market is ranked on the leaderboard. Typing in a seed, or replaying one already seen, is a practice run. Scores are kept in your own browser and are not shared.

## Weekly challenge

Everyone plays the same ten-cycle market for the week using the ranked net limit in effect when it opens. After settlement, you can publish your username, final P&L and drawdown. The shared board ranks by P&L and breaks ties by lower drawdown. A new market opens every Monday at 00:00 UTC.

## Limits of the model

Outside the historical scenarios, all prices, bids and events are simulated. The price moves, event odds, shock sizes, storage rates and client fees are set for a short game and are not calibrated to market data. In a scenario the daily trading marks follow recorded prices. The tape animates between those closes for effect. Futures have no margin, the expiring month settles in cash at spot in generated markets and at the recorded expiry settlement in historical markets, and the terminal is a single tank. The counterparties are invented. It is a game about the trade-offs of a physical book and not a forecast or a trading tool.

## How it was built

I directed the project and used AI coding tools, Codex and Claude Code, for the design detail and the implementation. The rules run in a separate engine that is tested by playing thousands of simulated days of random orders and checking that the accounting always reconciles.
