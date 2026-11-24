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
    return netLots === 0 ? "After this ticket, net exposure is flat." : "After this ticket, net exposure is " +
      lots(Math.abs(netLots)) + (netLots > 0 ? " long." : " short.");
  }

  function showQuote() {
    if (lesson.step === "buy") {
      const draft = readBuy();
      const quote = buyQuote(lesson, draft);
      const mark = el("trade-quote");
      mark.hidden = false;
      mark.textContent = "Local ask " + unitPrice(quote.price) + " per bbl · " +
        quote.monthName + " WTI " + unitPrice(quote.hedgePrice) + " per bbl";
      feedback(exposure(quote.netLots));
    } else if (lesson.step === "forward") {
      const quote = forwardQuote(lesson, readForward());
      const contract = quote.contract;
      put("quote", contract ? contract.monthName + " WTI " + unitPrice(contract.futuresPrice) +
        (contract.basis < 0 ? " − " : " + ") + unitPrice(Math.abs(contract.basis)) + " route basis gives " +
        unitPrice(contract.fixedGross) + " fixed per bbl." + (contract.tariff ? " After the " + unitPrice(contract.tariff) +
        " tariff, you receive " + unitPrice(contract.netPrice) + " per bbl." : " The local route has no tariff.") : "");
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
    put("explanation", "You bought " + number(barrels) + " bbl at " + unitPrice(lesson.buyQuote.price) +
      " and sold them for " + unitPrice(contract.fixedGross) + " per bbl. Your added cargo contributed " +
      amount(parcel.netBeforeSharedCosts) + ", including " + amount(parcel.hedgePnl) + " from the futures hedge" +
      (breakdown.tariffCost ? " and " + amount(-breakdown.tariffCost) + " in pipeline fees" : "") +
      ". The full desk also carries the starting cargo and paid " + whole.format((breakdown.tankFees + breakdown.clientFees) / 100) +
      " in tank and client fees.");
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
    feedback("");
    if (step === "buy") {
      put("step", "Step 1 of 3");
      put("title", "Buy crude and hedge it");
      put("instruction", "The desk starts flat with 6,000 barrels and six short WTI lots. Buy more crude at the local ask and sell one extra " +
        lesson.buyQuote.monthName + " futures lot for each 1,000 barrels you add.");
      put("next", "Commit purchase and hedge");
      el("progress").value = 1;
    } else if (step === "forward") {
      put("step", "Step 2 of 3");
      put("title", "Book a delivery");
      put("instruction", "Choose a route and a WTI reference to lock in the sale price for cycle " + deliveryCycle +
        ". The sale now covers the price of those barrels. Buy back the " + lots(lesson.barrels / 1000) + " of " +
        lesson.buyQuote.monthName + " WTI you sold in step 1.");
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
      put("instruction", "Advance the cycle to deliver your reserved crude at the agreed price. The rest of the desk stays hedged while the market moves.");
      put("settlement", "Cycle " + lesson.contract.cycle + " · " + number(lesson.barrels) + " bbl · " +
        (lesson.contract.route === "gulf" ? "Gulf delivery" : "Local delivery") + " · " +
        unitPrice(lesson.contract.fixedGross) + " fixed per bbl. The desk pays its tank lease and turns away any storage clients during the lesson.");
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
      el("volume").value = "2000";
      el("short").value = "0";
      el("route").value = "local";
      el("buyback").value = "0";
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
  for (const id of ["volume", "short", "route", "month", "buyback"]) {
    el(id).addEventListener("change", () => { if (dialog.open && lesson) showQuote(); });
  }
  el("next").addEventListener("click", (event) => {
    if (!dialog.open || !lesson || lesson.step === "complete" || event.detail > 1) return;
    const result = lesson.step === "buy" ? buy(lesson, readBuy()) :
      lesson.step === "forward" ? forward(lesson, readForward()) : settle(lesson);
    if (!result.ok) {
      feedback(result.error, true);
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
