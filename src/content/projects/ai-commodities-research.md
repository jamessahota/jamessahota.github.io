---
title: AI Commodities Research & Forecasting System
summary: >-
  A research system that uses AI agents to analyse scheduled energy data releases, develop
  scenario forecasts and test hypothetical positions after transaction costs.
kind: Independent project
start: 2026-07
visibility: public
featured: true
facts:
  - value: "35"
    label: Historical EIA releases tested
  - value: "15"
    label: Instrument baskets tested
  - value: US$100,000
    label: Simulated capital per portfolio
factsNote: All results are simulated. The project does not manage capital or execute trades.
---

## Research question

Scheduled energy-data releases can move prices within hours. This project asks whether a structured research process can translate those releases into useful forecasts and hypothetical positions after transaction costs. I use the petroleum inventory reports published by the US Energy Information Administration (EIA) as the test case.

## My role

I designed the research questions, selected the data and set the workflow, controls and evaluation rules. I used AI coding tools to build the system and reviewed the research outputs myself.

## Inputs

The system combines market, macroeconomic and inventory data to test event-driven scenarios across energy futures, exchange-traded funds and equities. The backtest covers 35 historical EIA releases and 15 instrument baskets.

## Approach

AI agents handle four stages of the research process:

1. **Data.** Collect the release and related data, preserving when each item became available.
2. **Analysis.** Compare the release with market expectations and explain how any difference could affect prices.
3. **Forecasts.** Develop scenario forecasts with explicit assumptions.
4. **Backtesting.** Build hypothetical positions and test them against historical prices after transaction costs.

Four controls govern the backtest:

- **Point-in-time data.** Each decision uses only information that would have been available when it was made.
- **Calculations in code.** A deterministic Python engine performs the calculations. The AI agents interpret the information and draft the research.
- **Costs and risk.** The backtest applies transaction costs, position sizing and risk controls to each US$100,000 paper portfolio.
- **Human review.** I review the scope, uncertain sources and key assumptions before they enter the analysis.

## Output

The system produces point-in-time backtests and research reports, with the inputs, assumptions and calculations recorded alongside each result. That record makes the analysis traceable and reproducible.

## Limitations

This remains an experimental research project. All results come from historical backtests in simulated portfolios. The system is not connected to a broker, does not execute trades and has not managed capital.
