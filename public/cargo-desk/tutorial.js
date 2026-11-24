(function () {
  "use strict";

  const { init, buyQuote, buy, forwardQuote, forward, settle, deliveryCycle } = window.CargoTutorial;
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
  const readBuy = () => ({ barrels: Number(el("volume").value), shortLots: Number(el("short").value) });
  const readForward = () => ({ route: el("route").value, month: Number(el("month").value), closeLots: Number(el("buyback").value) });

  let lesson;
  let opener;
  let mayOffer = false;
  let seen = false;
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

  function exposure(netLots) {
    if (!Number.isFinite(netLots)) return "";
    return netLots === 0 ? "Net exposure: flat." : "Net exposure: " + lots(Math.abs(netLots)) + (netLots > 0 ? " long." : " short.");
  }

  function showQuote() {
    if (lesson.step === "buy") {
      const draft = readBuy();
      const quote = buyQuote(lesson, draft);
      const mark = el("trade-quote");
      mark.hidden = false;
      mark.textContent = number(draft.barrels) + " bbl at " + unitPrice(quote.price) + " per bbl. " +
        quote.monthName + " WTI is " + unitPrice(quote.hedgePrice) + ".";
      feedback(exposure(quote.netLots));
    } else if (lesson.step === "forward") {
      const quote = forwardQuote(lesson, readForward());
      const contract = quote.contract;
      put("quote", contract ? "Fixed " + unitPrice(contract.fixedGross) + " per bbl" +
        (contract.tariff ? " · " + unitPrice(contract.tariff) + " tariff per bbl · " + unitPrice(contract.fixedGross - contract.tariff) + " net" : " · no tariff") : "");
      feedback(exposure(quote.netLots));
    }
  }

  function recap() {
    const { breakdown, barrels, contract } = lesson;
    const pnl = el("net");
    pnl.textContent = amount(breakdown.total);
    pnl.classList.toggle("positive", breakdown.total > 0);
    pnl.classList.toggle("negative", breakdown.total < 0);
    const rows = [
      ["Trade and delivery prices vs. spot", breakdown.trading],
      ["Overall price move on the hedged book", breakdown.price],
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
    put("explanation", "You bought " + number(barrels) + " bbl at " + unitPrice(lesson.buyQuote.price) +
      " and delivered at " + unitPrice(contract.fixedGross) + " per bbl. The parcel contributed " +
      amount(parcel.netBeforeSharedCosts) + " after the hedge " + amount(parcel.hedgePnl) +
      (breakdown.tariffCost ? " and tariff " + amount(-breakdown.tariffCost) : "") +
      ". On the full book, spot moving against futures contributed " + amount(breakdown.basis) +
      ". Tank and client fees cost " + whole.format((breakdown.tankFees + breakdown.clientFees) / 100) + ".");
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
    const complete = step === "complete";
    el("next").hidden = complete;
    el("complete").hidden = !complete;
    feedback("");
    if (step === "buy") {
      put("step", "Step 1 of 3");
      put("title", "Buy crude and hedge it");
      put("instruction", "The desk starts with 6,000 barrels and six short Dec WTI lots. Buy more crude, then sell one extra futures lot for each 1,000 barrels you buy. Short futures can offset a fall in the value of the crude.");
      put("next", "Commit purchase and hedge");
      el("progress").value = 1;
    } else if (step === "forward") {
      put("step", "Step 2 of 3");
      put("title", "Book a delivery");
      put("instruction", "Lock a price for your " + number(lesson.barrels) + " barrels in cycle " + deliveryCycle +
        ". Choose a route and WTI reference month. Once the sale price is fixed, buy back the " +
        lots(lesson.barrels / 1000) + " you added in step 1.");
      const select = el("month");
      select.replaceChildren(...lesson.market.deliveryOptions.months.map(({ month, name, price }) => {
        const option = document.createElement("option");
        option.value = String(month);
        option.textContent = name + " WTI · " + unitPrice(price);
        return option;
      }));
      select.selectedIndex = Math.min(1, select.options.length - 1);
      put("next", "Commit delivery and hedge adjustment");
      el("progress").value = 2;
    } else if (step === "settle") {
      put("step", "Step 3 of 3");
      put("title", "Deliver the barrels");
      put("instruction", "The booked crude stays in the tank until the sale settles. The rest of the desk stays hedged while prices move.");
      put("settlement", "Cycle " + lesson.contract.cycle + " · " + number(lesson.barrels) + " bbl · " +
        (lesson.contract.route === "gulf" ? "Gulf delivery" : "Local delivery") + " · " +
        unitPrice(lesson.contract.fixedGross) + " fixed per bbl. You’ll turn away any clients and pay the tank lease as the tutorial advances.");
      put("next", "Advance and settle delivery");
      el("progress").value = 3;
    } else {
      put("step", "Tutorial complete");
      put("title", lesson.breakdown.total > 0 ? "Why the desk made money" :
        lesson.breakdown.total < 0 ? "Why the desk lost money" : "Why the desk broke even");
      put("instruction", "Your P&L across three cycles includes the cargo you started with.");
      recap();
      markSeen();
    }
    showQuote();
  }

  function open(event) {
    if (dialog.open) return;
    opener = event.currentTarget;
    if (!lesson || lesson.step === "complete") {
      lesson = init();
      el("volume").value = "2000";
      el("short").value = "0";
      el("route").value = "local";
      el("buyback").value = "0";
      render();
    }
    dialog.showModal();
    el("title").focus();
  }

  for (const id of ["button", "start"]) el(id).addEventListener("click", open);
  el("dismiss").addEventListener("click", () => {
    markSeen();
    el("button").focus();
  });
  for (const id of ["volume", "short", "route", "month", "buyback"]) el(id).addEventListener("change", showQuote);
  el("next").addEventListener("click", () => {
    const result = lesson.step === "buy" ? buy(lesson, readBuy()) :
      lesson.step === "forward" ? forward(lesson, readForward()) : settle(lesson);
    if (!result.ok) {
      feedback(result.error, true);
      return;
    }
    lesson = result.state;
    render();
    el("title").focus();
  });
  el("complete").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => (prompt.hidden && opener === el("start") ? el("button") : opener)?.focus());

  window.CargoTutorialUI = { offer };
})();
