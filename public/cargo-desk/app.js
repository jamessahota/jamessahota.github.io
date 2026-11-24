(function () {
  "use strict";

  const { replay, preview, totalCycles, capacity, lot, futuresMonths, maxFuturesLots, netLimitLots } = window.CargoDesk;
  const { transition, reveal } = window.CargoMotion;
  const root = document.documentElement;
  const element = (id) => document.getElementById(id);
  const set = (id, value) => { element(id).textContent = value; };
  const number = (value) => value.toLocaleString("en-US");
  const quote = (cents) => "$" + (cents / 100).toFixed(2);
  const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const exactDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const unsignedMoney = (cents) => (cents % 100 ? exactDollars : wholeDollars).format(Math.abs(cents) / 100);
  const money = (cents) => (cents < 0 ? "−" : cents > 0 ? "+" : "") + unsignedMoney(cents);
  const tone = (cents) => cents < 0 ? "negative" : cents > 0 ? "positive" : "";
  const curveLabels = ["Spot", ...futuresMonths];
  const curveMargins = { left: 40, right: 10, top: 14, bottom: 12 };
  const runKey = "cargo-desk-run-v4";
  const seedsKey = "cargo-desk-seeds-v4";
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
  let futuresInputs = [];
  let run;
  let state;
  let quoteIndex = -1;
  let movingPrices = null;
  let frameRequest;
  let busy = false;

  // --- Formatting ------------------------------------------------------------

  function lotsText(lots) {
    const size = Math.abs(lots);
    return number(size) + (size === 1 ? " lot" : " lots");
  }

  function exposureText(lots) {
    return lots ? lotsText(lots) + (lots > 0 ? " long" : " short") : "Flat";
  }

  function positionText(lots) {
    return lots ? (lots > 0 ? "Long " : "Short ") + number(Math.abs(lots)) : "Flat";
  }

  function futuresSummary(positions) {
    const long = positions.reduce((total, lots) => total + Math.max(0, lots), 0);
    const short = positions.reduce((total, lots) => total + Math.max(0, -lots), 0);
    return [long ? number(long) + " long" : "", short ? number(short) + " short" : ""].filter(Boolean).join(", ") || "No futures";
  }

  // A price change in dollars with its sign, for example +$1.20.
  const move = (cents) => (cents < 0 ? "−" : "+") + "$" + (Math.abs(cents) / 100).toFixed(2);
  // Estimates are shown to the nearest ten dollars, so they do not read as exact.
  const roughly = (cents) => money(Math.round(cents / 1000) * 1000);
  const effectText = (effect) => "Futures about " + move(effect.flat) + ", spot about " + move(effect.flat + effect.premium);

  function amount(id, cents) {
    const node = element(id);
    node.textContent = money(cents);
    node.classList.toggle("positive", cents > 0);
    node.classList.toggle("negative", cents < 0);
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

  // --- Saved run and the ranked/practice rule ---------------------------------

  function randomSeed() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function startedSeeds() {
    try {
      const saved = JSON.parse(localStorage.getItem(seedsKey));
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

  function loadRun() {
    try {
      const saved = JSON.parse(localStorage.getItem(runKey));
      if (typeof saved?.id !== "string" || !saved.id || typeof saved.seed !== "string" ||
          !saved.seed.trim() || saved.seed.length > 64 || !Array.isArray(saved.decisions)) return null;
      const decisions = replay(saved.seed, saved.decisions.slice(0, totalCycles)).decisions;
      const completedAt = Number.isSafeInteger(saved.completedAt) && saved.completedAt > 0 ? saved.completedAt : null;
      return { id: saved.id, seed: saved.seed, ranked: saved.ranked === true, decisions, completedAt };
    } catch {
      return null;
    }
  }

  function saveRun() {
    try { localStorage.setItem(runKey, JSON.stringify(run)); } catch {}
  }

  // --- Head and headline numbers ----------------------------------------------

  function renderHead() {
    const closed = state.stage === totalCycles;
    set("campaign-progress", closed ? totalCycles + " cycles complete" : "Cycle " + (state.stage + 1) + " of " + totalCycles);
    const kind = element("run-kind");
    kind.textContent = run.ranked ? "Ranked run" : "Practice run";
    kind.dataset.kind = run.ranked ? "ranked" : "practice";
    kind.title = run.ranked ? "This run counts for the leaderboard." : "This seed has been played or typed in, so the run is not ranked.";
    set("seed-value", "Seed " + run.seed);
    element("seed-value").title = run.seed;
    for (const item of element("timeline").children) {
      const step = Number(item.dataset.step);
      item.classList.toggle("is-current", step === state.stage);
      item.classList.toggle("is-done", step < state.stage);
      item.setAttribute("aria-label", "Cycle " + (step + 1) + (step < state.stage ? ", complete" : ""));
      if (step === state.stage) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    }

    set("net-label", closed ? "Final P&L" : "Marked P&L");
    amount("net-value", state.net);
    withUnit("crude-value", number(state.barrels), "bbl");
    set("crude-detail", state.barrels ? "Average cost " + quote(state.cargoCost) : "No crude owned");
    const exposure = element("exposure-value");
    exposure.textContent = exposureText(state.netLots);
    set("exposure-detail", futuresSummary(state.futuresPositions) + " · limit ±" + netLimitLots + " lots");
    set("tank-value", Math.round(state.occupancy / capacity * 100) + "%");
    set("tank-detail", number(state.occupancy) + " of " + number(capacity) + " bbl in use");
  }

  // --- Terminal ----------------------------------------------------------------

  function renderTerminal() {
    const closed = state.stage === totalCycles;
    const book = state.round?.orderBook;
    const ownedInTank = state.barrels - state.ownedOverflow;
    set("location-clock", state.market.time + " CT");

    set("inbound-value", closed ? "Run closed" : state.incoming ? number(state.incoming) + " bbl" : "None due");
    set("inbound-note", closed ? "" : state.incoming ? "Wants tank space this cycle" :
      state.scheduled ? number(state.scheduled.barrels) + " bbl booked in for cycle " + state.scheduled.cycle : "No client arrival this cycle");
    element("pipe-in").classList.toggle("is-live", !closed && !!state.incoming);

    renderLevels(ownedInTank, state.clientInTank, false);

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
  function renderOverflow(owned, clients, booked, preview) {
    const used = owned + clients;
    const short = Math.max(0, used - booked);
    const whose = [owned ? number(owned) + " bbl of yours" : "", clients ? number(clients) + " bbl of clients’" : ""].filter(Boolean).join(" and ");
    element("overflow-fill").style.width = booked ? Math.min(100, used / booked * 100) + "%" : "0%";
    const text = element("overflow-text");
    text.textContent = short ?
      number(short) + " bbl off-site has no booking " + (preview ? "on this ticket" : "this cycle") + " (" + whose + "). Book space or sell crude." :
      booked ? number(used) + " of " + number(booked) + " bbl of booked space in use" + (preview ? " after this ticket" : "") + (whose ? " (" + whose + ")" : "") :
      "No space booked";
    text.classList.toggle("is-short", short > 0);
  }

  // The tank drawing. While a ticket is being filled in, it shows the tank as that
  // ticket would leave it, so every change on the ticket is seen at once.
  function renderLevels(ownedInTank, clientInTank, preview) {
    const used = ownedInTank + clientInTank;
    const percent = Math.round(used / capacity * 100);
    element("tank-owned").style.height = ownedInTank / capacity * 100 + "%";
    element("tank-client").style.height = clientInTank / capacity * 100 + "%";
    set("tank-pct", percent + "%");
    element("tank").setAttribute("aria-label", "Tank A " + (preview ? "after this ticket" : "now") + ": " + percent + "% full, with " +
      number(ownedInTank) + " barrels of your crude and " + number(clientInTank) + " barrels of client crude.");
    set("key-owned", number(ownedInTank) + " bbl");
    set("key-client", number(clientInTank) + " bbl");
    set("key-free", number(capacity - used) + " bbl");
    const tag = element("tank-tag");
    tag.textContent = preview ? "After this ticket" : "Now";
    tag.classList.toggle("is-preview", preview);
  }

  // --- Order ticket ------------------------------------------------------------

  function readOrder() {
    const side = form.elements.side.value || "hold";
    return {
      side,
      barrels: side === "hold" ? 0 : inputs.barrels.valueAsNumber,
      storage: inputs.storage.valueAsNumber,
      storageCycles: inputs.storageCycles.valueAsNumber,
      client: state.round.orderBook.client ? form.elements.client.value : "none",
      futuresTrades: futuresInputs.map(input => !input.validity.badInput && input.value === "" ? 0 : input.valueAsNumber),
    };
  }

  function showHedgeStatus(text = "") {
    const status = element("hedge-shortcut-status");
    status.hidden = !text;
    status.textContent = text;
  }

  function updateTicket() {
    showHedgeStatus();
    const draft = readOrder();
    const book = state.round.orderBook;
    const result = preview(state, draft);
    const route = book[draft.side];

    inputs.barrels.disabled = draft.side === "hold";
    inputs.barrels.max = String(result.physicalLimit);
    slider.disabled = draft.side === "hold";
    slider.max = String(result.physicalLimit);
    slider.value = String(Number.isFinite(draft.barrels) ? draft.barrels : 0);
    slider.style.setProperty("--fill", (result.physicalLimit ? Math.min(100, (Number(slider.value) / result.physicalLimit) * 100) : 0) + "%");
    element("barrels-max").disabled = draft.side === "hold";
    set("order-quote", draft.side === "hold" ? "Keep the crude you have. Choose a route to trade." :
      draft.side === "buy" ? quote(route.price) + " ask · up to " + number(route.max) + " bbl" :
      draft.side === "sell" ? quote(route.price) + " bid · up to " + number(route.max) + " bbl" :
      quote(route.price) + " less " + quote(route.tariff) + " tariff is " + quote(route.price - route.tariff) + " net · up to " + number(route.max) + " bbl");

    inputs.storage.max = String(book.storage.max);
    inputs.storageCycles.max = String(book.storage.maxCycles);
    set("storage-quote", quote(book.storage.price) + " per bbl per cycle, up to " + number(book.storage.max) + " bbl" +
      (result.storageThroughCycle ? ". Runs through cycle " + result.storageThroughCycle + " for " + unsignedMoney(result.storageCost) + "." :
        result.storageRequired ? ". This ticket needs " + number(result.storageRequired) + " bbl." : ". Not needed on this ticket."));

    futuresInputs.forEach((input, month) => {
      const before = state.futuresPositions[month];
      const after = result.futuresPositions[month];
      const cell = element("futures-after-" + month);
      cell.textContent = positionText(after);
      cell.classList.toggle("is-changed", after !== before);
      const valid = Number.isSafeInteger(draft.futuresTrades[month]);
      if (valid) input.removeAttribute("aria-invalid");
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
    exposure.textContent = exposureText(result.netLots) + " · limit ±" + netLimitLots + " lots";
    exposure.classList.toggle("negative", !!result.errors.exposure);
    const marker = element("gauge-marker");
    marker.style.left = Math.max(0, Math.min(100, 50 + result.netLots / (netLimitLots * 2) * 50)) + "%";
    marker.classList.toggle("is-over", !!result.errors.exposure);

    // What the book left by this ticket would make or lose.
    const watch = state.market.watch;
    const scenario = element("order-scenario");
    scenario.replaceChildren();
    if (watch) {
      set("scenario-label", "On watch");
      append(scenario, "span", "If it happens ");
      append(scenario, "b", roughly(result.ifHit), tone(Math.round(result.ifHit / 1000)));
      append(scenario, "span", " · if not ");
      append(scenario, "b", roughly(result.ifMiss), tone(Math.round(result.ifMiss / 1000)));
    } else {
      set("scenario-label", "If prices move");
      if (!result.perDollar && !result.perSpotDime) append(scenario, "span", "No price exposure");
      else {
        append(scenario, "b", money(result.perDollar), tone(result.perDollar));
        append(scenario, "span", " per $1 up in every price · ");
        append(scenario, "b", money(result.perSpotDime), tone(result.perSpotDime));
        append(scenario, "span", " per 10¢ up in spot alone");
      }
    }

    const changed = result.barrels !== state.barrels || result.occupancy !== state.occupancy || result.clientInTank !== state.clientInTank;
    renderLevels(result.barrels - result.ownedOverflow, result.clientInTank, changed);
    const newBooking = result.storageThroughCycle ? draft.storage : 0;
    renderOverflow(result.ownedOverflow, result.clientOverflow, result.activeStorage + newBooking, changed || newBooking > 0);
    const cash = result.clientCashflow - result.storageCost - result.transportCost - result.tankLease;
    set("order-fees", [
      "Tank lease " + money(-result.tankLease),
      result.clientCashflow ? "client " + money(result.clientCashflow) : "",
      result.storageCost ? "overflow " + money(-result.storageCost) : "",
      result.transportCost ? "tariff " + money(-result.transportCost) : "",
    ].filter(Boolean).join(" · ") + (cash !== -result.tankLease ? " · net " + money(cash) : ""));

    const issue = ["side", "barrels", "client", "storage", "storageCycles", "futuresTrades", "exposure"]
      .map(key => result.errors[key]).find(Boolean);
    const message = element("order-error");
    message.textContent = issue || "";
    message.hidden = !issue;
    message.classList.toggle("is-prompt", !!result.awaitingClient);
    element("confirm-button").disabled = busy || !result.ok;
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
    const final = state.stage === totalCycles - 1;
    set("decision-label", "Order ticket");
    set("phase", "Cycle " + (state.stage + 1));
    set("decision-desk", round.desk);
    set("decision-title", round.title);
    set("decision-brief", round.message);
    const note = element("market-note");
    note.hidden = !round.marketNote;
    note.textContent = round.marketNote ? "Also in the market: " + round.marketNote.replace(/\.$/, "") + ". Check the bid and ask against spot." : "";

    const watch = state.market.watch;
    element("watch").hidden = !watch;
    if (watch) {
      set("watch-odds", watch.odds + "% likely");
      element("watch-meter").style.width = watch.odds + "%";
      set("watch-title", watch.title + ".");
      set("watch-detail", watch.detail + " " + watch.lean);
      set("watch-hit", effectText(watch.hit));
      set("watch-miss", effectText(watch.miss));
    }

    set("ticket-bid", quote(book.sell.price));
    set("ticket-ask", quote(book.buy.price));
    set("ticket-spot", quote(state.market.prices[0]));
    set("ticket-front", quote(book.futuresPrices[0]));

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
    let step = client ? 2 : 1;
    for (const marker of form.querySelectorAll("[data-step-number]")) marker.textContent = String(step++).padStart(2, "0");

    for (const radio of form.elements.side) {
      radio.disabled = radio.value !== "hold" && !book[radio.value]?.max;
      radio.checked = radio.value === "hold";
    }
    inputs.barrels.value = "0";
    inputs.storage.value = "0";
    inputs.storageCycles.value = "1";
    futuresInputs.forEach((input, month) => {
      input.value = "0";
      set("futures-mark-" + month, quote(book.futuresPrices[month]));
      set("futures-open-" + month, positionText(state.futuresPositions[month]));
    });
    set("confirm-button", final ? "Settle the book" : "Commit orders");
    updateTicket();
  }

  function renderDebrief() {
    const debrief = element("debrief");
    debrief.replaceChildren();
    if (!run.completedAt) {
      run.completedAt = Date.now();
      saveRun();
    }
    const rank = run.ranked ? board.record({
      id: run.id, seed: run.seed, net: state.net, drawdown: state.maxDrawdown, completedAt: run.completedAt,
    }) : null;
    set("decision-label", "Debrief");
    set("phase", "Settled");
    set("decision-desk", !run.ranked ? "Practice run · not ranked" : rank === 1 ? "Ranked run · personal best" :
      rank ? "Ranked run · number " + rank + " on your leaderboard" : "Ranked run");
    set("decision-title", "Book closed.");
    set("decision-brief", "All crude is sold and every futures position is closed. The result includes the tank lease, storage, tariffs and client income.");
    element("market-note").hidden = true;
    element("watch").hidden = true;

    append(debrief, "p", money(state.net), "cd-score numeric " + tone(state.net));
    append(debrief, "p", "Largest fall from a peak: " + unsignedMoney(state.maxDrawdown), "cd-debrief__meta");
    const table = append(debrief, "table", undefined, "cd-table");
    append(table, "caption", "Orders and profit and loss change in each cycle", "visually-hidden");
    const heading = table.createTHead().insertRow();
    ["Cycle", "Orders", "P&L change"].forEach((label, index) => {
      const cell = append(heading, "th", label, index === 2 ? "num" : "");
      cell.scope = "col";
    });
    const body = table.createTBody();
    for (const step of state.history) {
      const row = body.insertRow();
      append(row, "td", String(step.cycle));
      append(row, "td", step.label);
      append(row, "td", money(step.delta), tone(step.delta));
    }
    const actions = append(debrief, "div", undefined, "cd-debrief__actions");
    const next = append(actions, "button", "Play a new ranked market", "btn");
    next.type = "button";
    next.addEventListener("click", () => { if (!busy) begin(randomSeed(), true); });
    const again = append(actions, "button", "Practise this market again", "btn btn--secondary");
    again.type = "button";
    again.addEventListener("click", () => { if (!busy) begin(run.seed, false); });
  }

  // --- Ledger ------------------------------------------------------------------

  function renderLedger() {
    const settled = state.stage === totalCycles;
    set("ledger-status", settled ? "Settled" : "Open book");
    const rows = [
      ["Physical crude", state.barrels ? number(state.barrels) + " bbl at " + quote(state.cargoCost) : "Flat", state.components.physical],
      ["WTI futures", futuresSummary(state.futuresPositions), state.components.hedge],
      ["Logistics", "Lease, storage, tariffs, clients", state.components.logistics],
      ["Net P&L", settled ? "Final" : "Marked to market", state.net],
    ];
    const body = element("ledger-rows");
    body.replaceChildren();
    rows.forEach(([name, position, cents], index) => {
      const row = body.insertRow();
      if (index === rows.length - 1) row.className = "is-total";
      append(row, "td", name);
      append(row, "td", position);
      append(row, "td", money(cents), tone(cents));
    });

    const months = element("futures-ledger-rows");
    months.replaceChildren();
    state.futuresBook.forEach((month, index) => {
      const row = months.insertRow();
      append(row, "td", futuresMonths[index] + " WTI");
      append(row, "td", month.position ? positionText(month.position) + " at " + quote(month.averageEntry) + ", now " + quote(month.mark) : "Flat");
      append(row, "td", money(month.pnl), tone(month.pnl));
    });

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

  // --- Forward curve -----------------------------------------------------------

  function renderQuotes() {
    const prices = state.market.prices;
    const previous = state.history.at(-1)?.marketBefore.prices;
    const spread = prices[1] - prices[0];
    set("curve-shape", spread > 0 ? "Contango · Dec " + quote(spread) + " over spot" :
      spread < 0 ? "Backwardation · Dec " + quote(-spread) + " under spot" : "Flat · Dec at spot");
    element("price-chart").setAttribute("aria-label", "WTI forward curve. " +
      curveLabels.map((label, index) => label + " " + quote(prices[index])).join(", ") + ".");
    const quotes = element("quotes");
    quotes.replaceChildren();
    curveLabels.forEach((label, index) => {
      const button = append(quotes, "button", undefined, "cd-quote");
      button.type = "button";
      button.dataset.quote = index;
      button.setAttribute("aria-pressed", "false");
      if (index && state.round) button.setAttribute("aria-label", label + " WTI at " + quote(prices[index]) + ". Enter an order.");
      append(button, "span", label, "label");
      append(button, "strong", quote(prices[index]));
      const change = previous ? prices[index] - previous[index] : 0;
      append(button, "small", previous ? (change > 0 ? "+" : change < 0 ? "−" : "") + (Math.abs(change) / 100).toFixed(2) : "Opening", tone(change));
    });
    element("curve-hint").hidden = !state.round;

    // The wire: every day's news so far, newest first.
    element("wire").hidden = state.history.length === 0;
    const wire = element("wire-list");
    wire.replaceChildren();
    state.history.slice().reverse().forEach(step => {
      const change = step.market.prices[0] - step.marketBefore.prices[0];
      const row = append(wire, "li");
      const text = append(row, "span", step.market.shock ? step.market.shock.headline : step.market.headline);
      append(text, "small", "After cycle " + step.cycle + (step.market.shock && step.market.resolved ? " · also: " + step.market.headline : ""));
      append(row, "strong", "Spot " + move(change), tone(change));
    });
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
    const prices = movingPrices || state.market.prices;
    const previous = state.history.at(-1)?.marketBefore.prices;
    const series = [...state.market.prices, ...(previous || []), ...prices];
    const low = Math.floor((Math.min(...series) - 25) / 100) * 100;
    const high = Math.ceil((Math.max(...series) + 25) / 100) * 100;
    const interval = high - low > 900 ? 300 : high - low > 500 ? 200 : 100;
    const left = curveMargins.left, right = width - curveMargins.right, top = curveMargins.top, bottom = height - curveMargins.bottom;
    const x = (index) => left + (right - left) * index / (prices.length - 1);
    const y = (value) => bottom - (value - low) / (high - low) * (bottom - top);

    ctx.font = "500 11px " + getComputedStyle(element("location-clock")).fontFamily;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let value = low; value <= high; value += interval) {
      const lineY = Math.round(y(value)) + .5;
      ctx.fillStyle = token("--muted");
      ctx.fillText("$" + value / 100, 0, lineY);
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

  function animateMarket(previous) {
    if (still()) return;
    const start = performance.now();
    const before = previous.market.prices;
    const after = state.market.prices;
    const finalNet = state.net;
    const tick = now => {
      const progress = Math.min(1, (now - start) / 560);
      const eased = 1 - Math.pow(1 - progress, 3);
      movingPrices = progress < 1 ? before.map((price, index) => price + (after[index] - price) * eased) : null;
      // Whole dollars while it counts, so the figure does not flicker through cents.
      amount("net-value", progress < 1 ? Math.round((previous.net + (finalNet - previous.net) * eased) / 100) * 100 : finalNet);
      drawCurve();
      frameRequest = progress < 1 ? requestAnimationFrame(tick) : undefined;
    };
    tick(start);
  }

  // --- Whole-page render ---------------------------------------------------------

  function renderGame(next, previous) {
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    frameRequest = undefined;
    movingPrices = null;
    state = next;
    quoteIndex = -1;
    renderHead();
    renderTerminal();
    renderTicket();
    renderLedger();
    renderQuotes();
    const last = state.history.at(-1);
    element("cycle-note").hidden = !last;
    if (last) {
      set("cycle-headline", "Cycle " + last.cycle + " · " + (state.market.shock ? state.market.shock.headline : state.market.headline));
      set("cycle-outcome", last.outcome);
      amount("cycle-delta", last.delta);
    }
    if (previous) animateMarket(previous);
  }

  function begin(seed, generated, show = true) {
    run = { id: window.CargoLeaderboard.newRunId(), seed, ranked: claimSeed(seed, generated), decisions: [], completedAt: null };
    saveRun();
    renderGame(replay(run.seed, run.decisions));
    // A run the player starts brings the top of the game back into view.
    if (show) element("cargo-desk").scrollIntoView({ block: "start", behavior: still() ? "instant" : "smooth" });
  }

  function openNewRun(seed = "") {
    if (busy) return;
    const midRun = state.stage > 0 && state.stage < totalCycles;
    set("restart-message", (midRun ? "Starting a new run abandons this one" + (run.ranked ? ", and it cannot be ranked later. " : ". ") : "") +
      "A new random market is ranked. A seed you type in is a practice run.");
    element("seed-input").value = seed;
    element("seed-input").setCustomValidity("");
    element("restart-dialog").showModal();
  }

  const board = window.CargoLeaderboard.create({
    container: element("leaderboard-content"),
    onReplay(seed) {
      if (busy) return;
      element("leaderboard-dialog").close();
      if (state.stage > 0 && state.stage < totalCycles) openNewRun(seed);
      else begin(seed, false);
    },
  });

  // --- Events ------------------------------------------------------------------

  form.addEventListener("input", event => {
    if (busy || !state.round) return;
    if (event.target.name === "side") {
      const route = state.round.orderBook[event.target.value];
      inputs.barrels.value = route ? String(route.max) : "0";
    }
    updateTicket();
  });

  // The slider and the number box are two handles on the same volume.
  slider.addEventListener("input", event => {
    event.stopPropagation();
    if (busy || !state.round) return;
    inputs.barrels.value = slider.value;
    updateTicket();
  });

  element("barrels-max").addEventListener("click", () => {
    const route = state.round?.orderBook[form.elements.side.value];
    if (!route) return;
    inputs.barrels.value = String(route.max);
    updateTicket();
  });

  // Adjust only December and leave every other order intact.
  element("hedge-flat").addEventListener("click", () => {
    if (busy || !state.round) return;
    const draft = readOrder();
    const otherTrades = draft.futuresTrades.slice(1);
    if (otherTrades.some(quantity => !Number.isSafeInteger(quantity) || Math.abs(quantity) > 2 * maxFuturesLots)) {
      showHedgeStatus("Enter valid whole-lot orders in the other months first.");
      return;
    }

    const current = preview(state, draft);
    if (current.errors.side || current.errors.barrels) {
      showHedgeStatus("Enter a valid crude order before adjusting the December hedge.");
      return;
    }

    const otherPositions = otherTrades.map((quantity, index) => state.futuresPositions[index + 1] + quantity);
    const grossRoom = maxFuturesLots - otherPositions.reduce((total, position) => total + Math.abs(position), 0);
    if (grossRoom < 0) {
      showHedgeStatus("Reduce open lots in the other months before adjusting December.");
      return;
    }

    const exposureWithoutDec = current.barrels / lot + otherPositions.reduce((sum, position) => sum + position, 0);
    const flatTarget = -Math.round(exposureWithoutDec);
    const decTarget = Math.min(grossRoom, Math.max(-grossRoom, flatTarget));
    const decTrade = decTarget - state.futuresPositions[0];
    const adjusted = preview(state, { ...draft, futuresTrades: [decTrade, ...otherTrades] });
    if (adjusted.errors.futuresTrades || adjusted.errors.exposure) {
      showHedgeStatus("December alone cannot bring the ticket within the limits. Reduce open lots in another month or change the crude order.");
      return;
    }

    futuresInputs[0].value = String(decTrade);
    updateTicket();
    if (!adjusted.netLots) showHedgeStatus("Net exposure is flat after this ticket.");
    else if (decTarget !== flatTarget) {
      showHedgeStatus("The gross limit leaves " + exposureText(adjusted.netLots) + ". Change the crude order or adjust another month to get closer to flat.");
    } else {
      showHedgeStatus("The closest whole-lot hedge leaves " + exposureText(adjusted.netLots) + ".");
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy || !state.round) return;
    const { draft, result } = updateTicket();
    if (!result.ok) return;

    const previous = state;
    const next = replay(run.seed, [...run.decisions, draft]);
    if (next.stage !== previous.stage + 1) return;
    run.decisions = next.decisions;
    if (next.stage === totalCycles) run.completedAt = Date.now();
    saveRun();
    busy = true;
    fields.disabled = true;
    element("confirm-button").disabled = true;
    for (const id of ["restart-button", "leaderboard-button", "help-button"]) element(id).disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      await transition({
        from: "Cycle " + next.stage,
        to: next.stage === totalCycles ? "Settled" : "Cycle " + (next.stage + 1),
        label: next.history.at(-1).label,
        delta: next.net - previous.net,
        time: next.market.time + " CT",
        news: [
          next.market.resolved ? { text: next.market.headline + "." } : null,
          next.market.shock ? { text: next.market.shock.headline + ".", shock: true } : null,
        ].filter(Boolean),
      });
    } finally {
      busy = false;
      fields.disabled = false;
      renderGame(next, previous);
      for (const id of ["restart-button", "leaderboard-button", "help-button"]) element(id).disabled = false;
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
    if (next > 0 && quoteIndex === next && state.round && !busy) {
      futuresInputs[next - 1].focus();
      futuresInputs[next - 1].select();
    }
  }

  element("quotes").addEventListener("click", event => {
    const button = event.target.closest("[data-quote]");
    if (button) selectQuote(Number(button.dataset.quote));
  });
  element("price-chart").addEventListener("click", event => {
    if (!state.round || busy) return;
    const plot = event.currentTarget.getBoundingClientRect();
    const cursor = event.clientX - plot.left;
    const right = plot.width - curveMargins.right;
    if (cursor < curveMargins.left - 12 || cursor > right + 12) return;
    const index = Math.round((cursor - curveMargins.left) * (curveLabels.length - 1) / (right - curveMargins.left));
    selectQuote(Math.max(0, Math.min(curveLabels.length - 1, index)));
  });

  element("help-button").addEventListener("click", () => { if (!busy) element("help-dialog").showModal(); });
  element("leaderboard-button").addEventListener("click", () => {
    if (busy) return;
    board.render();
    element("leaderboard-dialog").showModal();
  });
  element("restart-button").addEventListener("click", () => openNewRun());
  element("seed-input").addEventListener("input", event => event.target.setCustomValidity(""));
  element("seed-form").addEventListener("submit", event => {
    event.preventDefault();
    if (busy) return;
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
    if (busy) return;
    element("restart-dialog").close();
    begin(randomSeed(), true);
  });

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

  futuresInputs = futuresMonths.map((name, month) => {
    const row = element("futures-rows").insertRow();
    const head = append(row, "th");
    head.scope = "row";
    head.append(name);
    append(head, "small").id = "futures-mark-" + month;
    append(row, "td").id = "futures-open-" + month;
    const stepper = append(append(row, "td"), "div", undefined, "cd-stepper");
    const input = document.createElement("input");
    const nudge = (label, text, by) => {
      const button = append(stepper, "button", text);
      button.type = "button";
      button.setAttribute("aria-label", label + " one " + name + " lot");
      button.addEventListener("click", () => {
        if (busy || !state.round) return;
        input.value = String((Number.isSafeInteger(input.valueAsNumber) ? input.valueAsNumber : 0) + by);
        updateTicket();
      });
    };
    nudge("Sell", "−", -1);
    input.type = "number";
    input.step = "1";
    input.value = "0";
    input.inputMode = "numeric";
    input.name = "futures" + month;
    input.id = "futures-lots-" + month;
    input.setAttribute("aria-label", name + " order in lots. Negative sells.");
    stepper.append(input);
    nudge("Buy", "+", 1);
    append(row, "td").id = "futures-after-" + month;
    return input;
  });

  run = loadRun();
  if (run) {
    saveRun();
    renderGame(replay(run.seed, run.decisions));
  } else {
    begin(randomSeed(), true, false);
  }
  new ResizeObserver(drawCurve).observe(element("chart-wrap"));
  document.fonts?.ready.then(drawCurve);
})();
