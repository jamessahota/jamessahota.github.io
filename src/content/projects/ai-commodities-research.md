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

<aside id="caterpillar-example" class="sample-output" aria-labelledby="caterpillar-example-title">
  <p class="sample-output__meta">Equity workflow · 18 November 2026</p>
  <h3 id="caterpillar-example-title">Example output: Caterpillar</h3>
  <p class="sample-output__description">A demonstration of the equity workflow, with operating forecasts, separate industrial and finance valuations, and a formula-driven Excel model.</p>
  <div class="sample-output__actions">
    <a class="btn btn--primary" href="/reports/caterpillar-equity-research.pdf"><span>Read report</span></a>
    <a class="btn btn--secondary" href="/models/caterpillar-equity-model.xlsx" download><span>Download model</span></a>
  </div>
</aside>

## Energy research and reporting

The next stage shifted the focus towards oil, natural gas, LNG, refining and the infrastructure connecting them. The research workflow brings together official releases, market observations and source-based analysis of supply, demand, inventories and transport constraints.

EIA inventory releases became a recurring test case: what changed, how it compares with the relevant baseline, which physical mechanism matters and what the implications could be for prices. Wider investigations cover issues such as refining bottlenecks, LNG feedgas demand and supply disruption.

The reporting workflow combines the evidence, physical-market analysis, scenarios, exhibits and conditions that would change a thesis. Supporting calculations and source records sit alongside the written work, so figures can be checked and the research updated consistently.

## Trading research and evaluation

The trading tools let me compare ways to express a market view and test what happens after the signal.

- **Trade construction.** Compare outright futures, calendar spreads and refining crack spreads by dollar exposure, margin and historical risk. Options scenarios use ETF proxies where direct futures-option data are unavailable.
- **Historical testing.** Replay fixed rules on dated contracts, record why any release was skipped, and compare the result with a benchmark on the same dates.
- **Forecast scoring.** Log the direction, probability and horizon before the outcome, then compare the forecast with historical-frequency and volatility benchmarks.

<aside id="cushing-spread-test" class="sample-output" aria-labelledby="cushing-spread-title">
  <p class="sample-output__meta">Forward paper testing</p>
  <h3 id="cushing-spread-title">Cushing inventories and the WTI calendar spread</h3>
  <p class="sample-output__description">Does a draw in Cushing crude stocks strengthen the nearest eligible WTI contract relative to the next month?</p>
  <ul class="sample-output__method">
    <li><strong>Signal.</strong> After a draw, buy the nearer contract and sell the next month. A build reverses the position. A second study flips this rule and uses a fair-coin benchmark.</li>
    <li><strong>Timing.</strong> Record the EIA release before entry. Model entry 5–7 minutes after release and exit 60–62 minutes after release using delayed same-minute trades in both contracts.</li>
  </ul>
  <p class="sample-output__status">Each study reviews performance after 60 completed primary trades.</p>
  <div class="sample-output__release-log" id="cushing-replay-example">
    <h4>25 November 2026 historical replay</h4>
    <p>Cushing crude stocks fell <strong>2.04%</strong> week over week, from 26.147 million to 25.613 million barrels. Under the preset rule, the draw called for buying January WTI and selling February WTI.</p>
    <p class="sample-output__source"><a href="https://www.eia.gov/petroleum/supply/weekly/archive/2026/2026_11_25/wpsr_2026_11_25.php">Inventory source: EIA Table 4, 25 November 2026</a></p>
    <p>The historical replay used archived minute bars. It sits outside the forward test.</p>
    <table aria-label="Modeled entry and exit prices in US dollars per barrel">
      <thead><tr><th scope="col">WTI contract</th><th scope="col">Entry<br>10:35 a.m. ET</th><th scope="col">Exit<br>11:30 a.m. ET</th></tr></thead>
      <tbody>
        <tr><th scope="row">January (CLF7)</th><td>$83.10</td><td>$82.94</td></tr>
        <tr><th scope="row">February (CLG7)</th><td>$81.75</td><td>$81.56</td></tr>
      </tbody>
    </table>
    <p class="sample-output__source">Modeled prices in USD per barrel.</p>
    <table aria-label="Gross returns on 100,000 dollars of starting paper equity">
      <thead><tr><th scope="col">Strategy</th><th scope="col">Gross return</th></tr></thead>
      <tbody>
        <tr><th scope="row">Original</th><td>+0.03%</td></tr>
        <tr><th scope="row">Reversed</th><td>−0.03%</td></tr>
        <tr><th scope="row">Seeded random</th><td>+0.03%</td></tr>
      </tbody>
    </table>
    <p class="sample-output__source">Each strategy models one spread on $100,000 starting paper equity. Gross returns exclude fees and slippage.</p>
  </div>
  <!-- cushing-release-log:start -->
  <div class="sample-output__release-log" id="cushing-release-log">
    <h4>EIA release log</h4>
    <ul class="sample-output__release-list">
    <li data-release-date="2026-11-25"><p><strong><time datetime="2026-11-25">25 November 2026</time></strong> <span class="sample-output__review">Historical paper trade</span></p><p>Cushing crude inventories <strong>down 0.534 million barrels</strong> week over week.</p><p class="sample-output__source"><a href="https://www.eia.gov/petroleum/supply/weekly/archive/2026/2026_11_25/wpsr_2026_11_25.php">EIA Table 4 · 25 November 2026</a></p></li>
    </ul>
  </div>
  <!-- cushing-release-log:end -->
</aside>

## Shared infrastructure

Much of the work sits beneath the individual research outputs:

- **Data integration.** Company filings, market prices, EIA energy data, FRED/ALFRED economic series and CFTC positioning feed the relevant research workflows. Security identifiers, units, periods and timestamps are checked before data enters a model.
- **Evidence and reproducibility.** Saved source snapshots, citations, information cut-offs and versioned inputs allow an analysis to be traced and replayed. Revised inputs remain distinguishable from the original research record.
- **Financial modelling.** A deterministic Python calculation layer keeps forecasts, valuations, sensitivities and portfolio calculations consistent across reports and workbooks.
- **Research and review workflows.** Specialist research, modelling, thesis-challenge and audit roles operate within a structured workflow, with human review of key assumptions and conclusions.
- **Publication tools.** Report templates, chart generation and PDF, HTML and Excel outputs share underlying numerical records, supported by reconciliation and presentation checks.

## What comes next

The next phase collects forward results and checks how sensitive the spread studies are to entry timing and available quotes. Longer forecast horizons and scoring for additional financial futures remain in development.

*Trading results are simulated. The system is used for research and paper testing, with no live execution.*
