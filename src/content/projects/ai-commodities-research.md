---
title: AI Commodities Research & Forecasting System
summary: >-
  An independent project testing AI-assisted forecasts and hypothetical positions around
  scheduled energy data releases, with transaction costs included. All results are simulated.
kind: Independent project
start: 2026-07
visibility: public
featured: true
facts:
  - value: "35"
    label: Historical EIA releases in the backtest
  - value: "15"
    label: Instrument baskets in the backtest
  - value: US$100,000
    label: Size of each paper portfolio. No capital has been managed
factsNote: Backtested on historical data. Simulated results are not evidence of live performance.
---

## The problem

Scheduled data releases can move energy prices within hours. The petroleum inventory reports published by the US Energy Information Administration (EIA) are a clear example. I wanted to test, under strict rules, whether a structured research process could turn an event like that into a forecast and a hypothetical position, and whether anything would be left after transaction costs.

## My role

This is an independent project. I designed the research questions, workflow, controls and evaluation rules, selected the data, and reviewed the outputs. I used AI coding tools to build the system.

## Inputs

The system integrates market, macroeconomic and inventory data to model event-driven opportunities across energy futures, exchange-traded funds and equities. The backtest covers 35 historical EIA releases and 15 instrument baskets.

## Approach

The system is organised as a sequence of separate roles, each handled by its own agent:

1. **Information.** Gather the release and related data, and record when each item became available.
2. **Interpretation.** Compare the release with what the market expected and identify the mechanism by which it should matter.
3. **Forecasting.** Produce scenario forecasts with explicit assumptions.
4. **Evaluation.** Build a hypothetical position and test it against historical prices.

Four design choices matter more than the tools:

- **Point-in-time data.** A decision may only use information that was available at the moment it would have been made. Without that rule a backtest uses information from the future and its results mean nothing.
- **Calculations stay in code.** A deterministic Python engine is the authority for every number. The language models interpret and draft; they do not calculate results.
- **Costs and risk are included.** The backtests apply transaction costs, position sizing and risk controls within paper portfolios of US$100,000.
- **Human approval.** Scope, uncertain sources and key assumptions pass through review before they are used.

## Output

The output is a set of point-in-time backtests and research reports, each with a record of its inputs, assumptions and calculations so that a result can be traced and reproduced.

## Limitations

All results are simulated. The portfolios are paper portfolios: no capital has been managed, and the system has no connection to a broker and places no trades.

The work is experimental. It has not established a trading edge, and I am not publishing performance figures, because backtested results are easy to over-read. The sample is one type of event over a limited history, and a backtest cannot fully capture liquidity, financing or execution in a live market.
