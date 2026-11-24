(function () {
  const storagePrefix = "cargo-desk-score-v3:";
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

  function create({ container, onReplay, storage } = {}) {
    const doc = container.ownerDocument;
    const view = doc.defaultView;
    if (storage === undefined) {
      try { storage = view?.localStorage; } catch { storage = null; }
    }
    let canPersist = !!storage;
    let lastRead = [];
    const unsaved = new Map();

    function readSaved() {
      if (!storage) return [];
      try {
        const scores = [];
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(storagePrefix)) continue;
          let saved;
          try { saved = JSON.parse(storage.getItem(key)); } catch { continue; }
          const score = cleanRecord(saved);
          if (score && key === storagePrefix + score.id) scores.push(score);
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

    function render(scores = rankScores(readSaved()).slice(0, limit)) {
      const focused = doc.activeElement;
      let focusAfterRender = null;
      const content = [];
      if (scores.length > 0) {
        const table = element("table", undefined, "cd-table");
        table.append(element("caption", "Best ranked runs, by final P&L", "visually-hidden"));
        const headings = element("tr");
        for (const label of ["Rank", "Run", "Final P&L", "Practise"]) {
          const header = element("th", label);
          header.scope = "col";
          if (label === "Practise") header.firstChild.replaceWith(element("span", label, "visually-hidden"));
          if (label === "Final P&L") header.className = "num";
          if (label === "Final P&L") header.setAttribute("aria-sort", "descending");
          headings.append(header);
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
          run.append("Seed " + score.seed, meta);
          const amount = element("td", (score.net < 0 ? "−" : score.net > 0 ? "+" : "") + dollars(score.net),
            score.net < 0 ? "negative" : score.net > 0 ? "positive" : "");
          const replayCell = element("td");
          const replay = element("button", "Practise", "cd-mini");
          replay.type = "button";
          replay.dataset.run = score.id;
          replay.setAttribute("aria-label", "Practise on seed " + score.seed + ", rank " + (index + 1));
          replay.addEventListener("click", () => onReplay?.(score.seed));
          if (focused?.dataset?.run === score.id && container.contains(focused)) focusAfterRender = replay;
          replayCell.append(replay);
          row.append(rank, run, amount, replayCell);
          body.append(row);
        });
        table.append(body);
        content.push(table);
      } else {
        content.push(element("p", "Finish a ranked run to set your first score.", "cd-board-empty"));
      }
      content.push(element("p", canPersist ? "Your best 20 ranked runs are kept in this browser. Practising on a seed does not change them." :
        "Browser storage is unavailable. Scores are kept while this page stays open.", "cd-board-note"));
      container.replaceChildren(...content);
      focusAfterRender?.focus({ preventScroll: true });
    }

    function record(input) {
      const score = cleanRecord(input, Date.now());
      if (!score) return null;
      const saved = readSaved();
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
      render(best);
      const place = best.findIndex((entry) => entry.id === score.id);
      return place === -1 ? null : place + 1;
    }

    view?.addEventListener("storage", (event) => {
      if (event.key === null || event.key.startsWith(storagePrefix)) render();
    });
    render();
    return { render, record };
  }

  const api = { create, newRunId };
  if (typeof module !== "undefined") module.exports = api;
  else window.CargoLeaderboard = api;
})();
