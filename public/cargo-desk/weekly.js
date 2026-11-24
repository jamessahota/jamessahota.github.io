(function () {
  "use strict";

  const el = id => document.getElementById("weekly-" + id);
  const dialog = el("dialog");
  const nameInput = el("name");
  const consent = el("consent");
  const receiptKey = "cargo-desk-weekly-receipt-v1";
  const weeklyLimits = new Map([
    ["weekly-v1", window.CargoDesk.netLimitLots],
    ["weekly-v2", window.CargoDesk.rankedNetLimitLots],
  ]);
  let receipt = readReceipt();
  const day = 24 * 60 * 60 * 1000;
  const dates = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const reset = new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
  });
  const amounts = [0, 2].map(digits => new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits,
  }));
  const dollars = cents => amounts[cents % 100 === 0 ? 0 : 1].format(Math.abs(cents) / 100);
  const signed = cents => (cents < 0 ? "−" : cents > 0 ? "+" : "") + dollars(cents);
  const time = value => typeof value === "number" ? value : Date.parse(value);
  let config;
  let current;
  let operation = "";
  let retryAction;
  let modalVisit = 0;
  let expiryTimer;
  let formToken;
  let opener;

  function append(parent, tag, value) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    parent.append(node);
    return node;
  }

  function getUsername() {
    try { return window.CargoLeaderboard?.getUsername?.() || localStorage.getItem("cargo-desk-score-name") || ""; }
    catch { return ""; }
  }

  function rememberUsername(value) {
    try {
      if (window.CargoLeaderboard?.setUsername) window.CargoLeaderboard.setUsername(value);
      else localStorage.setItem("cargo-desk-score-name", value);
    } catch {}
  }

  function cleanUsername(value) {
    if (typeof value !== "string" || /[\p{C}\p{Default_Ignorable_Code_Point}\p{Z}]/u.test(value.replaceAll(" ", ""))) return null;
    const name = value.trim().normalize("NFC");
    return /^(?:[\p{L}\p{N}\p{P}\p{S}]\p{M}*| )+$/u.test(name) && [...name].length <= 24 ? name : null;
  }

  function readReceipt() {
    try {
      const saved = JSON.parse(localStorage.getItem(receiptKey));
      // Earlier receipts omit the rules because they were all issued under weekly-v1.
      const rules = saved?.rules ?? "weekly-v1";
      if (typeof saved?.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saved.week) &&
          weeklyLimits.has(rules) &&
          typeof saved.token === "string" && /^[0-9a-f]{64}$/.test(saved.token) &&
          typeof saved.name === "string" && cleanUsername(saved.name) === saved.name) return { ...saved, rules };
    } catch {}
    return null;
  }

  function rememberReceipt({ week, rules, token }, name) {
    receipt = { week, rules, token, name };
    try { localStorage.setItem(receiptKey, JSON.stringify(receipt)); } catch {}
  }

  function status(message = "", error = false, retry = null) {
    el("status").textContent = message;
    el("status").classList.toggle("is-error", error);
    retryAction = retry;
    el("retry").hidden = !retry;
  }

  function sameWeek(run, challenge = current) {
    const entry = run?.weekly;
    return !!entry && !!challenge && entry.week === challenge.week &&
      entry.seed === challenge.seed && entry.rules === challenge.rules;
  }

  function entries() {
    const active = config?.getRun();
    const saved = config?.getSavedWeekly();
    const matched = [active, saved].filter(run => sameWeek(run));
    return { active, resumable: matched[0], finished: matched.find(run => run.completedAt && run.weekly.token) };
  }

  function paint() {
    const { active, resumable, finished } = entries();
    const available = !!current && time(current.endsAt) > Date.now();
    const button = el("start");
    button.hidden = !available;
    button.disabled = !!operation;
    button.textContent = sameWeek(active) ? "Back to weekly desk" : resumable?.completedAt ? "View your weekly result" :
      resumable ? "Resume weekly challenge" : "Start weekly challenge";
    el("period").hidden = !current;
    el("standings").hidden = !current;
    el("standings").setAttribute("aria-busy", String(operation === "refresh"));
    el("retry").disabled = !!operation;
    nameInput.disabled = consent.disabled = el("publish").disabled = !!operation;

    const shared = finished && receipt?.week === finished.weekly.week &&
      receipt.rules === finished.weekly.rules && receipt.token === finished.weekly.token;
    const sharing = available && !!finished && !shared;
    el("share").hidden = !sharing;
    el("published").hidden = !available || !shared;
    if (shared) el("published").textContent = "Score shared as " + receipt.name + ".";
    if (sharing && formToken !== finished.weekly.token) {
      formToken = finished.weekly.token;
      nameInput.value = getUsername();
      nameInput.removeAttribute("aria-invalid");
      consent.checked = false;
    }
  }

  function validateChallenge(data, needsToken = false) {
    if (typeof data?.week !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.week) || !weeklyLimits.has(data.rules) ||
        data.seed !== data.rules + ":" + data.week || !Number.isFinite(time(data.endsAt)) ||
        (needsToken && (typeof data.token !== "string" || !/^[0-9a-f]{64}$/.test(data.token)))) {
      throw new Error("invalid_weekly_response");
    }
    const { week, seed, endsAt, rules, token } = data;
    return needsToken ? { week, seed, endsAt, rules, token } : { week, seed, endsAt, rules };
  }

  function paintChallenge(scores) {
    const end = time(current.endsAt);
    el("dates").textContent = dates.formatRange(new Date(end - 7 * day), new Date(end - 1));
    el("reset").textContent = "±" + weeklyLimits.get(current.rules) + " net lots · Resets " + reset.format(end) + " UTC";
    const list = el("scores");
    list.replaceChildren();
    for (const score of scores) {
      if (typeof score?.name !== "string" || !Number.isSafeInteger(score.net) || !Number.isSafeInteger(score.drawdown)) continue;
      const row = append(list, "tr");
      append(row, "th", String(list.rows.length)).scope = "row";
      append(row, "td", score.name);
      const net = append(row, "td", signed(score.net));
      if (score.net) net.className = score.net > 0 ? "positive" : "negative";
      append(row, "td", dollars(score.drawdown));
    }
    el("table-wrap").hidden = !list.rows.length;
    el("empty").hidden = !!list.rows.length;
  }

  async function request(path = "", body) {
    const origin = dialog.dataset.weeklyOrigin?.trim() || window.location.origin;
    const options = { credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(12000) };
    if (body !== undefined) Object.assign(options, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const response = await fetch(new URL("/api/weekly" + path, origin), options);
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.code || data?.error || "weekly_request_failed");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function operationState(next) {
    operation = next;
    paint();
  }

  function monitorReset() {
    clearTimeout(expiryTimer);
    const remaining = current && time(current.endsAt) - Date.now();
    if (dialog.open && remaining > 0) {
      expiryTimer = setTimeout(() => {
        paint();
        status("That week has closed. Load the new challenge to continue.", false, refresh);
        if (!operation) void refresh();
      }, remaining + 50);
    }
  }

  async function refresh(keepStatus = false) {
    if (operation) return;
    if (!keepStatus) status("Loading the weekly challenge…");
    operationState("refresh");
    try {
      const data = await request();
      if (!Array.isArray(data?.scores)) throw new Error("invalid_weekly_response");
      current = validateChallenge(data);
      paintChallenge(data.scores);
      const previous = config.getRun()?.weekly || config.getSavedWeekly()?.weekly;
      if (time(current.endsAt) <= Date.now()) {
        status("This week has closed. Try again to load the next challenge.", false, refresh);
      } else if (previous && previous.week !== current.week && time(previous.endsAt) <= Date.now()) {
        status("Your earlier weekly entry has closed. You can play for a new score this week.");
      } else if (!keepStatus) {
        status();
      }
      monitorReset();
    } catch {
      status("Couldn’t load the weekly challenge. Check your connection and try again.", true, refresh);
    } finally {
      operationState("");
    }
  }

  function closedWeek() {
    if (current) current = { ...current, endsAt: Date.now() };
    paint();
    status("This week has closed. Load the latest challenge to play again.", true, refresh);
  }

  async function start() {
    if (operation || !current) return;
    if (time(current.endsAt) <= Date.now()) { closedWeek(); return; }
    const { active, resumable } = entries();
    if (sameWeek(active)) { dialog.close(); return; }
    if (resumable) {
      if (config.enterWeekly(resumable.weekly) !== false) dialog.close();
      else status("Wait for the current ticket to finish, then try again.", false, start);
      return;
    }

    const visit = modalVisit;
    status("Opening this week’s market…");
    operationState("start");
    try {
      const session = validateChallenge(await request("/start", { week: current.week }), true);
      if (!dialog.open || visit !== modalVisit) return;
      if (!sameWeek({ weekly: session }) || time(session.endsAt) <= Date.now()) { closedWeek(); return; }
      if (config.enterWeekly(session) !== false) dialog.close();
      else status("Wait for the current ticket to finish, then try again.", false, start);
    } catch (error) {
      if (error.status === 409 || error.message === "week_closed") closedWeek();
      else status("Couldn’t open the weekly market. Check your connection and try again.", true, start);
    } finally {
      operationState("");
    }
  }

  async function publish(event) {
    event.preventDefault();
    const run = entries().finished;
    if (!run || operation || !consent.checked) return;
    if (time(current.endsAt) <= Date.now()) { closedWeek(); return; }
    const name = cleanUsername(nameInput.value);
    if (!name) {
      nameInput.setAttribute("aria-invalid", "true");
      nameInput.focus();
      status("Enter a username with 1 to 24 visible characters.", true);
      return;
    }

    const { week, token } = run.weekly;
    rememberUsername(name);
    status("Verifying and publishing your score…");
    operationState("publish");
    let refreshScores = false;
    try {
      const data = await request("/finish", { week, token, name, decisions: run.decisions });
      if (data?.week !== week || typeof data.score?.name !== "string" || cleanUsername(data.score.name) !== data.score.name) {
        throw new Error("invalid_weekly_response");
      }
      rememberReceipt(run.weekly, data.score.name);
      refreshScores = true;
      status(data.duplicate ? "This entry already has a published score." : "Your score is published.");
    } catch (error) {
      if (error.status === 409 || error.message === "week_closed") closedWeek();
      else if (error.message === "invalid_name") {
        nameInput.setAttribute("aria-invalid", "true");
        status("Choose a username with 1 to 24 visible characters.", true);
      } else if ([400, 404, 422].includes(error.status)) {
        status("The server could not verify this entry. Return to the weekly desk and check that all ten cycles are complete.", true);
      } else {
        status("Couldn’t publish your score. Check your connection and try again.", true);
      }
    } finally {
      operationState("");
      if (refreshScores && dialog.open) void refresh(true);
    }
  }

  function render(run) {
    el("leave").hidden = !run?.weekly;
    if (run?.weekly) {
      const badge = document.getElementById("run-kind");
      badge.textContent = "Weekly challenge";
      badge.dataset.kind = "weekly";
      badge.title = "This run uses the shared weekly market. Publishing its result is optional.";
    }
    if (dialog.open) paint();
  }

  function open(trigger = document.activeElement) {
    if (!config || dialog.open) return;
    opener = trigger;
    modalVisit++;
    consent.checked = false;
    dialog.showModal();
    el("title").focus();
    paint();
    void refresh();
  }

  function setup(callbacks) {
    config = callbacks;
    render(config.getRun());
  }

  el("button").addEventListener("click", event => open(event.currentTarget));
  el("leave").addEventListener("click", () => config?.leaveWeekly());
  el("retry").addEventListener("click", () => retryAction?.());
  el("start").addEventListener("click", start);
  el("share").addEventListener("submit", publish);
  nameInput.addEventListener("input", () => nameInput.removeAttribute("aria-invalid"));
  window.addEventListener("storage", event => {
    if (event.key === receiptKey || event.key === null) {
      receipt = readReceipt();
      if (dialog.open) paint();
    }
  });
  dialog.addEventListener("close", () => {
    clearTimeout(expiryTimer);
    (opener?.isConnected ? opener : el("button")).focus();
  });

  window.CargoWeekly = { setup, render, open };
})();
