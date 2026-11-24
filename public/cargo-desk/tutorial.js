(function () {
  "use strict";

  const { init, buyQuote, buy, forwardQuote, forward, settle, deliveryCycle, purchaseSizes } = window.CargoTutorial;
  const { lot, netLimitLots } = window.CargoDesk;
  const el = (id) => document.getElementById("tutorial-" + id);
  const put = (id, text) => { el(id).textContent = text; };
  const dialog = el("dialog");
  const prompt = el("prompt");
  const offerKey = "cargo-desk-tutorial-seen";
  const whole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const number = (value) => value.toLocaleString("en-US");
  const unitPrice = (cents) => decimal.format(cents / 100);
  const amount = (cents) => (cents < 0 ? "−" : cents > 0 ? "+" : "") +
    (cents % 100 ? decimal : whole).format(Math.abs(cents) / 100);
  const lots = (count) => count + (count === 1 ? " lot" : " lots");
  const numbered = (min, max) => Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const sellChoices = numbered(0, purchaseSizes.at(-1) / lot + netLimitLots + 1);
  const orderChoices = numbered(-2 * netLimitLots - 1, purchaseSizes.at(-1) / lot + 2 * netLimitLots + 1);
  const readBuy = () => ({ barrels: Number(el("volume").value), shortLots: Number(el("short").value) });
  const readForward = () => ({ barrels: Number(el("delivery-volume").value), route: el("route").value,
    month: Number(el("month").value), closeLots: Number(el("buyback").value) });

  let lesson;
  let opener;
  let mayOffer = false;
  let seen = false;
  let suggestedLots;
  try { seen = localStorage.getItem(offerKey) === "yes"; } catch {}

  function offer(isNewDesk) {
    mayOffer = isNewDesk;
    prompt.hidden = !mayOffer || seen;
  }

  function markSeen() {
    seen = true;
    try { localStorage.setItem(offerKey, "yes"); } catch {}
    offer(mayOffer);
  }

  function feedback(message, error = false) {
    const node = el("feedback");
    node.classList.toggle("is-error", error);
    node.textContent = message;
  }

  function choose(id, values, label, initial) {
    const select = el(id);
    select.replaceChildren(...values.map(value => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = label(value);
      return option;
    }));
    select.value = String(initial);
  }

  const volumeLabel = barrels => number(barrels) + " bbl";
  const position = netLots => netLots === 0 ? "flat" : lots(Math.abs(netLots)) + (netLots > 0 ? " long" : " short");
  const shift = value => (value < 0 ? "−" : value > 0 ? "+" : "") + lots(Math.abs(value));
  const orderLabel = value => value === 0 ? "0 lots (hold)" : (value < 0 ? "Sell " : "Buy ") + lots(Math.abs(value));

  function guide(quote, math, submissionIssue) {
    suggestedLots = quote.suggestedLots;
    const available = Number.isSafeInteger(suggestedLots);
    el("guide").hidden = !available;
    if (available && lesson.step === "buy") {
      put("suggestion", "Sell " + lots(suggestedLots) + " for a flat book.");
    } else if (available) {
      put("suggestion", suggestedLots ? orderLabel(suggestedLots) + " for a flat book." : "Keep futures unchanged for a flat book.");
    }
    const issue = submissionIssue || quote.error;
    const showsLimit = !!issue && issue === quote.estimate?.errors.exposure;
    const projected = Number.isFinite(quote.netLots) && math ? math + (showsLimit ? "." : " → " + position(quote.netLots) + ".") : "";
    feedback([projected, issue].filter(Boolean).join(" "), !!issue);
  }

  function showQuote(submissionIssue) {
    if (lesson.step === "buy") {
      const draft = readBuy();
      const quote = buyQuote(lesson, draft);
      const mark = el("trade-quote");
      mark.hidden = false;
      mark.textContent = "Local ask " + unitPrice(quote.price) + " per bbl, up to " + volumeLabel(purchaseSizes.at(-1)) + " · " +
        quote.monthName + " WTI " + unitPrice(quote.hedgePrice) + " per bbl";
      guide(quote, "Crude " + shift(draft.barrels / lot) + " · " + quote.monthName + " WTI " + shift(-draft.shortLots), submissionIssue);
    } else if (lesson.step === "forward") {
      const draft = readForward();
      const quote = forwardQuote(lesson, draft);
      const contract = quote.contract;
      put("quote", contract ? contract.monthName + " WTI " + unitPrice(contract.futuresPrice) +
        (contract.basis < 0 ? " − " : " + ") + unitPrice(Math.abs(contract.basis)) + " route basis gives " +
        unitPrice(contract.fixedGross) + " fixed per bbl." + (contract.tariff ? " After the " + unitPrice(contract.tariff) +
        " tariff, you receive " + unitPrice(contract.netPrice) + " per bbl." : " The local route has no tariff.") : "");
      const math = contract ? "Before " + position(lesson.market.netLots) + " · priced delivery " + shift(-draft.barrels / lot) +
        " · " + lesson.buyQuote.monthName + " WTI " + shift(draft.closeLots) : "";
      guide(quote, math, submissionIssue);
    }
  }

  function recap() {
    const { breakdown, market } = lesson;
    const pnl = el("net");
    pnl.textContent = amount(breakdown.total);
    pnl.classList.toggle("positive", breakdown.total > 0);
    pnl.classList.toggle("negative", breakdown.total < 0);
    const rows = [
      ["Trade and delivery prices vs. spot", breakdown.trading],
      ["Broad price moves on net exposure", breakdown.price],
      ["Spot vs. futures (basis)", breakdown.basis],
      ...(breakdown.spreads ? [["Calendar spreads", breakdown.spreads]] : []),
      ...(breakdown.clients ? [["Client income", breakdown.clients]] : []),
      ["Tank lease, client fees and tariffs", breakdown.costs],
    ];
    el("recap-rows").replaceChildren(...rows.map(([label, cents]) => {
      const row = document.createElement("div");
      const key = document.createElement("dt");
      const value = document.createElement("dd");
      key.textContent = label;
      value.textContent = amount(cents);
      if (cents) value.classList.add(cents > 0 ? "positive" : "negative");
      row.append(key, value);
      return row;
    }));
    const parcel = breakdown.parcel;
    put("explanation", "You bought " + volumeLabel(lesson.barrels) + " at " + unitPrice(lesson.buyQuote.price) +
      " per bbl and delivered " + volumeLabel(parcel.barrels) + " at " + unitPrice(parcel.fixedGross) +
      " per bbl. The fixed sale less your purchase price and route tariff gives " + amount(parcel.marginAfterTariff) +
      " on the booked volume before futures and shared costs. Across the whole desk, futures P&L changed by " + amount(breakdown.futuresPnl) + ".");
    put("ending-crude", volumeLabel(breakdown.endingCrudeBarrels));
    put("ending-futures", breakdown.endingFuturesPositions.flatMap((quantity, index) => quantity ?
      [market.months[index] + " " + position(quantity)] : []).join(" · ") || "Flat");
    put("ending-exposure", position(breakdown.endingNetLots));
  }

  function render() {
    const { step } = lesson;
    const screens = {
      buy: "trade",
      forward: "booking",
      settle: "settlement",
      complete: "recap",
    };
    for (const panel of Object.values(screens)) el(panel).hidden = panel !== screens[step];
    el("settle-note").hidden = step !== "settle";
    for (const note of dialog.querySelectorAll(".cd-tutorial__note[open]")) note.open = false;
    const complete = step === "complete";
    el("next").hidden = complete;
    el("complete").hidden = !complete;
    el("guide").hidden = true;
    suggestedLots = undefined;
    feedback("");
    if (step === "buy") {
      put("step", "Step 1 of 3");
      put("title", "Buy crude and hedge it");
      put("instruction", "Buy crude at the local ask. Selling one " + lesson.buyQuote.monthName +
        " futures lot per 1,000 barrels keeps the desk flat. Try a different hedge to see how exposure changes.");
      put("short-label", lesson.buyQuote.monthName + " WTI lots to sell");
      put("next", "Commit purchase ticket");
      el("progress").value = 1;
    } else if (step === "forward") {
      put("step", "Step 2 of 3");
      put("title", "Book a delivery");
      put("instruction", "Book some or all of your " + volumeLabel(lesson.barrels) + " for cycle " + deliveryCycle +
        ". Booking fixes the sale price and removes one lot of exposure per 1,000 barrels. Choose how to adjust your futures.");
      choose("delivery-volume", purchaseSizes.filter(size => size <= lesson.barrels), volumeLabel, lesson.barrels);
      choose("buyback", orderChoices, orderLabel, 0);
      put("buyback-label", lesson.buyQuote.monthName + " futures order");
      const select = el("month");
      select.replaceChildren(...lesson.market.deliveryOptions.months.map(({ month, name, price }) => {
        const option = document.createElement("option");
        option.value = String(month);
        option.textContent = name + " WTI · " + unitPrice(price);
        return option;
      }));
      select.selectedIndex = Math.min(1, select.options.length - 1);
      put("next", "Commit delivery ticket");
      el("progress").value = 2;
    } else if (step === "settle") {
      put("step", "Step 3 of 3");
      put("title", "Deliver the barrels");
      put("instruction", "Advance the cycle to deliver your reserved crude at the agreed price. Uncommitted crude and open futures still move with the market.");
      put("settlement", "Cycle " + lesson.contract.cycle + " · " + volumeLabel(lesson.contract.barrels) + " · " +
        (lesson.contract.route === "gulf" ? "Gulf delivery" : "Local delivery") + " · " +
        unitPrice(lesson.contract.fixedGross) + " fixed per bbl. The desk goes into settlement " + position(lesson.market.netLots) + ".");
      put("next", "Advance and settle delivery");
      el("progress").value = 3;
    } else {
      put("step", "Tutorial complete");
      put("title", lesson.breakdown.total > 0 ? "Why the desk made money" :
        lesson.breakdown.total < 0 ? "Why the desk lost money" : "Why the desk broke even");
      put("instruction", "This is the change in the desk’s profit and loss across three cycles. It includes the cargo and hedge you started with.");
      recap();
      markSeen();
    }
    showQuote();
  }

  function focusStep() {
    dialog.scrollTop = 0;
    el("title").focus({ preventScroll: true });
  }

  function open(event) {
    const trigger = event.currentTarget;
    if (trigger.disabled || document.querySelector("dialog[open]") ||
      document.documentElement.classList.contains("cycle-committing")) return;
    opener = trigger;
    if (!lesson || lesson.step === "complete") {
      lesson = init();
      choose("volume", purchaseSizes, volumeLabel, purchaseSizes[1] ?? purchaseSizes[0]);
      choose("short", sellChoices, lots, 0);
      el("route").value = "local";
      render();
    } else {
      showQuote();
    }
    dialog.showModal();
    focusStep();
  }

  for (const id of ["button", "start"]) el(id).addEventListener("click", open);
  el("dismiss").addEventListener("click", () => {
    markSeen();
    el("button").focus();
  });
  for (const id of ["volume", "short", "delivery-volume", "route", "month", "buyback"]) {
    el(id).addEventListener("change", () => { if (dialog.open && lesson) showQuote(); });
  }
  el("flat").addEventListener("click", () => {
    if (!dialog.open || !lesson || !Number.isSafeInteger(suggestedLots)) return;
    el(lesson.step === "buy" ? "short" : "buyback").value = String(suggestedLots);
    showQuote();
  });
  el("next").addEventListener("click", (event) => {
    if (!dialog.open || !lesson || lesson.step === "complete" || event.detail > 1) return;
    const result = lesson.step === "buy" ? buy(lesson, readBuy()) :
      lesson.step === "forward" ? forward(lesson, readForward()) : settle(lesson);
    if (!result.ok) {
      if (lesson.step === "settle") feedback(result.error, true);
      else showQuote(result.error);
      return;
    }
    lesson = result.state;
    render();
    focusStep();
  });
  el("complete").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (document.querySelector("dialog[open]")) return;
    const target = opener?.isConnected && !opener.disabled && !opener.closest("[hidden]") ? opener : el("button");
    opener = null;
    if (!target.disabled) target.focus({ preventScroll: true });
  });

  window.CargoTutorialUI = { offer };
})();
