---
title: AI Commodities Research & Forecasting System
summary: >-
  An AI-assisted research system combining cross-market backtesting, prospective energy forecasts
  and analysis of hypothetical futures and options trades, including costs, sizing and risk.
homeSummary: >-
  Combines cross-market backtesting with energy forecasts and analysis of hypothetical
  futures and options trades, including costs, sizing and risk.
kind: Independent project
start: 2026-07
visibility: public
featured: true
---

## Research question

Can an energy-market view become a worthwhile trade after costs, and does the forecast add information beyond a simple baseline? The project brings together historical testing, a prospective forecast record and comparisons of different ways to express a view.

## My role

I set the research questions, select the data and define the workflow, assumptions and evaluation rules. I use AI coding tools for implementation and review the research outputs myself. A Python engine performs the calculations.

## Approach

Historical testing spans energy, equity-index and currency futures. The prospective forecast record currently focuses on Brent and Henry Hub, while the trade-comparison tools also cover WTI.

- **Record the view first.** Brent and Henry Hub forecasts specify a direction, probability and 24-hour window before the outcome. They are scored against historical frequencies and two volatility baselines, with the original declaration preserved.
- **Compare the expression.** Analyse outright futures, bought calls and puts, directional option spreads and dynamically hedged option positions. Comparisons include dollar exposure, option sensitivities (Greeks), costs, downside and liquidity, with tests of volatility and the conviction needed to break even. Options comparisons currently use energy ETFs as proxies for futures.
- **Test beyond the original sample.** Historical studies examine price-based rules and reactions to EIA inventory releases. A reversed crude-inventory rule is frozen for a prospective paper test over 40 new WTI trades, with Brent tracked alongside it.

## What the testing shows

Historical testing has not established a trading edge. Rules that initially looked promising did not hold up in further tests; the crude-inventory reversal remains a hypothesis for forward testing.

The trade comparisons also show why a directional view is only the starting point. The same view can produce very different results through futures, bought options or spreads. Costs, option premiums and the relationship between the futures and its ETF proxy can change which expression looks attractive.

## Current status

The forecast record is at an early stage; it does not yet establish forecasting skill. Simulated profits depend on the assumed probability and price behaviour, rather than demonstrating that those assumptions are correct.

Trade comparisons use delayed data and reference trades rather than executable quotes. Pricing, proxy and liquidity checks identify comparisons that are unsuitable for use. This is a research and paper-testing system: it does not execute trades or manage capital.
