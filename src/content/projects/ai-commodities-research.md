---
title: AI Commodities Research & Forecasting System
summary: >-
  An independently developed research system that has grown from equity analysis and valuation
  into energy-market research, report production and quantitative trading tools, built on shared
  data, modelling and review infrastructure.
homeSummary: >-
  From company research and valuation to energy-market reports and trading tools,
  built on shared data, modelling and review infrastructure.
kind: Independent project
start: 2026-07
visibility: public
featured: true
development:
  - label: Foundation
    title: Equity research
    text: Company analysis, financial forecasts, valuation and investment reports.
    section: equity-research-and-valuation
  - label: Specialisation
    title: Energy research
    text: Physical markets, inventory releases, supply disruptions and sourced energy reports.
    section: energy-research-and-reporting
  - label: Current development
    title: Trading analysis
    text: Forecast scoring, futures and options comparisons, backtesting and prospective paper tests.
    section: trading-research-and-evaluation
---

## Building the system

I began this project in July 2026 with a workflow for company research, financial forecasting and valuation. It developed into a broader energy-research system, connecting physical market analysis with scenarios, charts and written reports. The latest work adds tools to evaluate forecasts and compare how a market view could be expressed through futures and options.

Each stage builds on the previous one. The same infrastructure for sourcing evidence, checking calculations and producing research now supports company analysis, energy-market investigations and trading experiments.

I direct the research questions, workflow design, data selection and financial assumptions, using AI coding tools for implementation. I review the outputs and set the requirements for modelling, testing and presentation. Specialist AI workflows support research and drafting; a Python engine performs the financial calculations.

## Equity research and valuation

The original system structured the process from company evidence to an investment case: understanding the business, analysing financial statements, building forecasts, challenging the thesis and producing a report with supporting models.

- **Forecasting and scenarios.** Bull, base and bear cases connect operating assumptions to earnings, cash flow and valuation.
- **Valuation.** Discounted cash flow, relative valuation and sector-specific methods use a common forecast and explicit assumptions. The framework includes asset-based and residual-income methods where appropriate.
- **Portfolio research.** Additional modules compare candidate securities, assess concentration and correlation, and aggregate positions into portfolio scenarios.
- **Research production.** Investment reports, charts and formula-driven Excel workbooks are generated from the underlying financial outputs, with sources and calculations retained.

This work established the financial modelling and review framework that the energy and trading tools now use.

## Energy research and reporting

The next stage shifted the focus towards oil, natural gas, LNG, refining and the infrastructure connecting them. The research workflow brings together official releases, market observations and source-based analysis of supply, demand, inventories and transport constraints.

EIA inventory releases became a recurring test case: what changed, how it compares with the relevant baseline, which physical mechanism matters and what the implications could be for prices. Wider investigations cover issues such as refining bottlenecks, LNG feedgas demand and supply disruption.

The reporting workflow combines the evidence, physical-market analysis, scenarios, exhibits and conditions that would change a thesis. Supporting calculations and source records sit alongside the written work, so figures can be checked and the research updated consistently.

## Trading research and evaluation

The latest stage connects the research process to instrument selection, risk and evaluation.

- **Trade construction.** Compare outright futures, bought calls and puts, directional option spreads and dynamically hedged option positions. Analysis includes dollar exposure, Greeks, option premiums, transaction costs, downside, liquidity and sensitivity to volatility and forecast conviction.
- **Historical testing.** Price-based and EIA-event studies examine trading hypotheses after costs. Testing spans energy, equity-index and currency futures, with separate development and evaluation periods.
- **Prospective forecasts.** A dated record preserves the direction, probability, horizon and original terms of a forecast before its outcome. The current scoring protocol covers Brent and Henry Hub, comparing results with historical frequencies and volatility baselines.
- **Forward testing.** A crude-inventory hypothesis is frozen for evaluation on new releases, with a fixed rule and assessment point. Results are recorded as they arrive.

The current trade-comparison tools cover Brent, Henry Hub and WTI; options comparisons use energy ETFs as proxies where direct futures-option data is unavailable. The forecast record, historical studies and hypothetical trade comparisons remain separately identifiable.

## Shared infrastructure

Much of the work sits beneath the individual research outputs:

- **Data integration.** Company filings, market prices, EIA energy data, FRED/ALFRED economic series and CFTC positioning feed the relevant research workflows. Security identifiers, units, periods and timestamps are checked before data enters a model.
- **Evidence and reproducibility.** Saved source snapshots, citations, information cut-offs and versioned inputs allow an analysis to be traced and replayed. Revised inputs remain distinguishable from the original research record.
- **Financial modelling.** A deterministic Python calculation layer keeps forecasts, valuations, sensitivities and portfolio calculations consistent across reports and workbooks.
- **Research and review workflows.** Specialist research, modelling, thesis-challenge and audit roles operate within a structured workflow, with human review of key assumptions and conclusions.
- **Publication tools.** Report templates, chart generation and PDF, HTML and Excel outputs share underlying numerical records, supported by reconciliation and presentation checks.

## What comes next

The next phase extends prospective scoring to WTI and additional financial futures, develops longer forecast horizons, and adds calendar-spread and crack-spread analysis. These extensions are in development and will be assessed against their own data, contract and testing requirements before being included as working capabilities.

*Trading results are simulated. The system is used for research and paper testing, with no live execution.*
