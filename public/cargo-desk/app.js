(function () {
  "use strict";

  const { replay, preview, hedgeOrder, negotiate, dateLabel, totalCycles, capacity, lot, maxFuturesLots, netLimitLots } = window.CargoDesk;
  // Historical scenarios: real prices in place of the generated market.
  const scenarios = window.CargoScenarios || [];
  const { transition, reveal } = window.CargoMotion;
  const root = document.documentElement;
  const element = (id) => document.getElementById(id);
  const set = (id, value) => { element(id).textContent = value; };
  const number = (value) => value.toLocaleString("en-US");
  // Prices can be negative in a historical scenario, so the sign goes before the dollar.
  // The word joiner keeps a minus sign on the same line as its figure.
  const quote = (cents) => (cents < 0 ? "−\u2060" : "") + "$" + (Math.abs(cents) / 100).toFixed(2);
  const cents = (value) => value + "¢";
  const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const exactDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const unsignedMoney = (value) => (value % 100 ? exactDollars : wholeDollars).format(Math.abs(value) / 100);
  const money = (value) => (value < 0 ? "−\u2060" : value > 0 ? "+" : "") + unsignedMoney(value);
  const tone = (value) => value < 0 ? "negative" : value > 0 ? "positive" : "";
  const curveMargins = { left: 40, right: 10, top: 14, bottom: 12 };
  const runKey = "cargo-desk-run-v6";
  const seedsKey = "cargo-desk-seeds-v6";
  const previousRunKey = "cargo-desk-run-v5";
  const previousSeedsKey = "cargo-desk-seeds-v5";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The main site has its own pause control, stored on the root element.
  const still = () => reducedMotion.matches || root.dataset.motion === "paused";
  const form = element("decision-form");
  const fields = element("order-ticket");
  const slider = element("order-barrels-range");
  const inputs = {
    barrels: element("order-barrels"),
    storage: element("order-storage"),
    storageCycles: element("order-storage-cycles"),
  };
  const deliveryInputs = {
    enabled: element("delivery-enabled"),
    cycle: element("delivery-cycle"),
    barrels: element("delivery-barrels"),
    route: element("delivery-route"),
    month: element("delivery-month"),
  };
  // What each part of a day's profit or loss is called on screen.
  const partNames = {
    trading: "Trade prices against spot",
    price: "The whole curve moving on your net position",
    basis: "Spot moving against futures",
    spreads: "Calendar spreads",
    clients: "Client income",
    costs: "Lease, storage and fees",
  };
  let futuresInputs = [];
  let run;
  let state;
  // What the player has said so far to each counterparty on this ticket.
  let haggles = { buy: [], sell: [] };
  let quoteIndex = -1;

  // --- Formatting ------------------------------------------------------------

  function lotsText(lots) {
    const size = Math.abs(lots);
    return (Number.isInteger(size) ? String(size) : size.toFixed(1)) + (size === 1 ? " lot" : " lots");
  }

  const exposureText = (lots) => lots ? lotsText(lots) + (lots > 0 ? " long" : " short") : "Flat";
  const positionText = (lots) => lots ? (lots > 0 ? "Long " : "Short ") + number(Math.abs(lots)) : "Flat";

  function futuresSummary(positions) {
    const long = positions.reduce((total, lots) => total + Math.max(0, lots), 0);
    const short = positions.reduce((total, lots) => total + Math.max(0, -lots), 0);
    return [long ? number(long) + " long" : "", short ? number(short) + " short" : ""].filter(Boolean).join(", ") || "No futures";
  }

  // A price change in dollars with its sign, for example +$1.20.
  const move = (value) => (value < 0 ? "−" : "+") + "$" + (Math.abs(value) / 100).toFixed(2);
  // Estimates are shown to the nearest ten dollars, so they do not read as exact.
  const roughly = (value) => money(Math.round(value / 1000) * 1000);
  const effectText = (effect) => "Futures about " + move(effect.flat) + ", spot about " + move(effect.flat + effect.premium);

  function amount(id, value) {
    const node = element(id);
    node.textContent = money(value);
    node.classList.toggle("positive", value > 0);
    node.classList.toggle("negative", value < 0);
  }

  function withUnit(id, value, unit) {
    const small = document.createElement("small");
    small.textContent = unit;
    element(id).replaceChildren(value, small);
  }

  function append(parent, tag, text, className) {
    const child = document.createElement(tag);
    if (text !== undefined) child.textContent = text;
    if (className) child.className = className;
    parent.append(child);
    return child;
  }

  // The price of a futures month, named by its place in the full list of months.
  function monthPrice(market, month) {
    if (market.expired?.month === month) return market.expired.price;
    const slot = month - market.firstMonth;
    return slot >= 0 && slot < 4 ? market.prices[slot + 1] : null;
  }

  // The scenario a run is playing, if any, and a replay of the run so far.
  const scenarioOf = (target = run) => scenarios.find(item => item.key === target?.scenario) || null;
  const play = (decisions, options = {}) => replay(run.seed, decisions, {
    ...options, scenario: scenarioOf(), legacyEstimateThrough: run.legacyEstimateThrough ?? 0,
  });
  const shortDate = dateLabel;

  // --- Saved run and the ranked/practice rule ---------------------------------

  function randomSeed() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function startedSeeds() {
    try {
      const saved = JSON.parse(localStorage.getItem(seedsKey) ?? localStorage.getItem(previousSeedsKey));
      return Array.isArray(saved) ? saved.filter(seed => typeof seed === "string") : [];
    } catch {
      return [];
    }
  }

  // A run is ranked only the first time a freshly generated market is played.
  // Prices repeat for a seed, so any later play of it would have hindsight.
  function claimSeed(seed, generated) {
    const seen = startedSeeds();
    const fresh = generated && !seen.includes(seed);
    if (!seen.includes(seed)) {
      seen.push(seed);
      try { localStorage.setItem(seedsKey, JSON.stringify(seen.slice(-400))); } catch {}
    }
    return fresh;
  }

  const validAsks = (asks) => Array.isArray(asks) && asks.length <= 2 && asks.every(ask => ask === "take" || Number.isSafeInteger(ask));

  function loadRun() {
    try {
      const current = localStorage.getItem(runKey);
      const migrated = current === null;
      const saved = JSON.parse(current ?? localStorage.getItem(previousRunKey));
      if (typeof saved?.id !== "string" || !saved.id || typeof saved.seed !== "string" ||
          !saved.seed.trim() || saved.seed.length > 64 || !Array.isArray(saved.decisions) ||
          saved.decisions.length > totalCycles * 2) return null;
      const scenario = typeof saved.scenario === "string" ? scenarios.find(item => item.key === saved.scenario) : null;
      if (saved.scenario && !scenario) return null;
      const legacyEstimateThrough = !scenario ? 0 : migrated ? saved.decisions.length : saved.legacyEstimateThrough ?? 0;
      if (!Number.isSafeInteger(legacyEstimateThrough) || legacyEstimateThrough < 0 || legacyEstimateThrough > saved.decisions.length) return null;
      const decisions = replay(saved.seed, saved.decisions, { withReview: false, scenario, legacyEstimateThrough }).decisions;
      // Keep the original independently versioned save if a full replay is impossible.
      if (decisions.length !== saved.decisions.length) return null;
      const completedAt = Number.isSafeInteger(saved.completedAt) && saved.completedAt > 0 ? saved.completedAt : null;
      // A negotiation in progress is kept, so reloading the page cannot undo a refusal.
      const talks = saved.talks?.ticket === decisions.length && validAsks(saved.talks.buy) && validAsks(saved.talks.sell) ? saved.talks : null;
      return { id: saved.id, seed: saved.seed, scenario: scenario?.key || null, ranked: !migrated && saved.ranked === true && !scenario,
        decisions, completedAt, talks, legacyEstimateThrough };
    } catch {
      return null;
    }
  }

  function saveRun() {
    run.talks = { ticket: run.decisions.length, buy: haggles.buy, sell: haggles.sell };
    try { localStorage.setItem(runKey, JSON.stringify(run)); } catch {}
  }

  // --- Head and headline numbers ----------------------------------------------

  function renderHead() {
    const closed = !state.round;
    set("campaign-progress", closed ? totalCycles + " cycles complete" :
      "Cycle " + (state.stage + 1) + " of " + totalCycles + (state.phase === "pm" ? " · afternoon" : ""));
    const history = scenarioOf();
    const kind = element("run-kind");
    kind.textContent = history ? "Historical scenario" : run.ranked ? "Ranked run" : "Practice run";
    kind.dataset.kind = run.ranked ? "ranked" : "practice";
    kind.title = history ? "Real prices, so the outcome is known. Scenarios are practice runs." :
      run.ranked ? "This run counts for the leaderboard." : "This seed has been played or typed in, so the run is not ranked.";
    set("seed-value", history ? history.title + " · " + history.period : "Seed " + run.seed);
    element("seed-value").title = history ? history.title + " · " + history.period : run.seed;
    set("foot-note", history ? "Prices: U.S. Energy Information Administration, daily WTI spot and futures settlements · Bids, clients, storage rates and counterparties are the game’s own · 1 lot = 1,000 bbl" :
      "Simulated terminal and prices · All times Central · 1 lot = 1,000 bbl");
    for (const item of element("timeline").children) {
      const step = Number(item.dataset.step);
      item.classList.toggle("is-current", !closed && step === state.stage);
      item.classList.toggle("is-done", closed || step < state.stage);
      item.setAttribute("aria-label", "Cycle " + (step + 1) + (closed || step < state.stage ? ", complete" : ""));
      if (!closed && step === state.stage) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }

    set("net-label", closed ? "Final P&L" : "Marked P&L");
    amount("net-value", state.net);
    withUnit("crude-value", number(state.barrels), "bbl");
    set("crude-detail", state.barrels ? "Average cost " + quote(state.cargoCost) : "No crude owned");
    set("exposure-value", exposureText(state.netLots));
    set("exposure-detail", futuresSummary(state.futuresBook.map(month => month.position)) + " · limit ±" + netLimitLots + " lots");
    set("tank-value", Math.round(state.occupancy / capacity * 100) + "%");
    set("tank-detail", number(state.occupancy) + " of " + number(capacity) + " bbl in use");
  }

  // --- Terminal ----------------------------------------------------------------

  function renderTerminal() {
    const closed = !state.round;
    const book = state.round?.orderBook;
    set("location-clock", state.market.time + (state.scenario ? "" : " CT"));

    set("inbound-value", closed ? "Run closed" : state.incoming ? number(state.incoming) + " bbl" : "None due");
    set("inbound-note", closed ? "" : state.incoming ? "Wants tank space this cycle" :
      state.scheduled ? number(state.scheduled.barrels) + " bbl booked in for cycle " + state.scheduled.cycle :
      state.phase === "pm" ? "Clients are morning business" : "No client arrival this cycle");
    element("pipe-in").classList.toggle("is-live", !closed && !!state.incoming);

    renderLevels(state.barrels - state.ownedOverflow, state.clientInTank, false);

    if (closed) {
      set("outbound-value", "Book settled");
      set("outbound-note", "All crude sold and futures closed");
    } else {
      set("outbound-value", book.sell.max ? "Local bid " + quote(book.sell.price) : "Nothing to sell");
      set("outbound-note", [
        book.sell.max ? "Takes up to " + number(book.sell.max) + " bbl" : "You own no crude",
        book.ship ? "Gulf Coast " + quote(book.ship.price) + " less " + quote(book.ship.tariff) + " tariff, up to " + number(book.ship.max) + " bbl" : "",
      ].filter(Boolean).join(" · "));
    }
    element("pipe-out").classList.toggle("is-live", !closed && !!book.sell.max);
    renderOverflow(state.ownedOverflow, state.clientOverflow, state.storageBooked, false);
  }

  // The off-site strip, for the book as it stands or as the ticket would leave it.
  function renderOverflow(owned, clients, booked, previewing) {
    const used = owned + clients;
    const short = Math.max(0, used - booked);
    const whose = [owned ? number(owned) + " bbl of yours" : "", clients ? number(clients) + " bbl of clients’" : ""].filter(Boolean).join(" and ");
    element("overflow-fill").style.width = booked ? Math.min(100, used / booked * 100) + "%" : "0%";
    const text = element("overflow-text");
    text.textContent = short ?
      number(short) + " bbl off-site has no booking " + (previewing ? "on this ticket" : "this cycle") + " (" + whose + "). Book space or sell crude." :
      booked ? number(used) + " of " + number(booked) + " bbl of booked space in use" + (previewing ? " after this ticket" : "") + (whose ? " (" + whose + ")" : "") :
      "No space booked";
    text.classList.toggle("is-short", short > 0);
  }

  // The tank drawing. While a ticket is being filled in, it shows the tank as that
  // ticket would leave it, so every change on the ticket is seen at once.
  function renderLevels(ownedInTank, clientInTank, previewing) {
    const used = ownedInTank + clientInTank;
    const percent = Math.round(used / capacity * 100);
    element("tank-owned").style.height = ownedInTank / capacity * 100 + "%";
    element("tank-client").style.height = clientInTank / capacity * 100 + "%";
    set("tank-pct", percent + "%");
    element("tank").setAttribute("aria-label", "Tank A " + (previewing ? "after this ticket" : "now") + ": " + percent + "% full, with " +
      number(ownedInTank) + " barrels of your crude and " + number(clientInTank) + " barrels of client crude.");
    set("key-owned", number(ownedInTank) + " bbl");
    set("key-client", number(clientInTank) + " bbl");
    set("key-free", number(capacity - used) + " bbl");
    const tag = element("tank-tag");
    tag.textContent = previewing ? "After this ticket" : "Now";
    tag.classList.toggle("is-preview", previewing);
  }

  // --- Order ticket ------------------------------------------------------------

  function readOrder() {
    const afternoon = state.phase === "pm";
    const side = form.elements.side.value || "hold";
    const haggleSide = side === "emergency" ? "sell" : side;
    const asks = haggles[haggleSide];
    const order = {
      side,
      barrels: side === "hold" ? 0 : inputs.barrels.valueAsNumber,
      storage: afternoon ? 0 : inputs.storage.valueAsNumber,
      storageCycles: afternoon ? 0 : inputs.storageCycles.valueAsNumber,
      client: state.round.orderBook.client ? form.elements.client.value : "none",
      futuresTrades: futuresInputs.map(input => !input.validity.badInput && input.value === "" ? 0 : input.valueAsNumber),
    };
    if (asks?.length) order.haggle = { side: haggleSide, asks: asks.slice() };
    if (deliveryInputs.enabled.checked && !element("delivery-step").hidden) {
      order.delivery = {
        cycle: Number(deliveryInputs.cycle.value),
        barrels: deliveryInputs.barrels.valueAsNumber,
        route: deliveryInputs.route.value,
        month: Number(deliveryInputs.month.value),
      };
    }
    return order;
  }

  function deliveryDay(cycle) {
    const date = scenarioOf()?.dates[cycle];
    return "Cycle " + cycle + (date ? " · " + shortDate(date) : "");
  }

  function renderDeliveryFields() {
    const options = state.deliveryOptions;
    const upcoming = options?.cycles.length && options.months.length;
    element("delivery-step").hidden = !upcoming;
    deliveryInputs.enabled.checked = false;
    deliveryInputs.cycle.replaceChildren();
    deliveryInputs.month.replaceChildren();
    if (!upcoming) return;
    for (const { cycle } of options.cycles) {
      append(deliveryInputs.cycle, "option", deliveryDay(cycle)).value = String(cycle);
    }
    for (const { month, name, price } of options.months) {
      append(deliveryInputs.month, "option", name + " · " + quote(price)).value = String(month);
    }
    deliveryInputs.barrels.value = String(Math.min(1000, state.availableBarrels || 1000));
    deliveryInputs.route.value = "local";
  }

  function updateDelivery(draft, result) {
    const options = element("delivery-options");
    options.hidden = options.disabled = !draft.delivery;
    if (!draft.delivery) return;

    const { cycle, route, month, barrels } = draft.delivery;
    const quotes = state.deliveryOptions;
    const offer = quotes.cycles.find(day => day.cycle === cycle)?.routes[route];
    const reference = quotes.months.find(quote => quote.month === month);
    const booked = result.delivery;
    const available = result.availableBarrels + (booked?.barrels || 0);
    if (offer) {
      const maximum = Math.min(offer.max, available);
      deliveryInputs.barrels.max = String(maximum);
      set("delivery-available", number(available) + " bbl available on this ticket · " + number(offer.max) + " bbl left on this route for this date");
    } else {
      deliveryInputs.barrels.removeAttribute("max");
      set("delivery-available", "");
    }

    const fixedPrice = booked?.fixedGross ?? (offer && reference ? reference.price + offer.basis : null);
    set("delivery-price", fixedPrice === null ? "–" : quote(fixedPrice) + " / bbl");
    set("delivery-basis", offer && reference ? reference.name + " WTI " + move(offer.basis) + " basis" : "");
    set("delivery-tariff", !offer ? "–" : !offer.tariff ? "None" : quote(offer.tariff) + " / bbl" +
      (booked ? " · " + unsignedMoney(booked.tariffCost) + " total" : ""));
    if (booked) amount("delivery-margin", booked.netVsSpot - result.storageCost);
    else {
      set("delivery-margin", "–");
      element("delivery-margin").classList.remove("positive", "negative");
    }
    const after = element("delivery-after");
    after.hidden = !booked;
    after.textContent = booked ? "After this ticket, " + number(result.reserved) + " bbl reserved and " + number(result.availableBarrels) + " bbl uncommitted." : "";
    set("delivery-storage", result.storageThroughCycle ?
      "This ticket books " + unsignedMoney(result.storageCost) + " of overflow through cycle " + result.storageThroughCycle + "." :
      result.storageRequired ? "This ticket needs " + number(result.storageRequired) + " bbl of overflow." : "No additional overflow booked on this ticket.");

    const issue = element("delivery-error");
    issue.textContent = result.errors.delivery || "";
    issue.hidden = !result.errors.delivery;
    if (!Number.isSafeInteger(barrels) || barrels < 1 || (offer && barrels > Math.min(offer.max, available))) {
      deliveryInputs.barrels.setAttribute("aria-invalid", "true");
    } else {
      deliveryInputs.barrels.removeAttribute("aria-invalid");
    }
  }

  // The talk with the counterparty on a local route: who they are, what has been said, what you can say next.
  function renderHaggle(side) {
    const panel = element("haggle");
    const local = (side === "sell" || side === "buy") && state.round.orderBook[side].max > 0;
    panel.hidden = !local;
    if (!local) return;
    const selling = side === "sell";
    const sign = selling ? 1 : -1;
    const asks = haggles[side];
    const talk = negotiate(state, side, asks);
    set("haggle-name", talk.name + (selling ? " is bidding " : " is offering at ") + quote(talk.firm) + ".");
    set("haggle-line", talk.line);

    const log = element("haggle-log");
    log.replaceChildren();
    const said = (ask) => "You " + (selling ? "asked for " : "offered ") + quote(talk.firm + sign * ask) + ".";
    if (asks.length) {
      const first = negotiate(state, side, asks.slice(0, 1));
      append(log, "li", said(asks[0]) + (first.status === "deal" ? " Done." : " They came back at " + quote(first.counterPrice) + "."));
      if (asks.length === 2) {
        append(log, "li", asks[1] === "take" ? "You took " + quote(first.counterPrice) + "." :
          said(asks[1]) + (talk.status === "deal" ? " Done." : " They walked away."));
      }
    }
    if (talk.status === "deal") append(log, "li", "Agreed at " + quote(talk.price) + ", " + cents(talk.improve) + " better than their opening price.", "is-deal");
    if (talk.status === "walked") append(log, "li", selling && state.round.orderBook.emergency ?
      "The local bid is gone. An emergency sale can clear the storage shortfall." :
      "No local " + (selling ? "sale" : "purchase") + " this session.", "is-walked");
    log.hidden = !log.children.length;

    const open = talk.status === "open" || talk.status === "counter";
    element("haggle-ask").hidden = !open;
    if (!open) return;
    const range = element("haggle-range");
    range.min = String(talk.status === "counter" ? Math.min(talk.maxAsk, talk.counter + 5) : 5);
    range.max = String(talk.maxAsk);
    if (Number(range.value) < Number(range.min)) range.value = range.min;
    range.style.setProperty("--fill", ((Number(range.value) - Number(range.min)) / Math.max(5, talk.maxAsk - Number(range.min)) * 100) + "%");
    set("haggle-label", talk.status === "counter" ? "Or ask once more. A second refusal ends the talk." : selling ? "Ask for more" : "Offer less");
    set("haggle-price", quote(talk.firm + sign * Number(range.value)) + ", " + cents(Number(range.value)) + (selling ? " over their bid" : " under their offer"));
    set("haggle-send", talk.status === "counter" ? "Ask once more" : "Make the offer");
    const take = element("haggle-take");
    take.hidden = talk.status !== "counter";
    if (talk.status === "counter") take.textContent = "Take " + quote(talk.counterPrice);
  }

  function updateTicket() {
    element("hedge-status").hidden = true;
    const draft = readOrder();
    const book = state.round.orderBook;
    const result = preview(state, draft);
    updateDelivery(draft, result);
    const route = book[draft.side];
    const emergency = element("emergency-choice");
    emergency.hidden = !book.emergency || negotiate(state, "sell", haggles.sell).status !== "walked";
    emergency.querySelector("input").disabled = emergency.hidden;
    const agreed = result.haggle?.status === "deal" && result.haggle.side === draft.side;
    const price = result.price ?? route?.price;

    inputs.barrels.disabled = draft.side === "hold";
    inputs.barrels.max = String(result.physicalLimit);
    slider.disabled = draft.side === "hold" || !result.physicalLimit;
    slider.max = String(result.physicalLimit);
    slider.value = String(Number.isFinite(draft.barrels) ? draft.barrels : 0);
    slider.style.setProperty("--fill", (result.physicalLimit ? Math.min(100, (Number(slider.value) / result.physicalLimit) * 100) : 0) + "%");
    element("barrels-max").disabled = draft.side === "hold" || !result.physicalLimit;
    set("order-quote", draft.side === "hold" ? "Keep the crude you have. Choose a route to trade." :
      !result.physicalLimit ? "This route is closed for the session." :
      draft.side === "buy" ? quote(price) + (agreed ? " agreed" : " ask") + " · up to " + number(route.max) + " bbl" :
      draft.side === "sell" ? quote(price) + (agreed ? " agreed" : " bid") + " · up to " + number(result.physicalLimit) + " bbl" :
      draft.side === "emergency" ? quote(price) + " emergency bid · up to " + number(result.physicalLimit) + " bbl" :
      quote(route.price) + " less " + quote(route.tariff) + " tariff is " + quote(route.price - route.tariff) + " net · up to " + number(route.max) + " bbl");
    renderHaggle(draft.side);

    inputs.storage.max = String(book.storage.max);
    inputs.storageCycles.max = String(book.storage.maxCycles);
    set("storage-quote", quote(book.storage.price) + " per bbl per cycle, up to " + number(book.storage.max) + " bbl" +
      (result.storageThroughCycle ? ". Runs through cycle " + result.storageThroughCycle + " for " + unsignedMoney(result.storageCost) + "." :
        result.storageRequired ? ". This ticket needs " + number(result.storageRequired) + " bbl." : ". Not needed on this ticket."));

    futuresInputs.forEach((input, slot) => {
      const before = state.futuresPositions[slot];
      const after = result.futuresPositions[slot];
      const cell = element("futures-after-" + slot);
      cell.textContent = positionText(after);
      cell.classList.toggle("is-changed", after !== before);
      if (Number.isSafeInteger(draft.futuresTrades[slot])) input.removeAttribute("aria-invalid");
      else input.setAttribute("aria-invalid", "true");
    });
    set("hedge-hint", "A negative order sells. " + number(result.futuresGross) + " of " + maxFuturesLots + " open lots after this ticket.");

    for (const [key, input] of Object.entries(inputs)) {
      if (result.errors[key]) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }

    set("order-position", number(result.barrels) + " bbl · Tank A " + number(result.occupancy) + " of " + number(capacity) +
      (result.ownedOverflow ? " · " + number(result.ownedOverflow) + " bbl of yours off-site" : "") +
      (result.clientOverflow ? " · " + number(result.clientOverflow) + " client bbl off-site" : ""));
    const exposure = element("order-exposure");
    exposure.textContent = exposureText(result.netLots) + " · limit ±" + netLimitLots + " lots" +
      (result.netLotsAfterExpiry !== null ? " · " + exposureText(result.netLotsAfterExpiry).toLowerCase() + " once " + state.months[0] + " expires" : "");
    exposure.classList.toggle("negative", !!(result.errors.exposure || result.errors.expiry));
    const marker = element("gauge-marker");
    marker.style.left = Math.max(0, Math.min(100, 50 + result.netLots / (netLimitLots * 2) * 50)) + "%";
    marker.classList.toggle("is-over", !!result.errors.exposure);

    // What the book left by this ticket would make or lose.
    const watch = state.market.watch;
    const scenario = element("order-scenario");
    scenario.replaceChildren();
    if (watch) {
      set("scenario-label", "Event impact");
      append(scenario, "span", "If it happens ");
      append(scenario, "b", roughly(result.ifHit), tone(Math.round(result.ifHit / 1000)));
      append(scenario, "span", " · if not ");
      append(scenario, "b", roughly(result.ifMiss), tone(Math.round(result.ifMiss / 1000)));
    } else {
      set("scenario-label", "If prices move");
      if (!result.perDollar && !result.perSpotDime && !result.futuresGross) append(scenario, "span", "No price exposure");
      else {
        append(scenario, "b", money(result.perDollar), tone(result.perDollar));
        append(scenario, "span", " per $1 up in every price · ");
        append(scenario, "b", money(result.perSpotDime), tone(result.perSpotDime));
        append(scenario, "span", " per 10¢ up in spot alone");
      }
    }

    if (result.futuresGross) {
      const sensitivity = result.futuresPositions
        .map((lots, slot) => lots ? state.months[slot] + " " + money(lots * lot * 10) : null)
        .filter(Boolean);
      append(scenario, "span", " · Per 10¢ rise in one WTI month: " + sensitivity.join(", "));
    }

    const changed = result.barrels !== state.barrels || result.occupancy !== state.occupancy || result.clientInTank !== state.clientInTank;
    renderLevels(result.barrels - result.ownedOverflow, result.clientInTank, changed);
    const newBooking = result.storageThroughCycle ? draft.storage : 0;
    renderOverflow(result.ownedOverflow, result.clientOverflow, result.activeStorage + newBooking, changed || newBooking > 0);

    const cash = result.clientCashflow - result.storageCost - result.transportCost - result.tankLease;
    set("order-fees", [
      result.tankLease ? "Tank lease " + money(-result.tankLease) : "",
      result.clientCashflow ? "client " + money(result.clientCashflow) : "",
      result.storageCost ? "overflow " + money(-result.storageCost) : "",
      result.transportCost ? "tariff " + money(-result.transportCost) : "",
    ].filter(Boolean).join(" · ") || "Nothing to pay this afternoon");
    if (cash !== -result.tankLease) element("order-fees").append(" · net " + money(cash));

    const issue = ["side", "barrels", "haggle", "client", "delivery", "storage", "storageCycles", "futuresTrades", "exposure", "expiry"]
      .map(key => result.errors[key]).find(Boolean);
    const message = element("order-error");
    message.textContent = issue || "";
    message.hidden = !issue;
    message.classList.toggle("is-prompt", !!result.awaitingClient);
    element("confirm-button").disabled = fields.disabled || !result.ok;
    return { draft, result };
  }

  function renderTicket() {
    const round = state.round;
    form.hidden = !round;
    element("debrief").hidden = !!round;
    if (!round) {
      renderDebrief();
      return;
    }
    const book = round.orderBook;
    const client = book.client;
    const afternoon = round.phase === "pm";
    const final = state.stage === totalCycles - 1;
    const prices = state.market.prices;
    set("decision-label", afternoon ? "Afternoon ticket" : "Order ticket");
    set("phase", "Cycle " + (state.stage + 1) + (state.scenario ? " · " + state.market.time : afternoon ? " · afternoon" : " · morning"));
    set("decision-desk", round.desk);
    set("decision-title", round.title);
    set("decision-brief", round.message);
    const note = element("market-note");
    note.hidden = !round.marketNote;
    note.textContent = !round.marketNote ? "" : afternoon ? "Also this morning: " + round.marketNote :
      "Also in the market: " + round.marketNote.replace(/\.$/, "") + ". Check the bid and ask against spot.";

    // A scenario has no odds to quote. It has what was actually known that morning.
    const history = scenarioOf();
    element("briefing").hidden = !history;
    if (history) {
      // The ticket trades at the last close, so this is what was known at that close and no later.
      set("briefing-when", "Known at the close on " + state.market.knownAt);
      set("briefing-text", state.market.briefing);
      const intro = element("briefing-intro");
      intro.hidden = state.stage !== 0;
      intro.textContent = history.intro;
    }

    const watch = state.market.watch;
    element("watch").hidden = !watch;
    if (watch) {
      set("watch-when", watch.due === "midday" ? "Due at midday today" : "On watch tonight");
      set("watch-odds", watch.odds + "% likely");
      element("watch-meter").style.width = watch.odds + "%";
      set("watch-title", watch.title + ".");
      set("watch-detail", watch.detail + " " + watch.lean);
      const revision = state.market.revision;
      element("watch-revised").hidden = !revision;
      if (revision) set("watch-revised", "The odds moved from " + revision.from + "% to " + revision.to + "% at midday, and part of that is already in the price.");
      set("watch-hit", effectText(watch.hit));
      set("watch-miss", effectText(watch.miss));
    }

    set("ticket-bid", quote(book.sell.price));
    set("ticket-ask", quote(book.buy.price));
    set("ticket-spot", quote(prices[0]));
    set("ticket-front-label", state.months[0] + " futures");
    set("ticket-front", quote(prices[1]));

    element("client-step").hidden = !client;
    for (const radio of form.elements.client) {
      radio.checked = false;
      radio.disabled = !client || (radio.value === "defer" && !client.defer);
    }
    if (client) {
      set("client-volume", number(client.barrels) + " bbl");
      set("client-accept-detail", "Earn " + unsignedMoney(client.barrels * client.rate) + " (" + quote(client.rate) + " per bbl). Stays " +
        client.releaseAfter + " cycles, through cycle " + client.throughCycle + ".");
      set("client-defer-detail", client.defer ? "Pay " + unsignedMoney(client.defer.fee) + ". It comes back in cycle " + client.defer.cycle + "." :
        "No later slot is open.");
      set("client-redirect-detail", "Pay " + unsignedMoney(client.redirect.fee) + ". The space stays free.");
    }
    element("storage-step").hidden = afternoon;
    renderDeliveryFields();
    let step = 1;
    for (const marker of form.querySelectorAll(".cd-step:not([hidden]) > legend > .cd-step__n")) marker.textContent = String(step++).padStart(2, "0");

    for (const radio of form.elements.side) {
      radio.disabled = radio.value !== "hold" && !book[radio.value]?.max;
      radio.checked = radio.value === "hold";
    }
    inputs.barrels.value = "0";
    inputs.storage.value = "0";
    inputs.storageCycles.value = "1";
    futuresInputs.forEach((input, slot) => {
      input.value = "0";
      const estimated = slot === 3 && state.market.estimated;
      input.disabled = Boolean(estimated);
      input.parentElement.querySelectorAll("button").forEach(button => { button.disabled = Boolean(estimated); });
      set("futures-name-" + slot, state.months[slot]);
      set("futures-mark-" + slot, quote(prices[slot + 1]) + (estimated ? " est." : ""));
      set("futures-open-" + slot, positionText(state.futuresPositions[slot]));
      input.setAttribute("aria-label", state.months[slot] + " order in lots. Negative sells.");
    });
    set("hedge-flat", state.expiryToday ? "Roll and hedge" : "Hedge to flat");
    set("quote-status", state.market.estimated ? state.months[3] + " WTI is estimated. Orders open at its next settlement." : "");
    element("quote-status").hidden = !state.market.estimated;
    const expiry = element("expiry-note");
    const daysLeft = state.expiryCycle ? state.expiryCycle - (state.stage + 1) : -1;
    expiry.hidden = !(state.months[0] === state.allMonths[0] && daysLeft >= 0 && daysLeft <= 1);
    if (!expiry.hidden) {
      const next = state.months[1];
      expiry.textContent = state.scenario ?
        state.months[0] + " futures expire at the close on " + shortDate(scenarioOf().dates[state.expiryCycle]) + ", at their real final settlement. " +
          (daysLeft ? "The hedge will have to move into " + next + " on that day’s ticket." : "Move the hedge into " + next + " on this ticket: Roll and hedge does it in one step.") :
        state.months[0] + " futures expire at " + (daysLeft ? "tomorrow’s" : "today’s") + " close and settle at spot. " +
          (daysLeft ? "You will have to move the hedge into " + next + " tomorrow." : "Move the hedge into " + next + " now: Roll and hedge does it in one step.");
    }
    set("confirm-button", final && state.market.phase !== "am" ? "Settle the book" : afternoon ? "Commit and close the day" : final ? "Commit final orders" : "Commit orders");
    updateTicket();
  }

  // --- Debrief ------------------------------------------------------------------

  function renderDebrief() {
    const debrief = element("debrief");
    debrief.replaceChildren();
    if (!run.completedAt) {
      run.completedAt = Date.now();
      saveRun();
    }
    const review = state.review;
    const rank = run.ranked ? board.record({
      id: run.id, seed: run.seed, net: state.net, drawdown: state.maxDrawdown, completedAt: run.completedAt,
    }) : null;
    set("decision-label", "Debrief");
    set("phase", "Settled");
    set("decision-desk", !run.ranked ? "Practice run · not ranked" : rank === 1 ? "Ranked run · personal best" :
      rank ? "Ranked run · number " + rank + " on your leaderboard" : "Ranked run");
    set("decision-title", "Book closed.");
    set("decision-brief", "All crude is sold and every futures position is closed. Here is the result, where it came from and how much risk it took.");
    element("market-note").hidden = true;
    element("watch").hidden = true;
    element("briefing").hidden = true;
    const history = scenarioOf();
    if (history) set("decision-desk", "Historical scenario · " + history.period);

    append(debrief, "p", money(state.net), "cd-score numeric " + tone(state.net));

    // The grade: return for the risk taken, and the plain alternative.
    const grade = append(debrief, "div", undefined, "cd-grade");
    const words = append(grade, "div");
    if (review.grade) {
      grade.prepend(append(grade, "p", review.grade, "cd-grade__letter"));
      append(words, "p", "Return on risk", "label");
      const perDollar = Math.abs(review.ratio).toLocaleString("en-US", { style: "currency", currency: "USD" });
      append(words, "p", state.net >= 0 ?
        perDollar + " made for each $1 of your largest fall, which was " + unsignedMoney(state.maxDrawdown) + "." :
        "A loss, after a largest fall of " + unsignedMoney(state.maxDrawdown) + ".", "cd-grade__text");
    } else {
      // No letter in a scenario: one fixed price path decides most of the result.
      grade.classList.add("cd-grade--plain");
      append(words, "p", "Risk taken", "label");
      append(words, "p", "Your largest fall from a peak was " + unsignedMoney(state.maxDrawdown) + ".", "cd-grade__text");
    }
    append(words, "p", "You ran an average net position of " + review.averageExposure.toFixed(1) + " lots against a limit of " + netLimitLots + ".", "cd-grade__text");

    if (review.benchmark !== null) {
      const edge = state.net - review.benchmark;
      const versus = append(debrief, "p", undefined, "cd-versus");
      versus.append("Holding the hedged cargo and never trading would have made ");
      append(versus, "b", money(review.benchmark), tone(review.benchmark));
      versus.append(". You " + (edge >= 0 ? "beat" : "fell short of") + " that by ");
      append(versus, "b", unsignedMoney(edge), tone(edge));
      versus.append(".");
    }

    // Where the result came from, as bars on one scale.
    append(debrief, "p", "Where it came from", "label cd-debrief__head");
    const rows = [...Object.keys(partNames).map(key => [partNames[key], review.parts[key]]), ["Opening value of the cargo over cost", review.opening]];
    const largest = Math.max(1, ...rows.map(row => Math.abs(row[1])));
    const bars = append(debrief, "ul", undefined, "cd-bars");
    for (const [name, value] of rows) {
      const row = append(bars, "li");
      append(row, "span", name, "cd-bars__name");
      append(row, "strong", money(value), "numeric " + tone(value));
      const track = append(row, "span", undefined, "cd-bars__track");
      const bar = append(track, "i", undefined, tone(value));
      bar.style.width = Math.abs(value) / largest * 50 + "%";
      bar.style[value < 0 ? "right" : "left"] = "50%";
    }

    const detail = append(debrief, "details", undefined, "cd-details cd-details--inset");
    append(detail, "summary", "Every ticket");
    const table = append(detail, "table", undefined, "cd-table");
    append(table, "caption", "Orders and profit and loss change on each ticket", "visually-hidden");
    const heading = table.createTHead().insertRow();
    ["Cycle", "Orders", "P&L change"].forEach((label, index) => {
      append(heading, "th", label, index === 2 ? "num" : "").scope = "col";
    });
    const body = table.createTBody();
    for (const step of state.history) {
      const row = body.insertRow();
      append(row, "td", step.cycle + (step.phase === "pm" ? " pm" : ""));
      append(row, "td", step.label);
      append(row, "td", money(step.delta), tone(step.delta));
    }

    if (history) {
      if (history.note) {
        append(debrief, "p", "About this result", "label cd-debrief__head");
        append(debrief, "p", history.note, "cd-versus");
      }
      append(debrief, "p", "What happened next", "label cd-debrief__head");
      append(debrief, "p", history.aftermath, "cd-versus");
      append(debrief, "p", "Trading marks use the U.S. Energy Information Administration’s daily prices. Bids, clients and storage rates are simulated.", "cd-debrief__meta");
    }

    const actions = append(debrief, "div", undefined, "cd-debrief__actions");
    const next = append(actions, "button", "Play a new ranked market", "btn");
    next.type = "button";
    next.addEventListener("click", () => { if (!fields.disabled) begin(randomSeed(), true); });
    const again = append(actions, "button", history ? "Play this scenario again" : "Practise this market again", "btn btn--secondary");
    again.type = "button";
    again.addEventListener("click", () => { if (!fields.disabled) begin(run.seed, false, true, run.scenario); });
  }

  // --- Ledger ------------------------------------------------------------------

  function renderDeliveryCalendar() {
    const active = state.deliveryContracts || [];
    const delivered = state.deliveryHistory || [];
    const current = state.round ? state.stage + 1 : null;
    set("delivery-position", current ? number(state.reserved || 0) + " bbl reserved · " + number(state.availableBarrels ?? state.barrels) + " bbl free to sell" :
      delivered.length ? "All forward deliveries settled." : "No forward deliveries were booked.");

    const days = element("delivery-days");
    days.replaceChildren();
    for (let cycle = 1; cycle <= totalCycles; cycle++) {
      const toDeliver = active.some(contract => contract.cycle === cycle);
      const settled = delivered.some(contract => contract.cycle === cycle);
      const label = deliveryDay(cycle) + (toDeliver ? ", scheduled delivery" : settled ? ", delivered" : "");
      const cell = append(days, "li", undefined, "cd-delivery-day");
      cell.title = label;
      if (cycle === current) cell.setAttribute("aria-current", "step");
      cell.classList.toggle("is-booked", toDeliver);
      cell.classList.toggle("is-delivered", settled);
      append(cell, "span", String(cycle)).setAttribute("aria-hidden", "true");
      append(cell, "span", label, "visually-hidden");
    }

    const list = element("delivery-list");
    list.replaceChildren();
    list.hidden = !active.length;
    const history = element("delivery-history");
    const historyList = element("delivery-history-list");
    history.hidden = !delivered.length;
    if (history.hidden) history.open = false;
    historyList.replaceChildren();
    set("delivery-history-count", "Completed deliveries (" + delivered.length + ")");
    const contractLine = (parent, { cycle, barrels, route, monthName, fixedGross, tariff }) => {
      const row = append(parent, "li");
      append(row, "b", deliveryDay(cycle) + " · " + number(barrels) + " bbl · " + (route === "gulf" ? "Gulf" : "Local"));
      append(row, "small", quote(fixedGross - tariff) + " net/bbl · " + monthName + " WTI");
    };
    [...active].sort((first, second) => first.cycle - second.cycle).forEach(contract => contractLine(list, contract));
    [...delivered].reverse().forEach(contract => contractLine(historyList, contract));
  }

  function renderLedger() {
    const settled = !state.round;
    set("ledger-status", settled ? "Settled" : "Open book");
    const rows = [
      ["Physical crude", state.barrels ? number(state.barrels) + " bbl at " + quote(state.cargoCost) : "Flat", state.components.physical],
      ["WTI futures", futuresSummary(state.futuresBook.map(month => month.position)), state.components.hedge],
      ["Logistics", "Lease, storage, tariffs, clients", state.components.logistics],
      ["Net P&L", settled ? "Final" : "Marked to market", state.net],
    ];
    const body = element("ledger-rows");
    body.replaceChildren();
    rows.forEach(([name, position, value], index) => {
      const row = body.insertRow();
      if (index === rows.length - 1) row.className = "is-total";
      append(row, "td", name);
      append(row, "td", position);
      append(row, "td", money(value), tone(value));
    });

    const months = element("futures-ledger-rows");
    months.replaceChildren();
    for (const month of state.futuresBook) {
      if (!month.listed && !month.pnl) continue;
      const row = months.insertRow();
      append(row, "td", month.name + " WTI");
      append(row, "td", month.expired ? "Expired" :
        month.position ? positionText(month.position) + " at " + quote(month.averageEntry) + ", now " + quote(month.mark) : "Flat");
      append(row, "td", money(month.pnl), tone(month.pnl));
    }

    const storage = element("storage-list");
    storage.replaceChildren();
    for (const load of state.clientLoads) {
      append(storage, "li", "Client cargo, " + number(load.barrels) + " bbl, leaves after cycle " + load.throughCycle);
    }
    for (const lease of state.activeLeases) {
      append(storage, "li", "Overflow booking, " + number(lease.barrels) + " bbl, cycles " + lease.fromCycle + " to " + lease.throughCycle +
        " at " + quote(lease.price) + " per bbl per cycle");
    }
    if (state.scheduled) append(storage, "li", "Client delivery of " + number(state.scheduled.barrels) + " bbl rescheduled to cycle " + state.scheduled.cycle);
    if (!storage.children.length) append(storage, "li", "No client cargo or overflow bookings", "is-empty");

    element("activity").hidden = state.entries.length === 0;
    const list = element("activity-list");
    list.replaceChildren();
    state.entries.slice().reverse().forEach(entry => {
      const row = append(list, "li");
      const label = append(row, "span", entry.label);
      append(label, "small", "Cycle " + entry.cycle + " · " + entry.detail);
      append(row, "strong", money(entry.cents), tone(entry.cents));
    });
  }

  // --- Forward curve and the wire ------------------------------------------------

  // The news in one market move, most important first.
  function newsOf(market) {
    return [
      market.shock ? { text: market.shock.headline + ".", shock: true } : null,
      market.resolved || market.revision ? { text: market.headline + "." } : null,
      // In a scenario the headline is what really happened that day.
      market.history && market.headline ? { text: market.headline } : null,
      market.expired && !market.history ? { text: market.expired.name + " futures expired at " + quote(market.expired.price) + "." } : null,
    ].filter(Boolean);
  }

  function renderQuotes() {
    const prices = state.market.prices;
    const last = state.history.at(-1);
    // Yesterday's curve is only comparable when the same months are listed.
    const previous = last && last.marketBefore.firstMonth === state.market.firstMonth ? last.marketBefore.prices : null;
    const labels = ["Spot", ...state.months];
    const spread = prices[1] - prices[0];
    set("curve-shape", spread > 0 ? "Contango · " + state.months[0] + " " + quote(spread) + " over spot" :
      spread < 0 ? "Backwardation · " + state.months[0] + " " + quote(-spread) + " under spot" : "Flat · " + state.months[0] + " at spot");
    element("price-chart").setAttribute("aria-label", "WTI forward curve. " +
      labels.map((label, index) => label + " " + quote(prices[index])).join(", ") + ".");
    const quotes = element("quotes");
    quotes.replaceChildren();
    labels.forEach((label, index) => {
      const button = append(quotes, "button", undefined, "cd-quote");
      button.type = "button";
      button.dataset.quote = index;
      button.setAttribute("aria-pressed", "false");
      if (index && state.round) {
        button.setAttribute("aria-label", label + " WTI at " + quote(prices[index]) +
          (index === 4 && state.market.estimated ? ". Estimated, view only." : ". Enter an order."));
      }
      append(button, "span", label, "label");
      append(button, "strong", quote(prices[index]));
      const change = previous ? prices[index] - previous[index] : 0;
      append(button, "small", index === 4 && state.market.estimated ? "Estimate" :
        previous ? (change > 0 ? "+" : change < 0 ? "−" : "") + (Math.abs(change) / 100).toFixed(2) : last ? "New front" : "Opening", tone(change));
    });
    element("curve-hint").hidden = !state.round;

    // The wire: every piece of news so far, newest first.
    const wire = element("wire-list");
    wire.replaceChildren();
    state.history.slice().reverse().forEach(step => {
      for (let index = step.path.length - 1; index >= 1; index--) {
        const market = step.path[index];
        const items = newsOf(market);
        // A quiet midday on the way to the close is not news.
        if (!items.length && market.phase === "pm") continue;
        const change = market.prices[0] - step.path[index - 1].prices[0];
        const row = append(wire, "li");
        const text = append(row, "span", market.history ? market.headline :
          items.length ? items.map(item => item.text.replace(/\.$/, "")).join(". ") : market.headline);
        const history = scenarioOf();
        append(text, "small", "Cycle " + step.cycle + (history ? ", " + shortDate(history.dates[market.day]) : market.phase === "pm" ? ", midday" : ", overnight"));
        append(row, "strong", "Spot " + move(change), tone(change));
      }
    });
    element("wire").hidden = wire.children.length === 0;
    drawCurve();
  }

  function drawCurve() {
    if (!state) return;
    const canvas = element("price-chart");
    const { width, height } = canvas.getBoundingClientRect();
    if (!width || !height) return;
    const scale = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * scale)) canvas.width = Math.round(width * scale);
    if (canvas.height !== Math.round(height * scale)) canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Colours come from the site's tokens, so the chart follows the theme.
    const styles = getComputedStyle(root);
    const token = (name) => styles.getPropertyValue(name).trim();
    const prices = state.market.prices;
    const last = state.history.at(-1);
    const previous = last && last.marketBefore.firstMonth === state.market.firstMonth ? last.marketBefore.prices : null;
    const series = [...prices, ...(previous || [])];
    // Grid lines at a round interval that gives about five of them, whatever the range.
    const range = Math.max(...series) - Math.min(...series) + 50;
    const interval = [100, 200, 300, 500, 1000, 2000, 2500, 5000].find(step => range / step <= 6) || 10000;
    const low = Math.floor((Math.min(...series) - 25) / interval) * interval;
    const high = Math.ceil((Math.max(...series) + 25) / interval) * interval;
    const left = curveMargins.left, right = width - curveMargins.right, top = curveMargins.top, bottom = height - curveMargins.bottom;
    const x = (index) => left + (right - left) * index / (prices.length - 1);
    const y = (value) => bottom - (value - low) / (high - low) * (bottom - top);

    ctx.font = "500 11px " + getComputedStyle(element("location-clock")).fontFamily;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let value = low; value <= high; value += interval) {
      const lineY = Math.round(y(value)) + .5;
      ctx.fillStyle = token("--muted");
      ctx.fillText((value < 0 ? "−$" : "$") + Math.abs(value) / 100, 0, lineY);
      ctx.strokeStyle = token("--line");
      ctx.beginPath();
      ctx.moveTo(left, lineY);
      ctx.lineTo(right, lineY);
      ctx.stroke();
    }

    const trace = (values) => {
      ctx.beginPath();
      values.forEach((price, index) => index ? ctx.lineTo(x(index), y(price)) : ctx.moveTo(x(index), y(price)));
    };
    if (previous) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = token("--muted");
      trace(previous);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    trace(prices);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.strokeStyle = token("--accent");
    ctx.stroke();
    // Square markers, as on the site's curve charts.
    prices.forEach((price, index) => {
      const size = index === quoteIndex ? 12 : 9;
      ctx.fillStyle = index === quoteIndex ? token("--accent") : token("--surface");
      ctx.strokeStyle = token("--accent");
      ctx.lineWidth = 2;
      ctx.fillRect(x(index) - size / 2, y(price) - size / 2, size, size);
      ctx.strokeRect(x(index) - size / 2, y(price) - size / 2, size, size);
    });
  }

  // --- Whole-page render ---------------------------------------------------------

  function renderGame(next) {
    state = next;
    window.CargoTutorialUI?.offer(state.history.length === 0);
    quoteIndex = -1;
    renderHead();
    renderTerminal();
    renderDeliveryCalendar();
    renderTicket();
    renderLedger();
    renderQuotes();
    const last = state.history.at(-1);
    element("cycle-note").hidden = !last;
    if (last) {
      const news = newsOf(state.market);
      const history = scenarioOf();
      // A scenario's news is a full sentence, so it gets its own line under the date.
      set("cycle-headline", history ? "Cycle " + last.cycle + " · " + shortDate(history.dates[last.cycle]) :
        "Cycle " + last.cycle + (last.phase === "pm" || state.phase !== "pm" ? "" : " morning") + " · " +
        (news.length ? news[0].text.replace(/\.$/, "") : state.market.headline));
      element("cycle-news").hidden = !history;
      if (history) set("cycle-news", state.market.headline);
      set("cycle-outcome", last.outcome);
      amount("cycle-delta", last.delta);
      // The explanation: the three largest parts of the change, biggest first.
      const why = element("cycle-why");
      why.replaceChildren();
      Object.entries(last.parts).filter(([, value]) => value).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).forEach(([key, value], index) => {
        if (index) why.append(" · ");
        why.append(partNames[key] + " ");
        append(why, "b", money(value), tone(value));
      });
      why.hidden = !why.childNodes.length;
    }
  }

  function begin(seed, generated, show = true, scenario = null) {
    haggles = { buy: [], sell: [] };
    // A scenario is always a practice run: its prices are a matter of record.
    run = { id: window.CargoLeaderboard.newRunId(), seed, scenario, ranked: scenario ? false : claimSeed(seed, generated), decisions: [], completedAt: null };
    saveRun();
    renderGame(play(run.decisions));
    // A run the player starts brings the top of the game back into view.
    if (show) element("cargo-desk").scrollIntoView({ block: "start", behavior: still() ? "instant" : "smooth" });
  }

  function openNewRun(seed = "") {
    if (fields.disabled) return;
    const midRun = state.history.length > 0 && !!state.round;
    set("restart-message", (midRun ? "Starting a new run abandons this one" + (run.ranked ? ", and it cannot be ranked later. " : ". ") : "") +
      "A new random market is ranked. A seed you type in is a practice run.");
    element("seed-input").value = seed;
    element("seed-input").setCustomValidity("");
    element("restart-dialog").showModal();
  }

  const board = window.CargoLeaderboard.create({
    container: element("leaderboard-content"),
    onReplay(seed) {
      if (fields.disabled) return;
      element("leaderboard-dialog").close();
      if (state.history.length > 0 && state.round) openNewRun(seed);
      else begin(seed, false);
    },
  });

  // --- Events ------------------------------------------------------------------

  form.addEventListener("input", event => {
    if (fields.disabled || !state.round) return;
    if (event.target.name === "side") {
      const route = state.round.orderBook[event.target.value];
      const walked = haggles[event.target.value]?.length === 2 && negotiate(state, event.target.value, haggles[event.target.value]).status === "walked";
      inputs.barrels.value = route && !walked ? String(route.max) : "0";
    }
    updateTicket();
  });

  // The slider and the number box are two handles on the same volume.
  slider.addEventListener("input", event => {
    event.stopPropagation();
    if (fields.disabled || !state.round) return;
    inputs.barrels.value = slider.value;
    updateTicket();
  });

  element("barrels-max").addEventListener("click", () => {
    const route = state.round?.orderBook[form.elements.side.value];
    if (!route) return;
    inputs.barrels.value = String(route.max);
    updateTicket();
  });

  // Negotiation. Each thing said is saved at once, so it cannot be taken back.
  function say(ask) {
    const side = form.elements.side.value;
    if (fields.disabled || !state.round || !haggles[side] || haggles[side].length >= 2) return;
    haggles[side].push(ask);
    saveRun();
    if (negotiate(state, side, haggles[side]).status === "walked") inputs.barrels.value = "0";
    updateTicket();
  }
  element("haggle-range").addEventListener("input", event => {
    event.stopPropagation();
    if (state.round) renderHaggle(form.elements.side.value);
  });
  element("haggle-send").addEventListener("click", () => say(Number(element("haggle-range").value)));
  element("haggle-take").addEventListener("click", () => say("take"));

  // Sets the hedge so that crude plus futures is as close to flat as whole lots allow.
  // On expiry day it also closes the expiring month and puts the hedge in the next one.
  element("hedge-flat").addEventListener("click", () => {
    if (fields.disabled || !state.round) return;
    const result = hedgeOrder(state, readOrder());
    if (result.trades) {
      result.trades.forEach((trade, slot) => { futuresInputs[slot].value = String(trade); });
      updateTicket();
    }
    const status = element("hedge-status");
    status.textContent = result.message || (result.limited ?
      "The gross limit leaves the book " + exposureText(result.netLots).toLowerCase() + "." : "");
    status.hidden = !status.textContent;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (fields.disabled || !state.round) return;
    const { draft, result } = updateTicket();
    if (!result.ok) return;

    const previous = state;
    const next = play([...run.decisions, draft]);
    if (next.history.length !== previous.history.length + 1) return;
    const step = next.history.at(-1);
    run.decisions = next.decisions;
    haggles = { buy: [], sell: [] };
    if (!next.round) run.completedAt = Date.now();
    saveRun();
    fields.disabled = true;
    element("confirm-button").disabled = true;
    const controls = ["restart-button", "leaderboard-button", "help-button", "tutorial-button", "tutorial-start", "tutorial-dismiss"]
      .map(element).filter(Boolean);
    controls.forEach(control => { control.disabled = true; });
    form.setAttribute("aria-busy", "true");

    // One stretch of tape for each market move since the ticket: morning, then afternoon and overnight.
    const front = previous.market.firstMonth;
    const segments = step.path.slice(1).map((to, index) => {
      const from = step.path[index];
      return {
        label: previous.scenario ? shortDate(scenarioOf().dates[to.day]) : to.phase === "pm" ? "Morning" : to.phase === "close" ? "Afternoon to the close" : "Afternoon and overnight",
        from: { spot: from.prices[0], front: monthPrice(from, front) },
        to: { spot: to.prices[0], front: monthPrice(to, front) },
        news: previous.scenario ? [{ text: to.headline.split(/(?<=\.)\s+(?=[A-Z])/)[0] }] : newsOf(to),
      };
    });
    try {
      await transition({
        title: "Cycle " + step.cycle + (previous.phase === "pm" ? " · afternoon" : next.phase === "pm" ? " · morning" : ""),
        time: previous.scenario ? "Real prices" : next.market.time + " CT",
        label: step.label,
        frontName: previous.allMonths[front],
        segments,
        delta: step.delta,
      });
    } finally {
      fields.disabled = false;
      renderGame(next);
      controls.forEach(control => { control.disabled = false; });
      form.removeAttribute("aria-busy");
      const ticket = element("ticket");
      element("decision-title").focus({ preventScroll: true });
      const box = ticket.getBoundingClientRect();
      if (box.top < 0 || box.top > window.innerHeight * .6) {
        ticket.scrollIntoView({ block: "start", behavior: still() ? "instant" : "smooth" });
      }
      reveal();
    }
  });

  function selectQuote(next) {
    quoteIndex = quoteIndex === next ? -1 : next;
    for (const button of element("quotes").children) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.quote) === quoteIndex));
    }
    drawCurve();
    if (next > 0 && quoteIndex === next && state.round && !fields.disabled && !futuresInputs[next - 1].disabled) {
      futuresInputs[next - 1].focus();
      futuresInputs[next - 1].select();
    }
  }

  element("quotes").addEventListener("click", event => {
    const button = event.target.closest("[data-quote]");
    if (button) selectQuote(Number(button.dataset.quote));
  });
  element("price-chart").addEventListener("click", event => {
    if (!state.round || fields.disabled) return;
    const plot = event.currentTarget.getBoundingClientRect();
    const cursor = event.clientX - plot.left;
    const right = plot.width - curveMargins.right;
    if (cursor < curveMargins.left - 12 || cursor > right + 12) return;
    selectQuote(Math.max(0, Math.min(4, Math.round((cursor - curveMargins.left) * 4 / (right - curveMargins.left)))));
  });

  element("help-button").addEventListener("click", () => { if (!fields.disabled) element("help-dialog").showModal(); });
  element("leaderboard-button").addEventListener("click", () => {
    if (fields.disabled) return;
    board.render();
    element("leaderboard-dialog").showModal();
  });
  element("restart-button").addEventListener("click", () => openNewRun());
  element("seed-input").addEventListener("input", event => event.target.setCustomValidity(""));
  element("seed-form").addEventListener("submit", event => {
    event.preventDefault();
    if (fields.disabled) return;
    const input = element("seed-input");
    const seed = input.value.trim();
    if (!seed) {
      input.setCustomValidity("Enter a seed to practise on.");
      input.reportValidity();
      return;
    }
    element("restart-dialog").close();
    begin(seed, false);
  });
  element("random-run").addEventListener("click", () => {
    if (fields.disabled) return;
    element("restart-dialog").close();
    begin(randomSeed(), true);
  });

  // The historical scenarios, listed in the New run dialog.
  for (const scenario of scenarios) {
    const item = append(element("scenario-list"), "li");
    const button = append(item, "button", undefined, "cd-scenario");
    button.type = "button";
    append(button, "span", scenario.period, "label");
    append(button, "b", scenario.title);
    append(button, "span", scenario.summary, "cd-scenario__text");
    button.addEventListener("click", () => {
      if (fields.disabled) return;
      element("restart-dialog").close();
      begin("scenario-" + scenario.key, false, true, scenario.key);
    });
  }
  element("scenario-list").closest(".cd-scenarios").hidden = scenarios.length === 0;

  // Light and dark. Standalone, the game has its own switch, saved under the same
  // key as the main site. On the site, the site's header switch does the work.
  const themeToggle = document.querySelector("[data-cd-theme-toggle]");
  function syncTheme() {
    const dark = root.dataset.theme === "dark";
    themeToggle?.setAttribute("aria-pressed", String(dark));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#101214" : "#efeee8");
  }
  themeToggle?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
    syncTheme();
  });
  // The chart is drawn in the theme's colours, so redraw whenever the theme changes.
  new MutationObserver(drawCurve).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  if (themeToggle) syncTheme();

  // --- Build the fixed parts and start -------------------------------------------

  for (let step = 0; step < totalCycles; step++) {
    const item = append(element("timeline"), "li", String(step + 1));
    item.dataset.step = step;
  }

  futuresInputs = [0, 1, 2, 3].map(slot => {
    const row = element("futures-rows").insertRow();
    const head = append(row, "th");
    head.scope = "row";
    append(head, "span").id = "futures-name-" + slot;
    append(head, "small").id = "futures-mark-" + slot;
    append(row, "td").id = "futures-open-" + slot;
    const stepper = append(append(row, "td"), "div", undefined, "cd-stepper");
    const input = document.createElement("input");
    const nudge = (label, text, by) => {
      const button = append(stepper, "button", text);
      button.type = "button";
      button.setAttribute("aria-label", label + " one lot");
      button.addEventListener("click", () => {
        if (fields.disabled || !state.round) return;
        input.value = String((Number.isSafeInteger(input.valueAsNumber) ? input.valueAsNumber : 0) + by);
        updateTicket();
      });
    };
    nudge("Sell", "−", -1);
    input.type = "number";
    input.step = "1";
    input.value = "0";
    input.inputMode = "numeric";
    input.name = "futures" + slot;
    input.id = "futures-lots-" + slot;
    stepper.append(input);
    nudge("Buy", "+", 1);
    append(row, "td").id = "futures-after-" + slot;
    return input;
  });

  run = loadRun();
  if (run) {
    if (run.talks) haggles = { buy: run.talks.buy.slice(), sell: run.talks.sell.slice() };
    saveRun();
    renderGame(play(run.decisions));
  } else {
    begin(randomSeed(), true, false);
  }
  new ResizeObserver(drawCurve).observe(element("chart-wrap"));
  document.fonts?.ready.then(drawCurve);
})();
