(function () {
  const storagePrefix = "cargo-desk-score-v6:";
  const usernameKey = "cargo-desk-score-name";
  const archiveRules = new Map([
    ["cargo-desk-score-v5:", "Rules version 5"],
    ["cargo-desk-score-v4:", "Rules version 4"],
    ["cargo-desk-score-v3:", "Rules version 3"],
    ["cargo-desk-campaign-v2:score:", "Rules version 2"],
  ]);
  const limit = 20;
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
  const wholeDollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const fractionalDollars = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  let fallbackId = 0;
  let currentUsername = "";

  function normalizedName(value) {
    if (typeof value !== "string" || value.length > 120 ||
        /[\p{C}\p{Default_Ignorable_Code_Point}\p{Z}]/u.test(value.replaceAll(" ", ""))) return "";
    const name = value.trim().normalize("NFC");
    return [...name].length <= 24 && /^(?:[\p{L}\p{N}\p{P}\p{S}]\p{M}*| )+$/u.test(name) ? name : "";
  }

  function getUsername() {
    try { return normalizedName(globalThis.localStorage.getItem(usernameKey)); } catch { return currentUsername; }
  }

  function setUsername(value) {
    currentUsername = normalizedName(value);
    try { globalThis.localStorage.setItem(usernameKey, currentUsername); } catch {}
    return currentUsername;
  }

  function newRunId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (globalThis.crypto?.getRandomValues) {
      const words = globalThis.crypto.getRandomValues(new Uint32Array(4));
      return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("");
    }
    return Date.now().toString(36) + "-" + (++fallbackId).toString(36) + "-" +
      Math.random().toString(36).slice(2);
  }

  function cleanRecord(score, defaultDate) {
    if (!score || typeof score !== "object") return null;
    const { id, seed, net, drawdown } = score;
    const completedAt = score.completedAt ?? defaultDate;
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(id) ||
        typeof seed !== "string" || !seed.trim() || seed.length > 160 ||
        !Number.isSafeInteger(net) || !Number.isSafeInteger(completedAt) ||
        completedAt < 0 || completedAt > 8640000000000000) return null;
    return {
      id,
      seed,
      net,
      completedAt,
      name: normalizedName(score.name),
      drawdown: Number.isSafeInteger(drawdown) && drawdown >= 0 ? drawdown : null,
    };
  }

  function compareScores(first, second) {
    return second.net - first.net || first.completedAt - second.completedAt ||
      first.id.localeCompare(second.id);
  }

  function dollars(cents) {
    const formatter = cents % 100 === 0 ? wholeDollars : fractionalDollars;
    return formatter.format(Math.abs(cents) / 100);
  }

  function scorePrefix(key) {
    if (typeof key !== "string") return null;
    if (key.startsWith(storagePrefix)) return storagePrefix;
    return Array.from(archiveRules.keys()).find(prefix => key.startsWith(prefix)) ?? null;
  }

  function create({ container, onReplay, storage } = {}) {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (storage === undefined) {
      try { storage = view?.localStorage; } catch { storage = null; }
    }
    let canPersist = !!storage;
    let lastRead = { ranked: [], archived: new Map() };
    const unsaved = new Map();

    function readSaved() {
      if (!storage) return lastRead;
      try {
        const scores = { ranked: [], archived: new Map() };
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          const prefix = scorePrefix(key);
          if (!prefix) continue;
          let saved;
          try { saved = JSON.parse(storage.getItem(key)); } catch { continue; }
          const score = cleanRecord(saved);
          if (!score || key !== prefix + score.id) continue;
          if (prefix === storagePrefix) {
            scores.ranked.push(score);
          } else {
            if (!scores.archived.has(prefix)) scores.archived.set(prefix, []);
            scores.archived.get(prefix).push(score);
          }
        }
        lastRead = scores;
      } catch {
        canPersist = false;
      }
      return lastRead;
    }

    function rankScores(saved) {
      const scores = new Map(saved.map((score) => [score.id, score]));
      unsaved.forEach((score, id) => {
        if (!scores.has(id)) scores.set(id, score);
      });
      return Array.from(scores.values()).sort(compareScores);
    }

    function element(tag, content, className) {
      const node = doc.createElement(tag);
      if (content !== undefined) node.textContent = content;
      if (className) node.className = className;
      return node;
    }

    function scoreTable(scores, rules) {
      const table = element("table", undefined, "cd-table");
      table.append(element("caption", rules ? rules + " scores, by final P&L" : "Best ranked runs, by final P&L", "visually-hidden"));
      const headings = element("tr");
      for (const label of ["Rank", rules ? "Run" : "Username", "Final P&L"]) {
        const header = element("th", label);
        header.scope = "col";
        if (label === "Final P&L") {
          header.className = "num";
          header.setAttribute("aria-sort", "descending");
        }
        headings.append(header);
      }
      if (!rules) {
        const practice = element("th");
        practice.scope = "col";
        practice.append(element("span", "Practise", "visually-hidden"));
        headings.append(practice);
      }
      const head = element("thead");
      head.append(headings);
      table.append(head);
      const body = element("tbody");
      scores.forEach((score, index) => {
        const row = element("tr");
        const rank = element("th", String(index + 1));
        rank.scope = "row";
        const run = element("td");
        const completion = new Date(score.completedAt);
        const completed = element("time", date.format(completion));
        completed.dateTime = completion.toISOString();
        const meta = element("small");
        meta.append(completed);
        if (score.drawdown !== null) meta.append(" · largest fall " + dollars(score.drawdown));
        run.append(score.name || (rules ? "Seed " + score.seed : "Unnamed trader"), meta);
        const amount = element("td", (score.net < 0 ? "−" : score.net > 0 ? "+" : "") + dollars(score.net),
          score.net < 0 ? "negative" : score.net > 0 ? "positive" : "");
        row.append(rank, run, amount);
        if (!rules) {
          const replayCell = element("td");
          const replay = element("button", "Practise", "cd-mini");
          replay.type = "button";
          replay.dataset.run = score.id;
          replay.setAttribute("aria-label", "Practise on seed " + score.seed + ", rank " + (index + 1));
          replay.addEventListener("click", () => onReplay?.(score.seed));
          replayCell.append(replay);
          row.append(replayCell);
        }
        body.append(row);
      });
      table.append(body);
      return table;
    }

    function paint(scores, archived) {
      const focused = doc.activeElement;
      const previousArchive = container.querySelector(".cd-board-archive");
      let focusAfterRender = null;
      const content = [];
      if (scores.length > 0) {
        const table = scoreTable(scores);
        if (focused?.dataset?.run && container.contains(focused)) {
          focusAfterRender = Array.from(table.querySelectorAll("button[data-run]"))
            .find((button) => button.dataset.run === focused.dataset.run);
        }
        content.push(table);
      } else {
        content.push(element("p", "Finish a ranked run to set your first score.", "cd-board-empty"));
      }
      content.push(element("p", canPersist ? "Your best 20 ranked runs are kept in this browser. Practising on a seed does not change them." :
        "Browser storage is unavailable. Scores are kept while this page stays open.", "cd-board-note"));
      if (archived.size > 0) {
        const archivedCount = Array.from(archived.values()).reduce((count, group) => count + group.length, 0);
        const disclosure = element("details", undefined, "cd-details cd-board-archive");
        const summary = element("summary", "Earlier leaderboard scores (" + archivedCount + ")");
        disclosure.open = previousArchive?.open ?? (scores.length === 0);
        disclosure.append(summary, element("p", "Each group uses the scoring and game rules from its own version.", "cd-board-note"));
        for (const [prefix, rules] of archiveRules) {
          const group = archived.get(prefix);
          if (!group) continue;
          disclosure.append(element("h3", rules, "label cd-board-note"), scoreTable(group.slice().sort(compareScores), rules));
        }
        if (focused === previousArchive?.firstElementChild) focusAfterRender = summary;
        content.push(disclosure);
      }
      container.replaceChildren(...content);
      focusAfterRender?.focus({ preventScroll: true });
    }

    function render() {
      const saved = readSaved();
      paint(rankScores(saved.ranked).slice(0, limit), saved.archived);
    }

    function record(input) {
      const score = cleanRecord(input, Date.now());
      if (!score) return null;
      const { ranked: saved, archived } = readSaved();
      const known = saved.find((item) => item.id === score.id) || unsaved.get(score.id);
      if (!known) {
        try {
          if (!storage) throw new Error("Storage unavailable");
          storage.setItem(storagePrefix + score.id, JSON.stringify(score));
          saved.push(score);
        } catch {
          canPersist = false;
          unsaved.set(score.id, score);
        }
      }

      const scores = rankScores(saved);
      const best = scores.slice(0, limit);
      for (const entry of scores.slice(limit)) {
        unsaved.delete(entry.id);
        try { storage?.removeItem(storagePrefix + entry.id); } catch { canPersist = false; }
      }
      paint(best, archived);
      const place = best.findIndex((entry) => entry.id === score.id);
      return place === -1 ? null : place + 1;
    }

    view?.addEventListener("storage", (event) => {
      if (event.key === null || scorePrefix(event.key)) render();
    });
    render();
    return { render, record };
  }

  const api = { create, newRunId, normalizedName, getUsername, setUsername };
  if (typeof module !== "undefined") module.exports = api;
  else window.CargoLeaderboard = api;
})();
