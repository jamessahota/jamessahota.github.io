(function () {
  "use strict";

  // The tape shown after a ticket is committed: the session's prices trade across
  // the panel, the news lands where it hit, and the profit or loss counts as it goes.
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const still = () => reducedMotion.matches || root.dataset.motion === "paused";
  const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const price = (cents) => (cents < 0 ? "−" : "") + "$" + (Math.abs(cents) / 100).toFixed(2);
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const points = 48;
  const jumpAt = .55;
  let panel;

  // A small repeatable source of wiggle. The tape between two real prices is drawn for
  // effect: only the prices at each end of a session come from the game.
  function wiggle(seed) {
    let value = seed >>> 0 || 1;
    return () => {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296 - .5;
    };
  }

  function sessionPath(from, to, news, random) {
    const out = [];
    let drift = 0;
    for (let index = 0; index <= points; index++) {
      const t = index / points;
      drift = drift * .8 + random() * 9;
      // Noise fades to nothing at both ends, so each session starts and ends on its true price.
      const noise = drift * Math.sin(Math.PI * t);
      // With news, the move happens at once when it lands. Without, it drifts across.
      const base = news ? (t < jumpAt ? from : to) : from + (to - from) * t;
      out.push(base + noise);
    }
    out[0] = from;
    out[points] = to;
    return out;
  }

  function build() {
    const element = document.createElement("div");
    element.className = "cycle-transition";
    element.setAttribute("aria-hidden", "true");
    element.innerHTML =
      '<div class="cycle-ticket">' +
        '<div class="cycle-ticket-header"><span>Orders committed</span><span class="cycle-ticket-time"></span></div>' +
        '<p class="cycle-ticket-title"></p>' +
        '<p class="cycle-ticket-label"></p>' +
        '<div class="cycle-ticket-tape"><canvas></canvas></div>' +
        '<div class="cycle-ticket-legend"><span class="is-spot">Spot <b></b></span><span class="is-front"><i></i> <b></b></span></div>' +
        '<ul class="cycle-ticket-news"></ul>' +
        '<div class="cycle-ticket-result"><span>P&amp;L change</span><strong></strong></div>' +
        '<p class="cycle-ticket-skip">Click or press a key to skip</p>' +
      '</div>';
    return element;
  }

  async function transition({ title, time, label, frontName, segments, delta }) {
    if (panel || !segments?.length) return;
    panel = build();
    const find = (selector) => panel.querySelector(selector);
    find(".cycle-ticket-title").textContent = title;
    find(".cycle-ticket-time").textContent = time || "";
    find(".cycle-ticket-label").textContent = label;
    find(".is-front i").textContent = frontName;
    const spotLabel = find(".is-spot b");
    const frontLabel = find(".is-front b");
    const amount = find(".cycle-ticket-result strong");
    const list = find(".cycle-ticket-news");
    const canvas = find("canvas");

    const random = wiggle(segments.reduce((total, segment) => total + segment.to.spot * 31 + segment.from.front, 7));
    const spot = [];
    const front = [];
    const newsItems = [];
    segments.forEach((segment, index) => {
      const hasNews = segment.news.length > 0;
      spot.push(...sessionPath(segment.from.spot, segment.to.spot, hasNews, random).slice(index ? 1 : 0));
      front.push(...sessionPath(segment.from.front, segment.to.front, hasNews, random).slice(index ? 1 : 0));
      segment.news.forEach(item => {
        const line = document.createElement("li");
        line.textContent = item.text;
        if (item.shock) line.className = "is-shock";
        line.hidden = true;
        list.append(line);
        newsItems.push({ line, at: (index + jumpAt) / segments.length });
      });
    });
    list.hidden = newsItems.length === 0;
    const last = spot.length - 1;
    const low = Math.min(...spot, ...front) - 12;
    const high = Math.max(...spot, ...front) + 12;

    document.body.append(panel);
    root.classList.add("cycle-committing");

    function draw(progress) {
      const box = canvas.getBoundingClientRect();
      if (!box.width) return;
      const scale = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(box.width * scale)) canvas.width = Math.round(box.width * scale);
      if (canvas.height !== Math.round(box.height * scale)) canvas.height = Math.round(box.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      const x = (index) => 4 + (box.width - 8) * index / last;
      const y = (value) => box.height - 16 - (value - low) / (high - low) * (box.height - 26);

      // Session dividers and their names along the foot of the tape.
      ctx.font = "500 10px ui-monospace, Menlo, Consolas, monospace";
      ctx.textBaseline = "alphabetic";
      segments.forEach((segment, index) => {
        const start = x(index * points);
        if (index) {
          ctx.strokeStyle = "#383e44";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(start) + .5, 0);
          ctx.lineTo(Math.round(start) + .5, box.height - 14);
          ctx.stroke();
        }
        ctx.fillStyle = "#a2a9b0";
        ctx.fillText(segment.label.toUpperCase(), start + (index ? 6 : 0), box.height - 2);
      });

      const upTo = progress * last;
      const whole = Math.min(last, Math.floor(upTo));
      const trace = (series, colour, width) => {
        ctx.beginPath();
        for (let index = 0; index <= whole; index++) {
          if (index) ctx.lineTo(x(index), y(series[index])); else ctx.moveTo(x(index), y(series[index]));
        }
        const head = whole >= last ? series[last] : series[whole] + (series[whole + 1] - series[whole]) * (upTo - whole);
        ctx.lineTo(x(upTo), y(head));
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.lineJoin = "round";
        ctx.stroke();
        return head;
      };
      const frontNow = trace(front, "#a2a9b0", 1.5);
      const spotNow = trace(spot, "#ff6a33", 2.5);
      ctx.fillStyle = "#ff6a33";
      ctx.fillRect(x(upTo) - 4, y(spotNow) - 4, 8, 8);
      spotLabel.textContent = price(Math.round(spotNow));
      frontLabel.textContent = price(Math.round(frontNow));

      for (const item of newsItems) if (progress >= item.at) item.line.hidden = false;
      // The profit or loss counts up with the tape and lands on the true figure.
      const value = progress >= 1 ? delta : Math.round(delta * progress / 100) * 100;
      amount.textContent = (value < 0 ? "−" : value > 0 ? "+" : "") + wholeDollars.format(Math.abs(value) / 100);
      amount.className = value > 0 ? "positive" : value < 0 ? "negative" : "";
    }

    const duration = still() ? 0 : 1500 * segments.length;
    const hold = newsItems.length ? 1300 : 700;
    await new Promise((resolve) => {
      let finished = false;
      let frame;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(frame);
        window.removeEventListener("keydown", skip, true);
        panel.removeEventListener("click", skip);
        draw(1);
        resolve();
      };
      // Skipping shows the finished tape for a moment, so the result is never missed.
      const skip = (event) => {
        if (event.type === "keydown" && ["Shift", "Control", "Alt", "Meta", "Tab"].includes(event.key)) return;
        cancelAnimationFrame(frame);
        draw(1);
        window.setTimeout(finish, 350);
      };
      window.addEventListener("keydown", skip, true);
      panel.addEventListener("click", skip);

      const start = performance.now();
      const tick = (now) => {
        const progress = duration ? clamp((now - start) / duration) : 1;
        draw(progress);
        if (progress < 1 && !finished) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      // A tab in the background gets no animation frames, so the clock ends it too.
      window.setTimeout(finish, duration + hold);
    });
  }

  function reveal() {
    if (!panel) return;
    const departing = panel;
    panel = null;
    root.classList.remove("cycle-committing");
    if (still()) {
      departing.remove();
      return;
    }
    departing.classList.add("cycle-transition-out");
    window.setTimeout(() => departing.remove(), 240);
  }

  window.CargoMotion = { transition, reveal };
})();
