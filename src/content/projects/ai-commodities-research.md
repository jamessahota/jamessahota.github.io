---
title: AI Commodities Research & Forecasting System
summary: >-
  A multi-agent research system that turns scheduled EIA releases into scenario forecasts and
  point-in-time backtests of hypothetical positions in energy futures, ETFs and equities, after
  transaction costs and risk controls.
homeSummary: >-
  A multi-agent system that turns EIA releases into scenario forecasts and backtests
  hypothetical energy positions after costs and risk controls.
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

I set the research questions, selected the data and defined the workflow, controls and evaluation rules. I used AI coding tools for implementation and reviewed the research outputs myself.

## Inputs

The test events are scheduled EIA petroleum inventory releases. Market, macroeconomic and inventory data inform scenarios across energy futures, exchange-traded funds and equities.

## Approach

The backtest follows four controls:

- **Point-in-time data.** Decisions use only information available at the time.
- **Deterministic calculations.** A Python engine performs the calculations. AI agents interpret the information and draft the research.
- **Costs and risk.** Transaction costs, position sizing and risk controls are applied to each US$100,000 simulated portfolio.
- **Human review.** I review the scope, uncertain sources and key assumptions before including them in the analysis.

## Output

The outputs are research reports and point-in-time backtests. Inputs, assumptions and calculations are recorded alongside each result to make the reasoning traceable. The figures above describe the scale of these simulations, not forecast accuracy or trading returns.

## Limitations

This remains an experimental research project. All results come from historical backtests in simulated portfolios. The system is not connected to a broker, does not execute trades and has not managed capital.
