(function () {
  "use strict";

  // All money is in whole cents and all prices in cents per barrel.
  const totalCycles = 10;
  const capacity = 10000;
  const lot = 1000;
  const cargoCost = 7220;
  const hedgeEntry = 7360;
  const futuresMonths = ["Dec", "Jan", "Feb", "Mar"];
  const maxFuturesLots = 20;
  // The desk's flat-price limit: owned crude plus futures, in lots, long or short.
  const netLimitLots = 2;
  // Tank A is leased at a fixed rate, whether it holds your crude, a client's or nothing.
  const tankLease = 80000;
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
      key: "stocks",
      desk: "Risk desk",
      title: "The next stocks release is in play.",
      brief: "Physical bids are firm while the market waits for the next inventory number. Prices will move before your next decision.",
      bidPremium: [-10, 58],
      offerPremium: [5, 48],
    },
  ];

  const formatVolume = (barrels) => barrels.toLocaleString("en-US") + " bbl";
  const priceLabel = (cents) => "$" + (cents / 100).toFixed(2);
  const lotsLabel = (lots) => (Number.isInteger(lots) ? String(lots) : lots.toFixed(1)) + (Math.abs(lots) === 1 ? " lot" : " lots");

  // Market and terminal draws come from separate streams, so the price path of
  // a seed is the same whatever the player does at the terminal.
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

  function moveMarket(seed, stage, previous) {
    const day = Math.min(stage, totalCycles - 1);
    const time = "W" + (Math.floor(day / 5) + 1) + " " + weekdays[day % 5] + (stage === totalCycles ? " · 16:00" : " · 08:30");
    if (!previous) return { time, prices: openingPrices.slice(), headline: "Opening marks" };

    const draw = randomStream(seed, stage, "market");
    const event = draw(0, 99);
    const change = draw(-95, 95);
    const convergence = draw(-22, 22);
    const news = event < 15 ? { move: draw(95, 210), headline: "A stock draw lifted the front of the curve" } :
      event < 30 ? { move: -draw(95, 210), headline: "An inventory build weighed on prompt crude" } :
      event < 41 ? { move: draw(-68, -28), headline: "Refiners pulled back on buying" } :
      event < 52 ? { move: draw(28, 68), headline: "Stronger refinery runs supported crude" } :
      { move: 0, headline: "WTI repriced in ordinary trading" };
    const spot = Math.max(4600, Math.min(10500, previous.prices[0] + change + news.move));
    // The gap between spot and the front month decays by about a third each
    // cycle, so a contango pays the holder of hedged crude and a backwardation costs them.
    const slope = Math.max(-115, Math.min(128, Math.round((previous.prices[1] - previous.prices[0]) * .67 - news.move * .21 + convergence)));
    const tailSlope = Math.max(-52, Math.min(58, Math.round(slope * .32) + draw(-16, 16)));
    const front = spot + slope;
    return {
      time,
      prices: [spot, front, front + tailSlope, front + tailSlope + Math.round(tailSlope * .7), front + tailSlope + Math.round(tailSlope * 1.2)],
      headline: news.headline,
    };
  }

  const ownedBarrels = (book) => book.crude.reduce((total, batch) => total + batch.barrels, 0);
  const clientBarrels = (book) => book.loads.reduce((total, load) => total + load.barrels, 0);

  // Your own crude takes Tank A first. Whatever does not fit goes off-site.
  function storageLayout(owned, clients) {
    const ownedOverflow = Math.max(0, owned - capacity);
    const clientOverflow = Math.max(0, clients - Math.max(0, capacity - owned));
    return { ownedOverflow, clientOverflow, occupancy: owned + clients - ownedOverflow - clientOverflow };
  }

  function leaseCapacity(leases, cycle) {
    return leases.reduce((total, lease) => lease.fromCycle <= cycle && lease.throughCycle >= cycle ? total + lease.barrels : total, 0);
  }

  function positions(futures) {
    return futures.map(contracts => contracts.length * (contracts[0]?.side ?? 1));
  }

  const grossLots = (holdings) => holdings.reduce((total, contracts) => total + Math.abs(contracts), 0);
  const netLots = (barrels, holdings) => barrels / lot + holdings.reduce((total, contracts) => total + contracts, 0);

  function record(book, category, label, detail, cents) {
    book.entries.push({ category, label, detail, cents, cycle: book.stage + 1 });
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

  function tradeFutures(book, maturity, traded) {
    if (!traded) return;
    const contracts = book.futures[maturity];
    const price = book.market.prices[maturity + 1];
    const side = Math.sign(traded);
    const fills = Math.abs(traded);
    const name = futuresMonths[maturity] + " WTI";
    const closing = contracts[0]?.side === -side ? Math.min(fills, contracts.length) : 0;
    if (closing) {
      const closed = contracts.splice(0, closing);
      const gain = closed.reduce((total, contract) => total + (price - contract.price) * contract.side * lot, 0);
      book.futuresRealized[maturity] += gain;
      record(book, "hedge", name + (side > 0 ? " bought back" : " sold to close"), closing + " lots @ " + priceLabel(price), gain);
    }
    const opening = fills - closing;
    if (opening) {
      for (let count = 0; count < opening; count++) contracts.push({ side, price });
      record(book, "hedge", name + (side > 0 ? " bought" : " sold"), opening + " lots @ " + priceLabel(price), 0);
    }
  }

  function futuresBook(book) {
    const holdings = positions(book.futures);
    return book.futures.map((contracts, maturity) => {
      const mark = book.market.prices[maturity + 1];
      const realized = book.futuresRealized[maturity];
      const unrealized = contracts.reduce((total, contract) => total + (mark - contract.price) * contract.side * lot, 0);
      return {
        position: holdings[maturity],
        averageEntry: contracts.length ? Math.round(contracts.reduce((sum, contract) => sum + contract.price, 0) / contracts.length) : null,
        mark,
        pnl: realized + unrealized,
      };
    });
  }

  function marked(book) {
    const spot = book.market.prices[0];
    return {
      physical: book.realized.physical + book.crude.reduce((sum, batch) => sum + batch.barrels * (spot - batch.price), 0),
      hedge: futuresBook(book).reduce((total, contract) => total + contract.pnl, 0),
      logistics: book.realized.logistics,
    };
  }

  const sumComponents = (components) => components.physical + components.hedge + components.logistics;

  // Everything the player can trade against this cycle.
  function buildRound(book, seed) {
    const stage = book.stage;
    const draw = randomStream(seed, stage, "terminal");
    const owned = ownedBarrels(book);
    const clients = clientBarrels(book);
    const layout = storageLayout(owned, clients);
    const free = capacity - layout.occupancy;
    const spot = book.market.prices[0];
    const first = stage === 0;
    const final = stage === totalCycles - 1;
    const due = book.queued.find((shipment) => shipment.stage === stage);
    // Clients turn up more often when the tank is already tight.
    const arrival = first || due || (!final && draw(0, 99) < (free <= 3000 ? 51 : 30));
    const inbound = first ? 6000 : due ? due.barrels : arrival ? draw(2, 6) * lot : 0;
    const event = first || final ? null : terminalEvents[draw(0, terminalEvents.length - 1)];

    const bid = spot + (first ? -draw(18, 52) : final ? draw(12, 46) : draw(...event.bidPremium));
    const offer = spot + (event ? draw(...event.offerPremium) : draw(5, 30));
    const buyMax = draw(2, 6) * lot;
    const sellLimit = final ? owned : draw(2, event?.key === "maintenance" ? 3 : 6) * lot;
    const storageMax = draw(4, 6) * lot;
    const storagePrice = event?.key === "maintenance" ? draw(12, 20) : draw(7, 14);
    const shortfall = Math.max(0, layout.ownedOverflow + layout.clientOverflow - leaseCapacity(book.leases, stage + 1));

    let ship = null;
    if (owned && (final || event?.key === "pipeline")) {
      const max = Math.min(owned, (final ? draw(3, 6) : draw(2, 5)) * lot);
      const price = spot + (final ? draw(70, 145) : draw(63, 144));
      ship = { price, max, tariff: final ? draw(38, 95) : draw(44, 94) };
    }

    let client = null;
    if (inbound) {
      const releaseAfter = draw(2, 4);
      const rate = draw(28, 56);
      const deferFee = draw(650, 1650) * 100;
      const redirectFee = draw(800, 1900) * 100;
      const preferred = draw(1, 2);
      const delay = due ? undefined : [preferred, 3 - preferred].find((cycles) =>
        stage + cycles < totalCycles - 1 && !book.queued.some((shipment) => shipment.stage === stage + cycles));
      client = {
        barrels: inbound,
        rate,
        releaseAfter,
        throughCycle: Math.min(totalCycles, stage + releaseAfter),
        defer: delay === undefined ? null : { cycle: stage + delay + 1, fee: deferFee },
        redirect: { fee: redirectFee },
      };
    }

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
      desk: final ? "Final settlement" : client ? "Terminal operations" : event.desk,
      title,
      message,
      // On a client cycle the market event still sets the bids, so it is shown beside the client request.
      marketNote: client && event ? event.title : null,
      event: event?.key ?? null,
      incoming: inbound,
      orderBook: {
        buy: { price: Math.max(offer, bid + 1), max: buyMax },
        sell: { price: bid, max: Math.min(owned, Math.max(sellLimit, shortfall)) },
        ship,
        storage: { price: storagePrice, max: storageMax, maxCycles: totalCycles - stage },
        client,
        futuresPrices: book.market.prices.slice(1),
        tankLease,
      },
    };
  }

  // Checks a draft ticket against the current state and prices it. Nothing is changed.
  function preview(state, draft = {}) {
    const round = state?.round;
    if (!round || !draft || typeof draft !== "object") return { ok: false, errors: { side: "The book is closed." } };

    const terms = round.orderBook;
    const errors = {};
    const whole = (value) => Number.isSafeInteger(value) && value >= 0;
    const amount = (value) => whole(value) ? value : 0;

    // Physical order
    const route = ["buy", "sell", "ship"].includes(draft.side) ? terms[draft.side] : null;
    const physicalLimit = route?.max || 0;
    if (draft.side !== "hold" && !route) errors.side = "This physical route is unavailable.";
    if (draft.side === "hold" && draft.barrels !== 0) errors.barrels = "A hold order must have zero barrels.";
    if (route && (!whole(draft.barrels) || draft.barrels === 0 || draft.barrels > physicalLimit)) {
      errors.barrels = physicalLimit ? "Enter 1 to " + formatVolume(physicalLimit) + "." : "This route has no available barrels.";
    }
    const ordered = Math.min(amount(draft.barrels), physicalLimit);
    const barrels = state.barrels + (draft.side === "buy" ? ordered : -ordered);

    // Client delivery
    const client = terms.client;
    const choices = client ? (client.defer ? ["accept", "defer", "redirect"] : ["accept", "redirect"]) : ["none"];
    const awaitingClient = !!client && (draft.client === "" || draft.client === undefined);
    if (!choices.includes(draft.client)) errors.client = "Choose how to handle the client delivery.";
    const accepted = draft.client === "accept" ? client?.barrels || 0 : 0;

    // Overflow booking
    const cycle = state.stage + 1;
    const booked = Math.min(amount(draft.storage), terms.storage.max);
    if (!whole(draft.storage) || draft.storage > terms.storage.max) errors.storage = "Enter 0 to " + formatVolume(terms.storage.max) + ".";
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
      errors.storage = unmet <= 0 ? "Book at least " + formatVolume(storageRequired) + " of overflow for this cycle." :
        "You need " + formatVolume(storageRequired) + " of overflow and only " + formatVolume(terms.storage.max) + " is on offer. " +
        (accepted ? "Sell crude or change the client plan." : "Sell at least " + formatVolume(unmet) + " of crude.");
    }

    // A client's barrels must have somewhere to sit for their whole stay,
    // even if you later sell every barrel of your own.
    if (accepted && !errors.storage && !errors.storageCycles) {
      const commitments = [...state.storageCommitments, { barrels: accepted, throughCycle: client.throughCycle }];
      for (let next = cycle + 1; next <= totalCycles; next++) {
        const committed = commitments.reduce((sum, claim) => sum + (claim.throughCycle >= next ? claim.barrels : 0), 0);
        const required = Math.max(0, committed - capacity);
        const available = leaseCapacity(state.activeLeases, next) + (storageThroughCycle >= next ? booked : 0);
        if (required > available) {
          errors.storageCycles = "Client cargo alone needs " + formatVolume(required) + " of overflow in cycle " + next +
            ". Extend or enlarge the booking, or change the client plan.";
          break;
        }
      }
    }

    // Futures
    let futuresPositions = state.futuresPositions;
    const trades = draft.futuresTrades;
    if (!Array.isArray(trades) || trades.length !== futuresMonths.length ||
        !trades.every((quantity) => Number.isSafeInteger(quantity) && Math.abs(quantity) <= 2 * maxFuturesLots)) {
      errors.futuresTrades = "Enter a whole number of lots for each month.";
    } else {
      futuresPositions = futuresPositions.map((holding, maturity) => holding + trades[maturity]);
      if (grossLots(futuresPositions) > maxFuturesLots) {
        errors.futuresTrades = "The book can hold at most " + maxFuturesLots + " open lots across all months.";
      }
    }

    // Flat-price limit across crude and futures together
    const exposure = netLots(barrels, futuresPositions);
    if (!errors.futuresTrades && !errors.barrels && Math.abs(exposure) > netLimitLots) {
      const over = Math.ceil(Math.abs(exposure) - netLimitLots);
      errors.exposure = "Net position would be " + lotsLabel(Math.abs(exposure)) + (exposure > 0 ? " long" : " short") +
        ". The desk limit is " + netLimitLots + ". " +
        (exposure > 0 ? "Sell " + over + " more futures " + (over === 1 ? "lot" : "lots") + " or hold less crude." :
          "Buy back " + over + " futures " + (over === 1 ? "lot" : "lots") + " or keep more crude.");
    }

    const fee = draft.client === "redirect" ? client?.redirect.fee || 0 : draft.client === "defer" ? client?.defer?.fee || 0 : 0;
    const keys = Object.keys(errors);
    return {
      ok: keys.length === 0,
      // True when the only thing missing is the player's choice for the client.
      awaitingClient: awaitingClient && keys.length === 1,
      errors,
      barrels,
      physicalLimit,
      ...layout,
      storageUsed,
      activeStorage,
      storageRequired,
      storageThroughCycle,
      storageCost: booked * terms.storage.price * term,
      futuresPositions,
      futuresGross: grossLots(futuresPositions),
      netLots: exposure,
      transportCost: draft.side === "ship" ? ordered * (terms.ship?.tariff || 0) : 0,
      clientCashflow: accepted * (client?.rate || 0) - fee,
      tankLease: terms.tankLease,
    };
  }

  function snapshot(book, round) {
    const barrels = ownedBarrels(book);
    const clients = clientBarrels(book);
    const layout = storageLayout(barrels, clients);
    const futuresPositions = positions(book.futures);
    const storageBooked = leaseCapacity(book.leases, book.stage + 1);
    const storageUsed = layout.ownedOverflow + layout.clientOverflow;
    const components = marked(book);
    const nextShipment = book.queued[0] || null;
    return {
      stage: book.stage,
      barrels,
      cargoCost: barrels ? Math.round(book.crude.reduce((basis, batch) => basis + batch.barrels * batch.price, 0) / barrels) : null,
      futuresPositions,
      futuresGross: grossLots(futuresPositions),
      netLots: netLots(barrels, futuresPositions),
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
      market: book.market,
      round,
    };
  }

  function execute(book, round, order, estimate, seed) {
    const terms = round.orderBook;
    const marketBefore = book.market;
    const netBefore = sumComponents(marked(book));
    const volume = formatVolume(order.barrels);
    const outcomes = [];
    const labels = [];

    if (order.side === "buy") {
      const price = terms.buy.price;
      book.crude.push({ barrels: order.barrels, price });
      record(book, "physical", "Crude bought", volume + " @ " + priceLabel(price), 0);
      labels.push("Buy " + volume);
      outcomes.push("Bought " + volume + " at " + priceLabel(price) + ".");
    } else if (order.side === "sell" || order.side === "ship") {
      const gulf = order.side === "ship";
      const price = terms[order.side].price;
      sellCrude(book, order.barrels, price, gulf ? "Gulf Coast crude sale" : "Local crude sale");
      if (gulf) record(book, "logistics", "Pipeline tariff", volume + " @ " + priceLabel(terms.ship.tariff), -estimate.transportCost);
      labels.push((gulf ? "Ship " : "Sell ") + volume);
      outcomes.push((gulf ? "Shipped " : "Sold ") + volume + " at " + priceLabel(price) + ".");
    }

    const client = terms.client;
    if (order.client === "accept") {
      book.loads.push({ barrels: client.barrels, releaseStage: client.throughCycle });
      record(book, "logistics", "Client handling income", formatVolume(client.barrels) + " @ " + priceLabel(client.rate), estimate.clientCashflow);
      labels.push("Accept client");
      outcomes.push("Accepted " + formatVolume(client.barrels) + " for the client.");
    } else if (order.client === "defer") {
      book.queued.push({ stage: client.defer.cycle - 1, barrels: client.barrels });
      record(book, "logistics", "Client delivery rescheduled", formatVolume(client.barrels), estimate.clientCashflow);
      labels.push("Reschedule client");
      outcomes.push("Moved the client delivery to cycle " + client.defer.cycle + ".");
    } else if (order.client === "redirect") {
      record(book, "logistics", "Client sent elsewhere", formatVolume(client.barrels), estimate.clientCashflow);
      labels.push("Turn client away");
      outcomes.push("Sent the client to another terminal.");
    }

    if (order.storage) {
      book.leases.push({
        barrels: order.storage, fromCycle: book.stage + 1, throughCycle: estimate.storageThroughCycle, price: terms.storage.price,
      });
      record(book, "logistics", "Overflow booked", formatVolume(order.storage) + " through cycle " + estimate.storageThroughCycle +
        " @ " + priceLabel(terms.storage.price) + " per cycle", -estimate.storageCost);
      labels.push("Book " + formatVolume(order.storage));
      outcomes.push("Booked " + formatVolume(order.storage) + " of overflow through cycle " + estimate.storageThroughCycle + ".");
    }

    order.futuresTrades.forEach((quantity, maturity) => {
      if (!quantity) return;
      tradeFutures(book, maturity, quantity);
      labels.push((quantity > 0 ? "Buy " : "Sell ") + Math.abs(quantity) + " " + futuresMonths[maturity]);
    });

    record(book, "logistics", "Tank A lease", "Cycle " + (book.stage + 1), -terms.tankLease);

    const held = ownedBarrels(book);
    if (!outcomes.length) outcomes.push(held ? "Held " + formatVolume(held) + " of crude." : "Stayed flat.");

    // The market moves, then the last cycle settles everything still open.
    book.market = moveMarket(seed, book.stage + 1, book.market);
    if (book.stage + 1 === totalCycles) {
      if (held) {
        const auction = book.market.prices[0] - 18;
        sellCrude(book, held, auction, "Closing auction");
        outcomes.push("The closing auction took " + formatVolume(held) + " at " + priceLabel(auction) + ".");
      }
      positions(book.futures).forEach((holding, maturity) => tradeFutures(book, maturity, -holding));
    }

    book.queued = book.queued.filter((shipment) => shipment.stage > book.stage);
    book.loads = book.loads.filter((load) => load.releaseStage > book.stage + 1);
    book.stage++;
    book.leases = book.leases.filter(lease => lease.throughCycle > book.stage);

    const components = marked(book);
    const netAfter = sumComponents(components);
    book.peak = Math.max(book.peak, netAfter);
    book.maxDrawdown = Math.max(book.maxDrawdown, book.peak - netAfter);
    book.decisions.push(order);
    book.history.push({
      cycle: book.stage,
      label: labels.join(" · ") || (held ? "Hold" : "Stay flat"),
      outcome: outcomes.join(" "),
      netBefore,
      netAfter,
      delta: netAfter - netBefore,
      components,
      marketBefore,
      market: book.market,
    });
  }

  // Rebuilds the whole run from its seed and the decisions made so far.
  // An invalid decision stops the replay at the last valid cycle.
  function replay(seed, decisions = []) {
    const runSeed = typeof seed === "string" && seed.trim() ? seed.trim() : "CUSHING";
    const book = {
      stage: 0,
      market: moveMarket(runSeed, 0),
      crude: [{ barrels: 6000, price: cargoCost }],
      futures: [Array.from({ length: 6 }, () => ({ side: -1, price: hedgeEntry })), [], [], []],
      futuresRealized: futuresMonths.map(() => 0),
      loads: [],
      leases: [],
      queued: [],
      entries: [],
      realized: { physical: 0, hedge: 0, logistics: 0 },
      decisions: [],
      history: [],
      peak: (openingPrices[0] - cargoCost) * 6000,
      maxDrawdown: 0,
    };

    let round = buildRound(book, runSeed);
    for (const decision of Array.isArray(decisions) ? decisions : []) {
      if (!round || !decision || typeof decision !== "object") break;
      const { side, barrels, storage, storageCycles, client, futuresTrades } = decision;
      const order = { side, barrels, storage, storageCycles: storage ? storageCycles : 0, client, futuresTrades };
      const estimate = preview(snapshot(book, round), order);
      if (!estimate.ok) break;
      order.futuresTrades = futuresTrades.slice();
      execute(book, round, order, estimate, runSeed);
      round = book.stage < totalCycles ? buildRound(book, runSeed) : null;
    }

    return {
      seed: runSeed,
      ...snapshot(book, round),
      entries: book.entries,
      decisions: book.decisions,
      history: book.history,
      maxDrawdown: book.maxDrawdown,
    };
  }

  const game = { replay, preview, totalCycles, capacity, lot, futuresMonths, maxFuturesLots, netLimitLots, tankLease };
  if (typeof module !== "undefined" && module.exports) module.exports = game;
  else window.CargoDesk = game;
})();
