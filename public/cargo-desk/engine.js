(function () {
  "use strict";

  // All money is in whole cents and all prices in cents per barrel.
  // A run is ten trading days. Each day opens with a morning ticket. If something
  // happens at midday (the stocks report, a shock, or fresh news on an event), the
  // day gets an afternoon ticket too. The market then moves overnight.
  const totalCycles = 10;
  const capacity = 10000;
  const lot = 1000;
  const cargoCost = 7220;
  const hedgeEntry = 7360;
  const monthNames = ["Dec", "Jan", "Feb", "Mar", "Apr"];
  const maxFuturesLots = 20;
  // The desk's flat-price limit: owned crude plus futures, in lots, long or short.
  const netLimitLots = 2;
  // Tank A is leased at a fixed rate per day, whether it holds your crude, a client's or nothing.
  const tankLease = 80000;
  // Dec stops trading at the close of day 5. Anything left in it is settled at spot.
  const expiryDay = 4;
  // The weekly stocks report lands at midday on both Wednesdays.
  const reportDays = [2, 7];
  // The percentage chance each day of a shock nobody was warned about.
  const shockChance = 10;
  const openingPrices = [7240, 7360, 7420, 7450, 7480];
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const terminalEvents = [
    {
      key: "refinery",
      desk: "Crude marketing",
      title: "A refinery needs prompt crude.",
      brief: "A regional buyer has opened an extra intake slot and is paying over spot. Deliver into the firm bid or keep the barrels for a later window.",
      bidPremium: [32, 105],
      offerPremium: [12, 36],
    },
    {
      key: "surplus",
      desk: "Crude marketing",
      title: "Spot barrels are piling up.",
      brief: "Producers are offering extra supply below spot. Cheap barrels are worth buying if you have the tank space and a hedge to put against them.",
      bidPremium: [-62, -18],
      offerPremium: [-38, -9],
    },
    {
      key: "pipeline",
      desk: "Pipeline operations",
      title: "A Gulf Coast route has opened.",
      brief: "An outbound pipeline has a limited slot. Compare the Gulf buyer’s bid after the tariff with the local bid before committing barrels.",
      bidPremium: [-20, 35],
      offerPremium: [5, 30],
    },
    {
      key: "maintenance",
      desk: "Terminal operations",
      title: "An outbound line is down.",
      brief: "Maintenance has cut the terminal’s ability to move crude. Local buyers will take only a limited load, at a discount, and overflow space costs more.",
      bidPremium: [-75, -25],
      offerPremium: [-25, 18],
    },
    {
      key: "firm",
      desk: "Crude marketing",
      title: "Local buyers are bidding firmly.",
      brief: "Several buyers want prompt barrels today, so the local bid sits close to spot or above it. Weigh it against what the curve pays you to keep storing.",
      bidPremium: [-10, 58],
      offerPremium: [5, 48],
    },
  ];

  // Events that can go on watch for the overnight move, with their odds and effect
  // stated. flat: the move in every price. premium: the extra move in spot alone,
  // which is what a hedged physical book is exposed to.
  const watchEvents = [
    {
      key: "outage",
      title: "A pipeline feeding Cushing may shut for repairs",
      detail: "Less crude would reach the hub, so prompt barrels would be scarce and spot would jump against futures.",
      lean: "Good for a book that holds crude.",
      hitHeadline: "The pipeline shut and prompt crude at Cushing ran short",
      missHeadline: "The pipeline stayed open",
      odds: [25, 45],
      hit: { flat: [60, 140], premium: [70, 120] },
      miss: { flat: [-25, -10], premium: [-20, -8] },
    },
    {
      key: "refinery",
      title: "A refinery that runs Cushing crude may go down",
      detail: "Its barrels would back up at the hub, so spot would fall against futures.",
      lean: "Bad for a book that holds crude.",
      hitHeadline: "The refinery went down and unsold crude backed up at Cushing",
      missHeadline: "The refinery kept running",
      odds: [25, 45],
      hit: { flat: [-140, -60], premium: [-120, -70] },
      miss: { flat: [10, 25], premium: [8, 20] },
    },
    {
      key: "cut",
      title: "Producers meet tonight and may cut output",
      detail: "A cut would lift every price on the curve. Part of it is already priced in, so no cut means a small fall.",
      lean: "Good for a net long position.",
      hitHeadline: "Producers agreed an output cut",
      missHeadline: "Producers left output unchanged",
      odds: [30, 50],
      hit: { flat: [250, 420], premium: [10, 40] },
      miss: { flat: [-80, -40], premium: [0, 0] },
    },
    {
      key: "demand",
      title: "Economic data due overnight may point to weaker demand",
      detail: "A bad number would knock every price on the curve. A good one brings a small relief rally.",
      lean: "Good for a net short position.",
      hitHeadline: "Weak economic data hit the demand outlook",
      missHeadline: "The economic data came in firm",
      odds: [30, 50],
      hit: { flat: [-420, -250], premium: [-40, -10] },
      miss: { flat: [40, 80], premium: [0, 0] },
    },
  ];

  // The scheduled one: the weekly stocks report, out at midday on Wednesdays.
  const stocksReport = {
    key: "stocks",
    title: "The weekly stocks report is due at midday",
    detail: "The survey expects a small draw. A larger one lifts prices, spot most of all. A build does the opposite.",
    lean: "A draw is good for a book that is long and holds crude.",
    hitHeadline: "Stocks fell by more than the survey expected",
    missHeadline: "Stocks rose against the survey",
    odds: [40, 60],
    hit: { flat: [150, 250], premium: [25, 60] },
    miss: { flat: [-250, -150], premium: [-60, -25] },
  };

  // Shocks. Nothing warns of these. Some move every price and some move spot
  // hardest, so a hedge covers the first kind and nothing fully covers the second.
  const shocks = [
    { headline: "Shock: an attack on a producing region cut supply", flat: 1, premium: 1 },
    { headline: "Shock: a surprise release from strategic reserves hit the market", flat: -1, premium: -1 },
    { headline: "Shock: an explosion took a large refinery offline", flat: -1, premium: -1 },
    { headline: "Shock: an export surge drained barrels from the hub", flat: 1, premium: 1 },
    { headline: "Shock: a large fund was forced to sell its futures", flat: -1, premium: 0 },
    { headline: "Shock: a squeeze on short sellers sent futures up", flat: 1, premium: 0 },
  ];

  // The people on the other end of a local trade. All are invented.
  const counterparties = ["Redbud Refining", "Salt Fork Marketing", "Arbuckle Crude Supply", "Blackjack Oak Trading", "Verdigris Energy"];
  // How much better than their opening price each will go, in cents, and how they sound.
  const moods = [
    { key: "keen", reserve: [30, 60], buyer: "They need the barrels and sound in a hurry.", seller: "They want the barrels gone today." },
    { key: "steady", reserve: [15, 35], buyer: "A routine enquiry. No sign of urgency.", seller: "A routine offer. No sign of urgency." },
    { key: "tough", reserve: [0, 15], buyer: "They have other offers and say so.", seller: "They have other buyers and say so." },
  ];
  const maxAsk = 80;

  const formatVolume = (barrels) => barrels.toLocaleString("en-US") + " bbl";
  // Prices can be negative in a historical scenario, so the sign goes before the dollar.
  // The word joiner keeps the minus sign on the same line as its figure.
  const priceLabel = (cents) => (cents < 0 ? "−\u2060" : "") + "$" + (Math.abs(cents) / 100).toFixed(2);
  const lotsLabel = (lots) => (Number.isInteger(lots) ? String(lots) : lots.toFixed(1)) + (Math.abs(lots) === 1 ? " lot" : " lots");
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  // Each kind of draw has its own stream, so the price path of a seed is the
  // same whatever the player does at the terminal.
  function randomStream(seed, cycle, stream) {
    const key = JSON.stringify([seed, cycle, stream]);
    let a = 1779033703;
    let b = 3144134277;
    let c = 1013904242;
    let d = 2773480762;
    for (let index = 0; index < key.length; index++) {
      const character = key.charCodeAt(index);
      a = b ^ Math.imul(a ^ character, 597399067);
      b = c ^ Math.imul(b ^ character, 2869860233);
      c = d ^ Math.imul(c ^ character, 951274213);
      d = a ^ Math.imul(d ^ character, 2716044179);
    }
    a = Math.imul(c ^ (a >>> 18), 597399067);
    b = Math.imul(d ^ (b >>> 22), 2869860233);
    c = Math.imul(a ^ (c >>> 17), 951274213);
    d = Math.imul(b ^ (d >>> 19), 2716044179);
    return (minimum, maximum) => {
      const sum = (a + b + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = ((c << 21) | (c >>> 11)) + sum | 0;
      return minimum + Math.floor((sum >>> 0) * (maximum - minimum + 1) / 4294967296);
    };
  }

  // --- The market ----------------------------------------------------------------

  const clock = (day, phase) => "W" + (Math.floor(Math.min(day, totalCycles - 1) / 5) + 1) + " " + weekdays[Math.min(day, totalCycles - 1) % 5] +
    (phase === "pm" ? " · 13:00" : phase === "close" ? " · 16:00" : " · 08:30");

  function drawEvent(draw, event, due) {
    const effect = (range) => ({ flat: draw(...range.flat), premium: draw(...range.premium) });
    const { key, title, detail, lean, hitHeadline, missHeadline } = event;
    // Odds are quoted to the nearest 5% and are the true chance.
    return { key, title, detail, lean, hitHeadline, missHeadline, due, odds: draw(event.odds[0] / 5, event.odds[1] / 5) * 5, hit: effect(event.hit), miss: effect(event.miss) };
  }

  // New prices from old. decay pulls the front month towards spot, premium moves
  // spot against the whole curve, and tails (overnight only) reshapes the far months.
  function evolve(previous, { flat, premium, decay, noise, tails }) {
    const spot = clamp(previous[0] + flat + premium, 4600, 10500);
    const slope = clamp(Math.round((previous[1] - previous[0]) * decay) + noise - premium, -260, 260);
    const front = spot + slope;
    let gaps = [previous[2] - previous[1], previous[3] - previous[2], previous[4] - previous[3]];
    if (tails !== null) {
      const tail = clamp(Math.round(slope * .32) + tails, -90, 90);
      gaps = [tail, Math.round(tail * .7), Math.round(tail * .5)];
    }
    return [spot, front, front + gaps[0], front + gaps[0] + gaps[1], front + gaps[0] + gaps[1] + gaps[2]];
  }

  function settle(watch, roll, reaction) {
    const hit = roll <= watch.odds;
    const expected = hit ? watch.hit : watch.miss;
    // The market never reacts by exactly the expected amount.
    const effect = { flat: Math.round(expected.flat * reaction / 100), premium: Math.round(expected.premium * reaction / 100) };
    return { title: watch.title, hit, headline: hit ? watch.hitHeadline : watch.missHeadline, ...effect };
  }

  function drawShock(draw) {
    const roll = draw(0, 199);
    const kind = shocks[draw(0, shocks.length - 1)];
    const flat = draw(300, 650);
    const premium = draw(40, 110);
    // Half of the day's chance falls at midday and half overnight.
    return roll < shockChance ? { headline: kind.headline, flat: kind.flat * flat, premium: kind.premium * premium } : null;
  }

  function openingMarket() {
    return { day: 0, phase: "am", time: clock(0, "am"), prices: openingPrices.slice(), firstMonth: 0, headline: "Opening marks", watch: null, resolved: null, revision: null, shock: null, expired: null };
  }

  // --- Historical scenarios -------------------------------------------------------
  // A scenario replaces the generated market with real daily settlement prices. Its
  // prices run from the close before the first day (index 0) to the close of the
  // tenth day (index 10). There are no afternoons, odds or shocks: history is fixed,
  // and each morning carries a briefing on what was known at the time.

  // Dates are written from fixed tables, so a run reads the same on every machine.
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const calendarMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dateLabel(iso) {
    const date = new Date(iso + "T12:00:00Z");
    return dayNames[date.getUTCDay()] + " " + date.getUTCDate() + " " + calendarMonths[date.getUTCMonth()] + " " + date.getUTCFullYear();
  }

  // A scenario's data is checked once, so a mistake in it fails loudly at the start of a
  // run and never half-way through one.
  function checkScenario(scenario) {
    const fail = (problem) => { throw new Error("Scenario " + (scenario?.key || "(no key)") + ": " + problem); };
    if (!scenario || typeof scenario !== "object") fail("is not an object");
    const rows = totalCycles + 1;
    if (!Array.isArray(scenario.dates) || scenario.dates.length !== rows) fail("needs " + rows + " dates");
    scenario.dates.forEach((date, index) => {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T12:00:00Z").getTime())) fail("has a bad date, " + date);
      if (index && date <= scenario.dates[index - 1]) fail("dates are out of order at " + date);
    });
    if (!Array.isArray(scenario.prices) || scenario.prices.length !== rows) fail("needs " + rows + " price rows");
    for (const row of scenario.prices) {
      if (!Array.isArray(row) || row.length !== 5 || !row.every(Number.isSafeInteger)) fail("needs five whole-cent prices on every row");
    }
    const expiry = scenario.expiry ?? null;
    // The front month can expire on any day but the last, when the run closes everything anyway.
    if (expiry !== null && !(Number.isSafeInteger(expiry) && expiry >= 1 && expiry < totalCycles)) fail("expiry must be a day from 1 to " + (totalCycles - 1) + ", or null");
    if (!Array.isArray(scenario.months) || scenario.months.length !== (expiry ? 5 : 4) || !scenario.months.every(name => typeof name === "string" && name)) {
      fail("needs " + (expiry ? "five month names, because one expires" : "four month names"));
    }
    if (expiry && !Number.isSafeInteger(scenario.afterExpiry?.price)) fail("needs afterExpiry.price in whole cents for the newly listed month");
    if (!Array.isArray(scenario.days) || scenario.days.length !== totalCycles) fail("needs " + totalCycles + " days of news");
    for (const key of scenario.terminal?.events || []) {
      if (!terminalEvents.some(item => item.key === key)) fail("names an unknown terminal event, " + key);
    }
    return scenario;
  }

  function scenarioOpening(scenario) {
    return {
      day: 0, phase: "am", time: dateLabel(scenario.dates[1]), prices: scenario.prices[0].slice(), firstMonth: 0,
      headline: "Prices at the close on " + dateLabel(scenario.dates[0]), watch: null, resolved: null, revision: null, shock: null, expired: null,
      briefing: scenario.days[0].known, knownAt: dateLabel(scenario.dates[0]), estimated: false,
    };
  }

  // One real trading day: from the prices the ticket was written against to that day's settlement.
  function scenarioMove(scenario, market) {
    const next = market.day + 1;
    let prices = scenario.prices[next].slice();
    let firstMonth = market.firstMonth;
    let expired = null;
    let estimated = false;
    if (scenario.expiry === next) {
      // The front contract's last day. Its final settlement is the day's front-month price,
      // and the curve moves up a month. The newly listed fourth month has no price in the
      // source data until the next day, so the scenario supplies one and says if it is an estimate.
      expired = { month: firstMonth, name: scenario.months[firstMonth], price: prices[1] };
      prices = [prices[0], prices[2], prices[3], prices[4], scenario.afterExpiry.price];
      estimated = !!scenario.afterExpiry.estimated;
      firstMonth++;
    }
    const phase = next >= totalCycles ? "close" : "am";
    return {
      day: next, phase, time: dateLabel(scenario.dates[phase === "close" ? next : next + 1]) + (phase === "close" ? " · close" : ""),
      prices, firstMonth, headline: scenario.days[market.day].happened, history: true,
      watch: null, resolved: null, revision: null, shock: null, expired,
      briefing: phase === "am" ? scenario.days[next].known : null, knownAt: dateLabel(scenario.dates[next]), estimated,
    };
  }

  // Morning to afternoon. A small move, plus whatever lands at midday.
  function middayMove(seed, morning) {
    const day = morning.day;
    const draw = randomStream(seed, day, "midday");
    const drift = draw(-35, 35);
    const noise = draw(-11, 11);
    const roll = draw(1, 100);
    const reaction = draw(60, 140);
    const shock = drawShock(draw);
    const reviseRoll = draw(0, 99);
    const branchRoll = draw(1, 100);
    const swing = draw(4, 6) * 5;

    let flat = drift;
    let premium = 0;
    let watch = morning.watch;
    let resolved = null;
    let revision = null;
    let headline = "A quiet morning";
    if (watch?.due === "midday") {
      resolved = settle(watch, roll, reaction);
      flat += resolved.flat;
      premium += resolved.premium;
      headline = resolved.headline;
      watch = null;
    } else if (watch && reviseRoll < 60) {
      // Fresh news moves the odds. The new odds are as honest as the old ones:
      // on average they come out where the old ones stood.
      const high = Math.min(90, watch.odds + swing);
      const low = Math.max(5, watch.odds - swing);
      const firmer = branchRoll <= Math.round(100 * (watch.odds - low) / (high - low));
      const odds = firmer ? high : low;
      // The market prices in part of the change straight away, so what is left
      // to come on the event itself is restated from the new prices.
      const share = (odds - watch.odds) / 100 * .4;
      const priced = {
        flat: Math.round(share * (watch.hit.flat - watch.miss.flat)),
        premium: Math.round(share * (watch.hit.premium - watch.miss.premium)),
      };
      flat += priced.flat;
      premium += priced.premium;
      revision = { title: watch.title, from: watch.odds, to: odds };
      headline = (firmer ? "More likely now: " : "Less likely now: ") + watch.title.charAt(0).toLowerCase() + watch.title.slice(1);
      watch = {
        ...watch,
        odds,
        hit: { flat: watch.hit.flat - priced.flat, premium: watch.hit.premium - priced.premium },
        miss: { flat: watch.miss.flat - priced.flat, premium: watch.miss.premium - priced.premium },
      };
    }
    if (shock) {
      flat += shock.flat;
      premium += shock.premium;
    }
    return {
      day, phase: "pm", time: clock(day, "pm"),
      prices: evolve(morning.prices, { flat, premium, decay: 1, noise, tails: null }),
      firstMonth: morning.firstMonth, headline, watch, resolved, revision, shock, expired: null,
      // Only a midday with news in it gives the player an afternoon ticket.
      material: Boolean(resolved || revision || shock),
    };
  }

  // Afternoon to the next morning, or to the final close.
  function overnightMove(ctx, afternoon) {
    const seed = ctx.seed;
    const day = afternoon.day;
    const draw = randomStream(seed, day, "overnight");
    const drift = draw(-60, 60);
    const noise = draw(-22, 22);
    const roll = draw(1, 100);
    const reaction = draw(60, 140);
    const shock = drawShock(draw);
    const mood = draw(0, 99);
    const moodSize = draw(28, 68);
    const tails = draw(-16, 16);
    const watchRoll = draw(0, 99);

    let flat = drift;
    let premium = 0;
    let resolved = null;
    let headline = "WTI repriced in ordinary trading";
    if (afternoon.watch) {
      resolved = settle(afternoon.watch, roll, reaction);
      flat += resolved.flat;
      premium += resolved.premium;
      headline = resolved.headline;
    } else if (mood < 15) {
      flat += moodSize;
      headline = "Stronger refinery runs supported crude";
    } else if (mood < 30) {
      flat -= moodSize;
      headline = "Refiners pulled back on buying";
    }
    if (shock) {
      flat += shock.flat;
      premium += shock.premium;
    }

    // The gap between spot and the front month closes by about a third each
    // night, so a contango pays the holder of hedged crude and a backwardation costs them.
    let prices = evolve(afternoon.prices, { flat, premium, decay: .67, noise, tails });
    let firstMonth = afternoon.firstMonth;
    let expired = null;
    if (day === ctx.expiryDay) {
      // The front month expires at spot and the curve moves up one month.
      expired = { month: firstMonth, name: ctx.months[firstMonth], price: prices[0] };
      prices = [prices[0], prices[2], prices[3], prices[4], prices[4] + Math.round((prices[4] - prices[3]) * .8)];
      firstMonth++;
    }

    const next = day + 1;
    const watch = next >= totalCycles ? null :
      reportDays.includes(next) ? drawEvent(draw, stocksReport, "midday") :
      watchRoll < 50 ? drawEvent(draw, watchEvents[draw(0, watchEvents.length - 1)], "overnight") : null;
    const phase = next >= totalCycles ? "close" : "am";
    return { day: next, phase, time: clock(next, phase), prices, firstMonth, headline, watch, resolved, revision: null, shock, expired };
  }

  // The price of a month by its place in monthNames, or null if it is not trading.
  function monthPrice(market, month) {
    if (market.expired?.month === month) return market.expired.price;
    const slot = month - market.firstMonth;
    return slot >= 0 && slot < 4 ? market.prices[slot + 1] : null;
  }

  // --- The book --------------------------------------------------------------------

  const ownedBarrels = (book) => book.crude.reduce((total, batch) => total + batch.barrels, 0);
  const clientBarrels = (book) => book.loads.reduce((total, load) => total + load.barrels, 0);
  const lotsHeld = (book) => book.futures.map(contracts => contracts.length * (contracts[0]?.side ?? 1));
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const grossLots = (holdings) => holdings.reduce((total, contracts) => total + Math.abs(contracts), 0);

  // Your own crude takes Tank A first. Whatever does not fit goes off-site.
  function storageLayout(owned, clients) {
    const ownedOverflow = Math.max(0, owned - capacity);
    const clientOverflow = Math.max(0, clients - Math.max(0, capacity - owned));
    return { ownedOverflow, clientOverflow, occupancy: owned + clients - ownedOverflow - clientOverflow };
  }

  function leaseCapacity(leases, cycle) {
    return leases.reduce((total, lease) => lease.fromCycle <= cycle && lease.throughCycle >= cycle ? total + lease.barrels : total, 0);
  }

  function record(book, category, label, detail, cents) {
    book.entries.push({ category, label, detail, cents, cycle: book.day + 1 });
    book.realized[category] += cents;
  }

  function sellCrude(book, barrels, price, label) {
    let remaining = barrels;
    let basis = 0;
    while (remaining > 0) {
      const batch = book.crude[0];
      const sold = Math.min(remaining, batch.barrels);
      basis += sold * batch.price;
      batch.barrels -= sold;
      remaining -= sold;
      if (!batch.barrels) book.crude.shift();
    }
    record(book, "physical", label, formatVolume(barrels) + " @ " + priceLabel(price), barrels * price - basis);
  }

  function tradeFutures(book, month, traded, price, settled = false) {
    if (!traded) return;
    const contracts = book.futures[month];
    const side = Math.sign(traded);
    const fills = Math.abs(traded);
    const name = book.ctx.months[month] + " WTI";
    const closing = contracts[0]?.side === -side ? Math.min(fills, contracts.length) : 0;
    if (closing) {
      const closed = contracts.splice(0, closing);
      const gain = closed.reduce((total, contract) => total + (price - contract.price) * contract.side * lot, 0);
      book.futuresRealized[month] += gain;
      record(book, "hedge", name + (settled ? " settled at expiry" : side > 0 ? " bought back" : " sold to close"), closing + " lots @ " + priceLabel(price), gain);
    }
    const opening = fills - closing;
    if (opening) {
      for (let count = 0; count < opening; count++) contracts.push({ side, price });
      record(book, "hedge", name + (side > 0 ? " bought" : " sold"), opening + " lots @ " + priceLabel(price), 0);
    }
  }

  function futuresBook(book) {
    const holdings = lotsHeld(book);
    return book.futures.map((contracts, month) => {
      const mark = monthPrice(book.market, month);
      const unrealized = mark === null ? 0 : contracts.reduce((total, contract) => total + (mark - contract.price) * contract.side * lot, 0);
      return {
        name: book.ctx.months[month],
        expired: month < book.market.firstMonth,
        listed: month < book.market.firstMonth + 4,
        position: holdings[month],
        averageEntry: contracts.length ? Math.round(contracts.reduce((total, contract) => total + contract.price, 0) / contracts.length) : null,
        mark,
        pnl: book.futuresRealized[month] + unrealized,
      };
    });
  }

  function marked(book) {
    const spot = book.market.prices[0];
    return {
      physical: book.realized.physical + book.crude.reduce((total, batch) => total + batch.barrels * (spot - batch.price), 0),
      hedge: futuresBook(book).reduce((total, month) => total + month.pnl, 0),
      logistics: book.realized.logistics,
    };
  }

  const sumComponents = (components) => components.physical + components.hedge + components.logistics;

  // --- What the player can trade against --------------------------------------------

  function buildMorning(book, seed) {
    const day = book.day;
    const draw = randomStream(seed, day, "terminal");
    // A scenario can make clients, storage and the mix of terminal events fit its period.
    const tuning = book.ctx.scenario?.terminal || {};
    const owned = ownedBarrels(book);
    const layout = storageLayout(owned, clientBarrels(book));
    const free = capacity - layout.occupancy;
    const spot = book.market.prices[0];
    const first = day === 0;
    const final = day === totalCycles - 1;
    const due = book.queued.find((shipment) => shipment.stage === day);
    // Clients turn up more often when the tank is already tight.
    const arrival = first || due || (!final && draw(0, 99) < (free <= 3000 ? tuning.clientTight ?? 51 : tuning.clientLoose ?? 30));
    const inbound = first ? 6000 : due ? due.barrels : arrival ? draw(2, 6) * lot : 0;
    const pool = tuning.events ? tuning.events.map(key => terminalEvents.find(item => item.key === key)) : terminalEvents;
    const event = first || final ? null : pool[draw(0, pool.length - 1)];

    const bidPremium = first ? -draw(18, 52) : final ? draw(12, 46) : draw(...event.bidPremium);
    const offerPremium = event ? draw(...event.offerPremium) : draw(5, 30);
    const buyMax = draw(2, 6) * lot;
    const sellLimit = final ? Math.max(owned, lot) : draw(2, event?.key === "maintenance" ? 3 : 6) * lot;
    const storageMax = draw(4, 6) * lot;
    const storagePrice = Math.round((event?.key === "maintenance" ? draw(12, 20) : draw(7, 14)) * (tuning.storageScale ?? 1));
    const shortfall = Math.max(0, layout.ownedOverflow + layout.clientOverflow - leaseCapacity(book.leases, day + 1));
    const bid = spot + bidPremium;
    const offer = spot + offerPremium;

    let ship = null;
    if (owned && (final || event?.key === "pipeline")) {
      const max = Math.min(owned, (final ? draw(3, 6) : draw(2, 5)) * lot);
      const price = spot + (final ? draw(70, 145) : draw(63, 144));
      ship = { price, max, tariff: final ? draw(38, 95) : draw(44, 94) };
    }

    let client = null;
    if (inbound) {
      const releaseAfter = draw(2, 4);
      const rate = Math.round(draw(28, 56) * (tuning.rateScale ?? 1));
      const deferFee = draw(650, 1650) * 100;
      const redirectFee = draw(800, 1900) * 100;
      const preferred = draw(1, 2);
      const delay = due ? undefined : [preferred, 3 - preferred].find((cycles) =>
        day + cycles < totalCycles - 1 && !book.queued.some((shipment) => shipment.stage === day + cycles));
      client = {
        barrels: inbound,
        rate,
        releaseAfter,
        throughCycle: Math.min(totalCycles, day + releaseAfter),
        defer: delay === undefined ? null : { cycle: day + delay + 1, fee: deferFee },
        redirect: { fee: redirectFee },
      };
    }

    // Kept for the afternoon, which trades against the same buyers in thinner size.
    book.session = { bidPremium, offerPremium, buyMax, sellLimit, storagePrice };

    const shortage = Math.max(0, inbound - free);
    const title = final ? "Close out the campaign." :
      first ? "You’re running out of tank space." :
      due ? "The rescheduled barrels are back." :
      client ? "A client needs tank space." : event.title;
    const message = final ? "Take a firm exit now or face the closing market move. Any crude you still hold is sold at the closing auction for 18 cents under spot, and every futures position is closed at its final mark." :
      client ? (first ? "Your refinery buyer has delayed its pickup. " : "") + "Tank A holds " + formatVolume(layout.occupancy) +
        " against a " + formatVolume(capacity) + " limit, and a client wants room for " + formatVolume(inbound) + "." +
        (shortage ? " You are " + formatVolume(shortage) + " short." : " It fits.") :
      event.brief;

    return {
      phase: "am",
      desk: final ? "Final settlement" : client ? "Terminal operations" : event.desk,
      title,
      message,
      // On a client day the market event still sets the bids, so it is shown beside the client request.
      marketNote: client && event ? event.title : null,
      incoming: inbound,
      orderBook: {
        buy: { price: Math.max(offer, bid + 1), max: buyMax },
        sell: { price: bid, max: Math.min(owned, Math.max(sellLimit, shortfall)) },
        ship,
        storage: { price: storagePrice, max: storageMax, maxCycles: totalCycles - day },
        client,
        tankLease,
      },
    };
  }

  function buildAfternoon(book) {
    const market = book.market;
    const session = book.session;
    const spot = market.prices[0];
    const owned = ownedBarrels(book);
    // The afternoon is thinner: ten cents worse each way, and half the size.
    const bid = spot + session.bidPremium - 10;
    const offer = spot + session.offerPremium + 10;
    const half = (volume) => Math.max(lot, Math.round(volume / 2 / lot) * lot);
    const news = market.shock ? { title: market.shock.headline + ".", message: "Nobody saw it coming, and prices have already moved. You have the afternoon to act before the market moves again overnight." } :
      market.resolved ? { title: market.resolved.headline + ".", message: "The report is out and prices have moved. A jump in spot against futures fades over the next few days, so decide whether to trade into it this afternoon." } :
      { title: "The odds have moved.", message: "There is fresh news on the event you were watching. The market has priced in part of the change, and the rest is still to come overnight." };
    return {
      phase: "pm",
      desk: "Afternoon session",
      title: news.title,
      message: news.message,
      marketNote: market.shock && market.resolved ? market.resolved.headline + "." : null,
      incoming: 0,
      orderBook: {
        buy: { price: Math.max(offer, bid + 1), max: half(session.buyMax) },
        sell: { price: bid, max: Math.min(owned, half(session.sellLimit)) },
        ship: null,
        storage: { price: session.storagePrice, max: 0, maxCycles: 1 },
        client: null,
        tankLease: 0,
      },
    };
  }

  // --- Negotiation -------------------------------------------------------------------

  // Who is on the other end of a local trade this session, and how far they will move.
  function haggleTerms(seed, day, phase, side) {
    const draw = randomStream(seed, day, "haggle-" + phase + "-" + side);
    const name = counterparties[draw(0, counterparties.length - 1)];
    const moodRoll = draw(0, 99);
    const mood = moods[moodRoll < 30 ? 0 : moodRoll < 75 ? 1 : 2];
    const reserve = Math.round(draw(...mood.reserve) / 5) * 5;
    // Their counter gives away only part of what they would pay.
    const counter = Math.round(reserve * draw(30, 70) / 100 / 5) * 5;
    return { name, mood: mood.key, line: side === "sell" ? mood.buyer : mood.seller, reserve, counter };
  }

  // Plays a negotiation through. asks is what the player has said so far: an
  // improvement in cents on the opening price, then either "take" (accept the
  // counter) or one final ask. Nothing here is random once the seed is fixed.
  function negotiate(state, side, asks = []) {
    const route = state?.round?.orderBook?.[side];
    if (!route || (side !== "sell" && side !== "buy")) return { status: "unavailable" };
    const terms = haggleTerms(state.seed, state.stage, state.phase, side);
    const sign = side === "sell" ? 1 : -1;
    const base = { side, name: terms.name, mood: terms.mood, line: terms.line, firm: route.price, maxAsk };
    const valid = (ask) => Number.isSafeInteger(ask) && ask >= 5 && ask <= maxAsk && ask % 5 === 0;
    const deal = (improve) => ({ ...base, status: "deal", improve, price: route.price + sign * improve });
    if (!Array.isArray(asks) || asks.length > 2) return { ...base, status: "invalid" };
    if (asks.length === 0) return { ...base, status: "open" };
    if (!valid(asks[0])) return { ...base, status: "invalid" };
    if (asks[0] <= terms.reserve) return deal(asks[0]);
    const counter = Math.min(terms.counter, asks[0] - 5);
    if (asks.length === 1) return { ...base, status: "counter", asked: asks[0], counter, counterPrice: route.price + sign * counter };
    if (asks[1] === "take") return deal(counter);
    if (!valid(asks[1])) return { ...base, status: "invalid" };
    return asks[1] <= terms.reserve ? deal(asks[1]) : { ...base, status: "walked", asked: asks[1] };
  }

  // --- Checking and pricing a ticket ---------------------------------------------------

  function preview(state, draft = {}) {
    const round = state?.round;
    if (!round || !draft || typeof draft !== "object") return { ok: false, errors: { side: "The book is closed." } };

    const terms = round.orderBook;
    const errors = {};
    const whole = (value) => Number.isSafeInteger(value) && value >= 0;
    const amount = (value) => whole(value) ? value : 0;

    // Physical order, at the firm price or at one agreed by negotiation.
    const side = draft.side;
    let route = ["buy", "sell", "ship"].includes(side) ? terms[side] : null;
    let haggle = null;
    if (draft.haggle !== undefined && draft.haggle !== null) {
      haggle = negotiate(state, draft.haggle.side, draft.haggle.asks);
      if (haggle.status === "invalid" || haggle.status === "unavailable") errors.haggle = "That negotiation is not valid.";
      else if (haggle.side === side) {
        if (haggle.status === "walked") {
          errors.side = haggle.name + " walked away. No local " + (side === "sell" ? "sale" : "purchase") + " this session.";
          route = null;
        } else if (haggle.status === "counter" || haggle.status === "open") {
          errors.haggle = "Answer " + haggle.name + " before you commit.";
        } else {
          route = { ...route, price: haggle.price };
        }
      }
    }
    const physicalLimit = route?.max || 0;
    if (side !== "hold" && !route && !errors.side) errors.side = "This physical route is unavailable.";
    if (side === "hold" && draft.barrels !== 0) errors.barrels = "A hold order must have zero barrels.";
    if (route && (!whole(draft.barrels) || draft.barrels === 0 || draft.barrels > physicalLimit)) {
      errors.barrels = physicalLimit ? "Enter 1 to " + formatVolume(physicalLimit) + "." : "This route has no available barrels.";
    }
    const ordered = Math.min(amount(draft.barrels), physicalLimit);
    const barrels = state.barrels + (side === "buy" ? ordered : -ordered);

    // Client delivery
    const client = terms.client;
    const choices = client ? (client.defer ? ["accept", "defer", "redirect"] : ["accept", "redirect"]) : ["none"];
    const awaitingClient = !!client && (draft.client === "" || draft.client === undefined);
    if (!choices.includes(draft.client)) errors.client = "Choose how to handle the client delivery.";
    const accepted = draft.client === "accept" ? client?.barrels || 0 : 0;

    // Overflow booking
    const cycle = state.stage + 1;
    const booked = Math.min(amount(draft.storage), terms.storage.max);
    if (!whole(draft.storage) || draft.storage > terms.storage.max) {
      errors.storage = terms.storage.max ? "Enter 0 to " + formatVolume(terms.storage.max) + "." : "Overflow can only be booked on the morning ticket.";
    }
    const termValid = Number.isSafeInteger(draft.storageCycles) && draft.storageCycles >= (booked ? 1 : 0) &&
      draft.storageCycles <= terms.storage.maxCycles;
    if (!termValid) errors.storageCycles = "Choose a booking term of 1 to " + terms.storage.maxCycles + (terms.storage.maxCycles === 1 ? " cycle." : " cycles.");
    const term = booked && termValid ? draft.storageCycles : 0;
    const storageThroughCycle = term ? cycle + term - 1 : null;

    const layout = storageLayout(barrels, state.clientTotal + accepted);
    const storageUsed = layout.ownedOverflow + layout.clientOverflow;
    const activeStorage = leaseCapacity(state.activeLeases, cycle);
    const storageRequired = Math.max(0, storageUsed - activeStorage);
    if (!errors.storage && storageRequired > booked) {
      const unmet = storageRequired - terms.storage.max;
      errors.storage = !terms.storage.max ? "There is no room for that. Overflow can only be booked in the morning, so buy " + formatVolume(storageRequired) + " less." :
        unmet <= 0 ? "Book at least " + formatVolume(storageRequired) + " of overflow for this cycle." :
        "You need " + formatVolume(storageRequired) + " of overflow and only " + formatVolume(terms.storage.max) + " is on offer. " +
        (accepted ? "Sell crude or change the client plan." : "Sell at least " + formatVolume(unmet) + " of crude.");
    }

    // A client's barrels must have somewhere to sit for their whole stay,
    // even if you later sell every barrel of your own.
    if (accepted && !errors.storage && !errors.storageCycles) {
      const commitments = [...state.storageCommitments, { barrels: accepted, throughCycle: client.throughCycle }];
      for (let next = cycle + 1; next <= totalCycles; next++) {
        const committed = commitments.reduce((total, claim) => total + (claim.throughCycle >= next ? claim.barrels : 0), 0);
        const required = Math.max(0, committed - capacity);
        const available = leaseCapacity(state.activeLeases, next) + (storageThroughCycle >= next ? booked : 0);
        if (required > available) {
          errors.storageCycles = "Client cargo alone needs " + formatVolume(required) + " of overflow in cycle " + next +
            ". Extend or enlarge the booking, or change the client plan.";
          break;
        }
      }
    }

    // Futures, one order for each of the four listed months.
    let futuresPositions = state.futuresPositions;
    const trades = draft.futuresTrades;
    if (!Array.isArray(trades) || trades.length !== 4 ||
        !trades.every((quantity) => Number.isSafeInteger(quantity) && Math.abs(quantity) <= 2 * maxFuturesLots)) {
      errors.futuresTrades = "Enter a whole number of lots for each month.";
    } else {
      futuresPositions = futuresPositions.map((holding, slot) => holding + trades[slot]);
      if (grossLots(futuresPositions) > maxFuturesLots) {
        errors.futuresTrades = "The book can hold at most " + maxFuturesLots + " open lots across all months.";
      }
    }

    // Flat-price limit across crude and futures together
    const futuresNet = sum(futuresPositions);
    const exposure = barrels / lot + futuresNet;
    const overBy = (lots) => Math.ceil(Math.abs(lots) - netLimitLots);
    if (!errors.futuresTrades && !errors.barrels && Math.abs(exposure) > netLimitLots) {
      const over = overBy(exposure);
      errors.exposure = "Net position would be " + lotsLabel(Math.abs(exposure)) + (exposure > 0 ? " long" : " short") +
        ". The desk limit is " + netLimitLots + ". " +
        (exposure > 0 ? "Sell " + over + " more futures " + (over === 1 ? "lot" : "lots") + " or hold less crude." :
          "Buy back " + over + " futures " + (over === 1 ? "lot" : "lots") + " or keep more crude.");
    }

    // On expiry day the book must also be inside the limit without the month that is about to go.
    const expiring = state.expiryToday ? state.months[0] : null;
    const afterExpiry = exposure - futuresPositions[0];
    if (expiring && !errors.futuresTrades && !errors.barrels && !errors.exposure && Math.abs(afterExpiry) > netLimitLots) {
      const over = overBy(afterExpiry);
      errors.expiry = expiring + " expires at today’s close. Without it your net position would be " + lotsLabel(Math.abs(afterExpiry)) +
        (afterExpiry > 0 ? " long" : " short") + ". Roll the hedge: " + (afterExpiry > 0 ? "sell " : "buy ") + over + " " + state.months[1] +
        (over === 1 ? " lot" : " lots") + " or more.";
    }

    // How the book left by this ticket responds to the market: to a move in every
    // price, to a move in spot alone, and to the event on watch if there is one.
    const outcome = (effect) => barrels * (effect.flat + effect.premium) + futuresNet * lot * effect.flat;
    const watch = state.market?.watch || null;

    const fee = draft.client === "redirect" ? client?.redirect.fee || 0 : draft.client === "defer" ? client?.defer?.fee || 0 : 0;
    const keys = Object.keys(errors);
    return {
      ok: keys.length === 0,
      // True when the only thing missing is the player's choice for the client.
      awaitingClient: awaitingClient && keys.length === 1,
      errors,
      barrels,
      physicalLimit,
      price: route?.price ?? null,
      haggle,
      ...layout,
      clientInTank: layout.occupancy - (barrels - layout.ownedOverflow),
      storageUsed,
      activeStorage,
      storageRequired,
      storageThroughCycle,
      storageCost: booked * terms.storage.price * term,
      futuresPositions,
      futuresGross: grossLots(futuresPositions),
      netLots: exposure,
      netLotsAfterExpiry: expiring ? afterExpiry : null,
      perDollar: outcome({ flat: 100, premium: 0 }),
      perSpotDime: outcome({ flat: 0, premium: 10 }),
      ifHit: watch ? outcome(watch.hit) : null,
      ifMiss: watch ? outcome(watch.miss) : null,
      transportCost: side === "ship" ? ordered * (terms.ship?.tariff || 0) : 0,
      clientCashflow: accepted * (client?.rate || 0) - fee,
      tankLease: terms.tankLease,
    };
  }

  function snapshot(book, round) {
    const { seed, months, expiryDay, scenario } = book.ctx;
    const barrels = ownedBarrels(book);
    const clients = clientBarrels(book);
    const layout = storageLayout(barrels, clients);
    const market = book.market;
    const held = lotsHeld(book);
    const futuresPositions = [0, 1, 2, 3].map(slot => held[market.firstMonth + slot] || 0);
    const storageBooked = leaseCapacity(book.leases, book.day + 1);
    const storageUsed = layout.ownedOverflow + layout.clientOverflow;
    const components = marked(book);
    const nextShipment = book.queued[0] || null;
    return {
      seed,
      stage: book.day,
      phase: round?.phase ?? "close",
      barrels,
      cargoCost: barrels ? Math.round(book.crude.reduce((basis, batch) => basis + batch.barrels * batch.price, 0) / barrels) : null,
      // The four months listed today, nearest first.
      months: [0, 1, 2, 3].map(slot => months[market.firstMonth + slot]),
      // Every month this run can trade, including one that has expired or is yet to list.
      allMonths: months,
      expiryToday: !!round && book.day === expiryDay && market.firstMonth === 0,
      expiryCycle: expiryDay >= 0 ? expiryDay + 1 : null,
      scenario: scenario ? scenario.key : null,
      futuresPositions,
      futuresGross: grossLots(held),
      netLots: barrels / lot + sum(held),
      futuresBook: futuresBook(book),
      clientTotal: clients,
      clientInTank: clients - layout.clientOverflow,
      clientOverflow: layout.clientOverflow,
      ownedOverflow: layout.ownedOverflow,
      occupancy: layout.occupancy,
      clientLoads: book.loads.map(load => ({ barrels: load.barrels, throughCycle: load.releaseStage })),
      storageCommitments: book.loads.map(load => ({ barrels: load.barrels, throughCycle: load.releaseStage })),
      activeLeases: book.leases.slice(),
      storageBooked,
      storageUsed,
      storageShortfall: Math.max(0, storageUsed - storageBooked),
      incoming: round?.incoming || 0,
      scheduled: nextShipment ? { cycle: nextShipment.stage + 1, barrels: nextShipment.barrels } : null,
      components,
      net: sumComponents(components),
      market,
      round,
    };
  }

  // --- Carrying out a ticket and moving the market -------------------------------------

  function execute(book, round, order, estimate) {
    const { seed, months, scenario } = book.ctx;
    const terms = round.orderBook;
    const before = book.market;
    const netBefore = sumComponents(marked(book));
    const spotBefore = before.prices[0];
    const volume = formatVolume(order.barrels);
    const outcomes = [];
    const labels = [];
    // Why the day's profit or loss came out as it did. The six parts always add up to it.
    const parts = { trading: 0, price: 0, basis: 0, spreads: 0, clients: 0, costs: 0 };

    if (order.side === "buy") {
      book.crude.push({ barrels: order.barrels, price: estimate.price });
      record(book, "physical", "Crude bought", volume + " @ " + priceLabel(estimate.price), 0);
      parts.trading += order.barrels * (spotBefore - estimate.price);
      labels.push("Buy " + volume);
      outcomes.push("Bought " + volume + " at " + priceLabel(estimate.price) + ".");
    } else if (order.side === "sell" || order.side === "ship") {
      const gulf = order.side === "ship";
      sellCrude(book, order.barrels, estimate.price, gulf ? "Gulf Coast crude sale" : "Local crude sale");
      parts.trading += order.barrels * (estimate.price - spotBefore);
      if (gulf) {
        record(book, "logistics", "Pipeline tariff", volume + " @ " + priceLabel(terms.ship.tariff), -estimate.transportCost);
        parts.costs -= estimate.transportCost;
      }
      labels.push((gulf ? "Ship " : "Sell ") + volume);
      outcomes.push((gulf ? "Shipped " : "Sold ") + volume + " at " + priceLabel(estimate.price) + ".");
    }
    if (estimate.haggle?.status === "deal" && estimate.haggle.side === order.side) {
      outcomes.push("Agreed with " + estimate.haggle.name + ", " + priceLabel(estimate.haggle.improve) + " better than their opening price.");
    }

    const client = terms.client;
    if (order.client === "accept") {
      book.loads.push({ barrels: client.barrels, releaseStage: client.throughCycle });
      record(book, "logistics", "Client handling income", formatVolume(client.barrels) + " @ " + priceLabel(client.rate), estimate.clientCashflow);
      parts.clients += estimate.clientCashflow;
      labels.push("Accept client");
      outcomes.push("Accepted " + formatVolume(client.barrels) + " for the client.");
    } else if (order.client === "defer") {
      book.queued.push({ stage: client.defer.cycle - 1, barrels: client.barrels });
      record(book, "logistics", "Client delivery rescheduled", formatVolume(client.barrels), estimate.clientCashflow);
      parts.costs += estimate.clientCashflow;
      labels.push("Reschedule client");
      outcomes.push("Moved the client delivery to cycle " + client.defer.cycle + ".");
    } else if (order.client === "redirect") {
      record(book, "logistics", "Client sent elsewhere", formatVolume(client.barrels), estimate.clientCashflow);
      parts.costs += estimate.clientCashflow;
      labels.push("Turn client away");
      outcomes.push("Sent the client to another terminal.");
    }

    if (order.storage) {
      book.leases.push({
        barrels: order.storage, fromCycle: book.day + 1, throughCycle: estimate.storageThroughCycle, price: terms.storage.price,
      });
      record(book, "logistics", "Overflow booked", formatVolume(order.storage) + " through cycle " + estimate.storageThroughCycle +
        " @ " + priceLabel(terms.storage.price) + " per cycle", -estimate.storageCost);
      parts.costs -= estimate.storageCost;
      labels.push("Book " + formatVolume(order.storage));
      outcomes.push("Booked " + formatVolume(order.storage) + " of overflow through cycle " + estimate.storageThroughCycle + ".");
    }

    order.futuresTrades.forEach((quantity, slot) => {
      if (!quantity) return;
      const month = before.firstMonth + slot;
      tradeFutures(book, month, quantity, before.prices[slot + 1]);
      labels.push((quantity > 0 ? "Buy " : "Sell ") + Math.abs(quantity) + " " + months[month]);
    });

    if (terms.tankLease) {
      record(book, "logistics", "Tank A lease", "Cycle " + (book.day + 1), -terms.tankLease);
      parts.costs -= terms.tankLease;
    }

    const held = ownedBarrels(book);
    const lots = lotsHeld(book);
    if (!outcomes.length) outcomes.push(held ? "Held " + formatVolume(held) + " of crude." : "Stayed flat.");

    // The market moves: to the afternoon if midday brings news, otherwise through to the next morning.
    const path = [before];
    if (scenario) {
      path.push(scenarioMove(scenario, before));
    } else if (round.phase === "am") {
      const midday = middayMove(seed, before);
      path.push(midday);
      if (!midday.material) path.push(overnightMove(book.ctx, midday));
    } else {
      path.push(overnightMove(book.ctx, before));
    }
    const after = path.at(-1);
    book.market = after;

    // The move, split three ways: the whole curve moving on the net position,
    // spot moving against the front month on the crude, and the months moving against each other.
    const front = before.firstMonth;
    const frontMove = monthPrice(after, front) - before.prices[1];
    const spotMove = after.prices[0] - spotBefore;
    parts.price += (held + sum(lots) * lot) * frontMove;
    parts.basis += held * (spotMove - frontMove);
    lots.forEach((position, month) => {
      if (position) parts.spreads += position * lot * (monthPrice(after, month) - monthPrice(before, month) - frontMove);
    });

    if (after.expired && lots[after.expired.month]) {
      tradeFutures(book, after.expired.month, -lots[after.expired.month], after.expired.price, true);
      outcomes.push(after.expired.name + " expired and " + Math.abs(lots[after.expired.month]) + " lots were settled at " + priceLabel(after.expired.price) + ".");
    }

    if (after.phase !== "pm") {
      // A day has ended.
      if (after.phase === "close") {
        if (held) {
          const auction = after.prices[0] - 18;
          sellCrude(book, held, auction, "Closing auction");
          parts.trading -= 18 * held;
          outcomes.push("The closing auction took " + formatVolume(held) + " at " + priceLabel(auction) + ".");
        }
        lotsHeld(book).forEach((position, month) => {
          if (position) tradeFutures(book, month, -position, monthPrice(after, month));
        });
      }
      book.queued = book.queued.filter((shipment) => shipment.stage > book.day);
      book.loads = book.loads.filter((load) => load.releaseStage > book.day + 1);
      book.day++;
      book.leases = book.leases.filter(lease => lease.throughCycle > book.day);
    }

    const components = marked(book);
    const netAfter = sumComponents(components);
    book.peak = Math.max(book.peak, netAfter);
    book.maxDrawdown = Math.max(book.maxDrawdown, book.peak - netAfter);
    book.exposureDays.push(Math.abs(held / lot + sum(lots)));
    book.decisions.push(order);
    book.history.push({
      cycle: before.day + 1,
      phase: round.phase,
      label: labels.join(" · ") || (held ? "Hold" : "Stay flat"),
      outcome: outcomes.join(" "),
      netBefore,
      netAfter,
      delta: netAfter - netBefore,
      parts,
      components,
      path,
      marketBefore: before,
      market: after,
    });
  }

  // --- A run, rebuilt from its seed and decisions ------------------------------------------

  // What stays fixed for a whole run: its seed, and either the generated market's
  // calendar or a scenario's.
  function context(seed, scenario) {
    return scenario ?
      { seed, scenario: checkScenario(scenario), months: scenario.months, expiryDay: scenario.expiry ? scenario.expiry - 1 : -1 } :
      { seed, scenario: null, months: monthNames, expiryDay };
  }

  function newBook(ctx) {
    const market = ctx.scenario ? scenarioOpening(ctx.scenario) : openingMarket();
    // A scenario starts with the same book, bought and hedged at that day's real prices.
    const cost = ctx.scenario ? market.prices[0] : cargoCost;
    const hedge = ctx.scenario ? market.prices[1] : hedgeEntry;
    return {
      ctx,
      day: 0,
      market,
      crude: [{ barrels: 6000, price: cost }],
      futures: ctx.months.map((_, month) => month ? [] : Array.from({ length: 6 }, () => ({ side: -1, price: hedge }))),
      futuresRealized: ctx.months.map(() => 0),
      loads: [],
      leases: [],
      queued: [],
      entries: [],
      realized: { physical: 0, hedge: 0, logistics: 0 },
      decisions: [],
      history: [],
      exposureDays: [],
      openingValue: (market.prices[0] - cost) * 6000,
      session: null,
      peak: (market.prices[0] - cost) * 6000,
      maxDrawdown: 0,
    };
  }

  const nextRound = (book, seed) => book.market.phase === "close" ? null : book.market.phase === "pm" ? buildAfternoon(book) : buildMorning(book, seed);

  // An invalid decision stops the replay at the last valid ticket.
  // Pass a scenario to play real prices instead of a generated market.
  function replay(seed, decisions = [], { withReview = true, scenario = null } = {}) {
    const runSeed = typeof seed === "string" && seed.trim() ? seed.trim() : "CUSHING";
    const book = newBook(context(runSeed, scenario));
    let round = nextRound(book, runSeed);
    for (const decision of Array.isArray(decisions) ? decisions : []) {
      if (!round || !decision || typeof decision !== "object") break;
      const { side, barrels, storage, storageCycles, client, futuresTrades, haggle } = decision;
      const order = { side, barrels, storage, storageCycles: storage ? storageCycles : 0, client, futuresTrades };
      if (haggle && haggle.side === side) order.haggle = { side: haggle.side, asks: Array.isArray(haggle.asks) ? haggle.asks.slice(0, 2) : [] };
      const estimate = preview(snapshot(book, round), order);
      if (!estimate.ok) break;
      order.futuresTrades = futuresTrades.slice();
      execute(book, round, order, estimate);
      round = nextRound(book, runSeed);
    }

    const state = {
      ...snapshot(book, round),
      entries: book.entries,
      decisions: book.decisions,
      history: book.history,
      maxDrawdown: book.maxDrawdown,
    };
    if (!round && withReview) state.review = review(state, book);
    return state;
  }

  // --- The end-of-run review ----------------------------------------------------------------

  // The simplest sensible way to run the book: keep the crude, keep it hedged, roll
  // the hedge at expiry, take a client only when it fits in the tank, and never trade.
  function holdAndHedge(state) {
    const book = state.round.orderBook;
    const hedgeSlot = state.expiryToday ? 1 : 0;
    const clients = book.client ? ["accept", "redirect"] : ["none"];
    const sales = [0, Math.min(book.sell.max, state.storageShortfall)];
    for (const client of clients) {
      for (const sold of sales) {
        const left = state.barrels - sold;
        const order = {
          side: sold ? "sell" : "hold", barrels: sold, client, storage: 0, storageCycles: 0,
          futuresTrades: state.futuresPositions.map((held, slot) => (slot === hedgeSlot ? -Math.round(left / lot) : 0) - held),
        };
        if (preview(state, order).ok) return order;
      }
    }
    return null;
  }

  function benchmark(seed, scenario) {
    let state = replay(seed, [], { withReview: false, scenario });
    while (state.round) {
      const order = holdAndHedge(state);
      if (!order) return null;
      state = replay(seed, [...state.decisions, order], { withReview: false, scenario });
    }
    return state.net;
  }

  function review(state, book) {
    const totals = { trading: 0, price: 0, basis: 0, spreads: 0, clients: 0, costs: 0 };
    for (const step of state.history) for (const key of Object.keys(totals)) totals[key] += step.parts[key];
    // The opening book was already marked a little above cost (or at cost, in a scenario).
    const opening = state.net - sum(Object.values(totals));
    // Profit made for each dollar of the worst fall along the way. Falls under $2,000 count as $2,000.
    const ratio = state.net / Math.max(state.maxDrawdown, 200000);
    // A scenario gets no letter. Its one fixed price path decides most of the result, so
    // the fair measure there is the comparison with holding the hedged cargo.
    const grade = book.ctx.scenario ? null : ratio >= 4 ? "A" : ratio >= 2 ? "B" : ratio >= .75 ? "C" : ratio >= 0 ? "D" : "E";
    return {
      parts: totals,
      opening,
      openingExpected: book.openingValue,
      benchmark: benchmark(state.seed, book.ctx.scenario),
      ratio,
      grade,
      averageExposure: book.exposureDays.length ? sum(book.exposureDays) / book.exposureDays.length : 0,
    };
  }

  const game = {
    replay, preview, negotiate, dateLabel, totalCycles, capacity, lot, monthNames, maxFuturesLots, netLimitLots, tankLease,
    shockChance, expiryCycle: expiryDay + 1, reportCycles: reportDays.map(day => day + 1),
  };
  if (typeof module !== "undefined" && module.exports) module.exports = game;
  else window.CargoDesk = game;
})();
