---
title: What a WTI hedge leaves exposed
subtitle: Two paths through Hurricane Harvey at the Cushing desk
summary: >-
  A matched WTI hedge offset $5,880 of a $7,260 drop in crude value on the opening day.
  Over ten sessions, keeping the hedged cargo lost $3,002, while selling in stages after
  landfall earned $1,090. Tank space and client commitments explain the difference.
authors:
  - James Sahota
date: 2026-11-24
dataAsOf: 24 August–7 September 2017, ten trading sessions
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
  title: A $4,092 gap between two hedged desks
  unit: Final P&L across ten trading sessions
  items:
    - label: Keep the hedged cargo
      value: -3002
      display: "−$3,002"
    - label: Sell locally in stages after landfall
      value: 1090
      display: "+$1,090"
  note: Both desks held the same book through 25 August. Each kept one short October WTI lot per 1,000 barrels of owned crude.
  source: Cargo Desk Hurricane Harvey scenario replay

tables:
  - title: Where the final P&L came from
    columns: [P&L component, Keep the cargo, Sell in stages]
    rows:
      - ["Common crude price move", "$0", "$0"]
      - ["Spot versus October WTI", "−$180", "−$1,220"]
      - ["Sales below the spot mark", "−$1,080", "−$2,720"]
      - ["Client storage income", "+$11,820", "+$15,440"]
      - ["Tank A lease", "−$8,000", "−$8,000"]
      - ["Off-site storage", "−$4,180", "−$2,410"]
      - ["Charge for turning away a client", "−$1,382", "$0"]
      - ["Final P&L", "−$3,002", "+$1,090"]
    note: The hold desk sold its remaining crude at the closing auction, 18¢ below spot. The staged-sale desk sold all its crude locally by 30 August.
    source: Cargo Desk replays on EIA daily settlement and spot marks

approach: >-
  Both runs use the same historical Cushing spot and October WTI marks and start with the same
  inventory, hedge and client commitments. The desks see the same offered client volumes.
  Terminal fees, quotes, the Gulf closure and the final auction terms are modeled. Quotes and
  available capacity can change with the desk’s decisions. The game settles both books
  on 7 September. Futures margin and financing are outside the model.

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

### What the hedge actually paid

Cargo Desk starts with 6,000 barrels in Cushing and six short October WTI futures contracts, each for 1,000 barrels. If both prices rise $1 per barrel, the crude gains $6,000 and the shorts lose $6,000. The same offset works in reverse when both prices fall together.

On 24 August, as Harvey approached the coast, **Cushing spot fell $1.21 per barrel**, from $48.45 to $47.24. The crude lost **$7,260** in value. **October WTI fell 98¢**, from $48.41 to $47.43, so the shorts gained **$5,880**. The position still lost **$1,380** before fees and client income. [EIA Cushing spot](https://www.eia.gov/dnav/pet/hist/RWTCD.htm) · [EIA front-month futures](https://www.eia.gov/dnav/pet/hist/RCLC1D.htm)

That shortfall is **basis risk**. Here the basis is Cushing spot minus October WTI. It moved from 4¢ over to 19¢ under. A 23¢ weakening costs 6,000 × $0.23 even with every barrel hedged. Every 10¢ the spot mark falls on its own costs that desk another $600. The actual sale adds a second price risk because a local buyer can offer less than the published spot mark.

### The physical decision after landfall

In the week ending 1 September, Gulf Coast refineries processed 34% less than the previous week, a drop of 3.2 million barrels a day in gross inputs. U.S. regular gasoline rose from $2.40 to $2.68 a gallon between 28 August and 4 September. Refineries buy crude and make fuel, so taking them offline reduces crude demand and gasoline supply at the same time. [EIA’s post-storm analysis](https://www.eia.gov/todayinenergy/detail.php?id=32852)

In the game, both desks hold the same starting cargo and accept the same clients for the first two sessions. After landfall the Gulf route is closed, and the desks take different approaches to the space they can offer.

- **Keep the cargo.** Hold 6,000 barrels and six shorts. Accept clients when capacity allows and rent overflow as needed. By 29 August, 6,000 owned barrels and 7,000 already committed to clients require 3,000 barrels of overflow. The next client asks for another 6,000. Taking it would raise that requirement to 9,000 barrels with only 6,000 available to book, so the desk turns it away and pays $1,382.
- **Sell in stages.** Starting on 28 August, take the displayed local bid for as many owned barrels as the buyer will take. Sell 3,000, then 2,000, then the final 1,000 over the next two sessions. Buy back three, two and one October lots as the barrels leave. If the desk sold 3,000 and left the original six shorts open, it would be net short 3,000 barrels and exposed to a price rally.

### Why the results separate

Selling in stages paid wider sale discounts and took a larger basis loss. Together, those lines were **$2,680 worse**. The tank earned **$6,772 more after operating costs**, through client income, lower overflow expense and the avoided turn-away charge. That left **$4,092 more** in final P&L.

When the game says **Flat**, the crude and futures offset a common price move. The desk still has to compare the actual exit bid with the futures mark and decide what each barrel in the tank is worth to a client.

<details>
<summary>Replay the exact tickets</summary>

For both desks, accept the clients in cycles 1 and 2 and hold your crude. Book 2,000 barrels of overflow for one cycle on the first ticket, then 5,000 for one cycle on the second.

**Keep the cargo.** Hold all ten days. In cycles 3–7, book 3,000, 3,000, 3,000, 5,000 and 1,000 barrels of overflow respectively, each for one cycle. Turn the client away in cycle 4 and accept the remaining clients. The game sells the crude at the final auction and closes the shorts at their final mark.

**Sell in stages.** In cycles 3–5, sell 3,000, 2,000 and 1,000 barrels locally and choose **Hedge to flat** each time. Accept the clients and book 4,000 barrels of overflow for two cycles in cycle 4. There are no other overflow bookings after cycle 2. Hold the empty book and accept the remaining clients through cycle 10.

</details>
