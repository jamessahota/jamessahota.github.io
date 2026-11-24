---
title: What a WTI hedge leaves exposed
subtitle: Selling versus storing crude after Hurricane Harvey
summary: >-
  Two Cargo Desk replays compare selling 2,000 barrels locally with paying for overflow
  storage after Hurricane Harvey. Both desks stay hedged, and storage comes out $460 ahead
  over two sessions.
authors:
  - James Sahota
date: 2026-11-24
dataAsOf: 29–30 August 2017 decision window
topics:
  - oil-markets
  - refining-products
type: commentary
venue:
  name: Independent research
publicationStatus: published
visibility: public
playScenario:
  href: /projects/cargo-desk/?scenario=harvey2017
  label: Play the Harvey scenario

headerVisual:
  kind: bars
  title: Two days at the Cushing desk
  unit: Change in marked P&L
  items:
    - label: Sell 2,000 bbl locally
      value: 1660
      display: "+$1,660"
    - label: Keep the crude and book overflow
      value: 2120
      display: "+$2,120"
  note: From the 29 August opening to the 30 August close. Both desks started the window $7,239 down.
  source: Cargo Desk Hurricane Harvey scenario replay

tables:
  - title: The two tickets, reconciled
    columns: [P&L component, Sell locally, Pay for overflow]
    rows:
      - ["Sale discount to opening spot", "−$840", "$0"]
      - ["Basis move on retained crude", "+$680", "+$1,020"]
      - ["Client storage income", "+$3,420", "+$3,420"]
      - ["Tank A lease, two cycles", "−$1,600", "−$1,600"]
      - ["Off-site storage, two cycles", "$0", "−$720"]
      - ["Change in marked P&L", "+$1,660", "+$2,120"]
      - ["Cumulative P&L at 30 August close", "−$5,579", "−$5,119"]
    note: Both desks matched their October WTI shorts to the crude they held, so the common price move contributed $0 in each replay.
    source: Cargo Desk replays on EIA daily settlement and spot marks

approach: >-
  The replays use the same seed, starting position and historical Cushing spot and October WTI marks.
  Local bids, client terms, terminal costs and route availability are simulated. The game models a
  Gulf forward-capacity closure from 28 to 31 August. P&L is marked at the 30 August close, when both
  desks still held crude and short futures. Later sales, subsequent costs and the final result depend
  on how the rest of the run is played.

sources:
  - label: EIA post-Harvey refinery inputs and gasoline prices, 11 September 2017
    url: https://www.eia.gov/todayinenergy/detail.php?id=32852
  - label: EIA daily Cushing WTI spot prices
    url: https://www.eia.gov/dnav/pet/hist/RWTCD.htm
  - label: EIA daily front-month WTI futures settlements
    url: https://www.eia.gov/dnav/pet/hist/RCLC1D.htm

related:
  - diesel-distillate-bottleneck
  - us-crude-inventories
---

After Hurricane Harvey, Gulf Coast refineries took in 3.2 million fewer barrels a day in the week ending 1 September 2017, a 34% drop from the previous week. U.S. regular gasoline went from $2.40 to $2.68 a gallon between 28 August and 4 September. Refinery outages can push those markets in different directions. Refineries buy crude and produce gasoline, so a shutdown cuts crude demand and fuel supply at the same time. [EIA’s post-storm analysis](https://www.eia.gov/todayinenergy/detail.php?id=32852)

### The decision at Cushing

On 29 August, both replay desks own 6,000 barrels and are short six October WTI contracts. A client offers $3,420 for storage for another 6,000 barrels. Tank A holds 10,000 barrels and the Gulf route is unavailable in the scenario. Both desks accept the client, so each needs to make room for 2,000 barrels.

- **Sell locally.** Take the simulated $45.98 bid for 2,000 barrels and buy back two October WTI contracts. The sale clears the space and leaves 4,000 barrels hedged.
- **Pay for overflow.** Keep the 6,000 barrels and all six shorts. Book 2,000 barrels of off-site space for the client's crude for two cycles at 18¢ per barrel per cycle, for a total of $720.

### Where the $460 came from

The local bid was 42¢ below the $46.40 opening Cushing spot mark. Selling immediately gave up $840 against that mark. The overflow lease cost $720, so holding started with a $120 advantage on the two tickets before any price move.

Then the basis moved in favour of the barrels in storage. Here, basis is Cushing spot minus the October futures price. It started at **−17¢ per barrel** ($46.40 spot against $46.57 futures). At the 30 August close, both marks were $45.96. The matched futures hedge offset the common price move, and the 17¢ improvement in basis added **$340** on the extra 2,000 barrels. The $120 saving and the $340 basis gain explain the **$460** difference. [EIA Cushing spot](https://www.eia.gov/dnav/pet/hist/RWTCD.htm) · [EIA front-month futures](https://www.eia.gov/dnav/pet/hist/RCLC1D.htm)

At those quoted terms, a 6¢ weakening in basis would have erased the storage advantage at the two-day mark. The decision came down to the local bid, the cost of space and how spot moved relative to the hedge. Both desks had entered 29 August down $7,239, and both still showed a loss for the run at the end of the comparison.

### Recreate the two tickets

For cycles 1–3, hold the position and choose **Turn away** for the client. On cycle 4, choose **Accept**. To sell, enter 2,000 barrels in **Sell locally** and use **Hedge to flat** to buy back two October lots. To store, hold the crude and book 2,000 barrels of overflow for two cycles. On cycle 5, hold the position with no new orders. The comparison stops at that close.
