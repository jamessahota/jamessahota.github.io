(function () {
  "use strict";

  // The share card: a finished run as a picture and as a few lines of text.
  // Everything is made in the browser. Nothing is sent anywhere unless the player
  // copies, saves or shares it themselves.
  const link = "jsahota.com/projects/cargo-desk";
  const gameUrl = "https://" + link + "/";
  const wholeDollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const dollars = (cents) => wholeDollars.format(Math.abs(cents) / 100);
  const signed = (cents) => (cents < 0 ? "−" : cents > 0 ? "+" : "") + dollars(cents);
  const colours = { panel: "#101214", ink: "#eef0f1", muted: "#a2a9b0", line: "#2c3136", accent: "#ff6a33", up: "#63d49b", down: "#ff8f85" };
  const width = 1200;
  const height = 630;
  let dialog;
  let parts;
  let shown;

  function marketLink({ seed, scenario }) {
    const url = new URL(gameUrl);
    if (scenario) url.searchParams.set("scenario", scenario);
    else if (seed) url.searchParams.set("seed", seed);
    return url.href;
  }

  function readMarketLink(search) {
    const params = new URLSearchParams(search);
    const seeds = params.getAll("seed");
    const scenarios = params.getAll("scenario");
    if (scenarios.length === 1 && !seeds.length && scenarios[0]) return { scenario: scenarios[0] };
    if (seeds.length === 1 && !scenarios.length) {
      const seed = seeds[0];
      if (seed.trim() && seed.length <= 64 && !/[\r\n]/.test(seed)) return { seed };
    }
    return null;
  }

  function lines(result, includeLink = true) {
    const squares = result.days.map(value => value > 0 ? "🟩" : value < 0 ? "🟥" : "⬜").join("");
    const out = ["Cargo Desk · " + result.kind, signed(result.net) + (result.grade ? " · Grade " + result.grade : ""),
      "Largest fall (drawdown) " + dollars(result.drawdown), squares];
    if (result.benchmark !== null) {
      const edge = result.net - result.benchmark;
      out.push(edge ? (edge > 0 ? "Beat" : "Behind") + " hold-and-hedge by " + dollars(edge) : "Level with hold-and-hedge");
    }
    if (result.seed) out.push("Seed " + result.seed);
    if (includeLink) out.push("Play this market: " + marketLink(result));
    return out.join("\n");
  }

  function fonts() {
    const style = getComputedStyle(document.documentElement);
    return {
      display: style.getPropertyValue("--display").trim() || "Impact, 'Arial Narrow', sans-serif",
      mono: style.getPropertyValue("--mono").trim() || "ui-monospace, Menlo, Consolas, monospace",
      sans: style.getPropertyValue("--sans").trim() || "system-ui, sans-serif",
    };
  }

  function draw(canvas, result) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = fonts();
    const tone = (value) => value > 0 ? colours.up : value < 0 ? colours.down : colours.muted;
    const spaced = (text, x, y, gap) => {
      // Letter-spaced capitals, drawn one letter at a time so every browser agrees.
      let at = x;
      for (const letter of text.toUpperCase()) {
        ctx.fillText(letter, at, y);
        at += ctx.measureText(letter).width + gap;
      }
      return at;
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = colours.panel;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";

    // Heading: the game on the left, the kind of run on the right.
    ctx.fillStyle = colours.accent;
    ctx.fillRect(64, 62, 14, 14);
    ctx.font = "500 22px " + font.mono;
    ctx.fillStyle = colours.ink;
    spaced("Cargo Desk", 92, 77, 2.5);
    ctx.fillStyle = colours.muted;
    // The kind of run can be long, so it is set smaller until it fits beside the name.
    let kind = result.kind;
    let kindSize = 22;
    const kindWidth = () => [...kind.toUpperCase()].reduce((total, letter) => total + ctx.measureText(letter).width + 2, 0);
    do { ctx.font = "500 " + kindSize + "px " + font.mono; kindSize -= 1; } while (kindWidth() > 820 && kindSize > 13);
    while (kind.length > 4 && kindWidth() > 820) kind = kind.slice(0, -2).trimEnd() + "…";
    spaced(kind, width - 64 - kindWidth(), 77, 2);
    ctx.fillStyle = colours.line;
    ctx.fillRect(64, 104, width - 128, 1);

    // The result.
    const amount = signed(result.net);
    let size = 190;
    do { ctx.font = size + "px " + font.display; size -= 6; } while (ctx.measureText(amount).width > 560 && size > 80);
    ctx.fillStyle = result.net < 0 ? colours.down : colours.ink;
    ctx.fillText(amount, 60, 318);
    ctx.font = "500 20px " + font.mono;
    ctx.fillStyle = colours.muted;
    spaced("Profit and loss over ten trading days", 64, 148, 2);

    ctx.font = "400 28px " + font.sans;
    let y = 372;
    const fact = (label, value, colour) => {
      ctx.fillStyle = colours.muted;
      ctx.fillText(label, 64, y);
      ctx.fillStyle = colour || colours.ink;
      ctx.fillText(value, 64 + ctx.measureText(label + " ").width, y);
      y += 40;
    };
    if (result.grade) fact("Return on risk:", "grade " + result.grade);
    fact("Largest fall:", dollars(result.drawdown));
    if (result.benchmark !== null) {
      const edge = result.net - result.benchmark;
      fact("Against hold-and-hedge:", signed(edge), tone(edge));
    }

    // The run's profit and loss after each ticket.
    const box = { x: 690, y: 150, w: 446, h: 250 };
    const low = Math.min(0, ...result.path);
    const high = Math.max(0, ...result.path);
    const span = high - low || 1;
    const px = (index) => box.x + box.w * index / Math.max(1, result.path.length - 1);
    const py = (value) => box.y + box.h - (value - low) / span * box.h;
    ctx.strokeStyle = colours.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x - 16.5, box.y - 16.5, box.w + 33, box.h + 33);
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = colours.muted;
    ctx.beginPath();
    ctx.moveTo(box.x, Math.round(py(0)) + .5);
    ctx.lineTo(box.x + box.w, Math.round(py(0)) + .5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    result.path.forEach((value, index) => { if (index) ctx.lineTo(px(index), py(value)); else ctx.moveTo(px(index), py(value)); });
    ctx.strokeStyle = colours.accent;
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = colours.accent;
    ctx.fillRect(px(result.path.length - 1) - 6, py(result.net) - 6, 12, 12);

    // One square a day.
    const side = 40;
    const gap = 10;
    const top = 508;
    ctx.font = "500 16px " + font.mono;
    result.days.forEach((value, index) => {
      const x = 64 + index * (side + gap);
      if (value) {
        ctx.fillStyle = tone(value);
        ctx.fillRect(x, top, side, side);
      } else {
        ctx.strokeStyle = colours.muted;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + .75, top + .75, side - 1.5, side - 1.5);
      }
      ctx.fillStyle = colours.muted;
      ctx.fillText(String(index + 1), x + (side - ctx.measureText(String(index + 1)).width) / 2, top + side + 24);
    });
    ctx.fillStyle = colours.muted;
    spaced("Day by day", 64, top - 16, 2);

    ctx.font = "500 22px " + font.mono;
    ctx.fillStyle = colours.ink;
    ctx.textAlign = "right";
    const replayAddress = result.scenario ? link + "/?scenario=" + result.scenario : link;
    ctx.fillText(replayAddress, width - 64, top + side, width - 650);
    ctx.textAlign = "left";
    if (result.seed) {
      ctx.fillStyle = colours.muted;
      // A separate footer row keeps even the longest seed away from the day-by-day tiles.
      ctx.fillText("Seed " + result.seed, 64, 610, width - 128);
    }
  }

  function build() {
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    dialog = make("dialog", "cd-dialog cd-share");
    dialog.id = "share-dialog";
    dialog.setAttribute("aria-labelledby", "share-title");
    const closer = make("form");
    closer.method = "dialog";
    const close = make("button", "cd-dialog__close", "×");
    close.setAttribute("aria-label", "Close");
    closer.append(close);
    const title = make("h2", "", "Share this result");
    title.id = "share-title";
    const canvas = make("canvas", "cd-share__card");
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("role", "img");
    const text = make("pre", "cd-share__text numeric");
    const actions = make("div", "cd-share__actions");
    const copy = make("button", "btn", "Copy as text");
    const save = make("button", "btn btn--secondary", "Save the image");
    const send = make("button", "btn btn--secondary", "Share…");
    for (const button of [copy, save, send]) button.type = "button";
    actions.append(copy, save, send);
    const status = make("p", "cd-share__status");
    status.setAttribute("role", "status");
    const play = make("a", "btn btn--secondary cd-dialog__wide", "Play this market");
    dialog.append(closer, make("p", "label label--marked", "Share"), title, canvas, text, actions, play, status,
      make("p", "cd-share__note", "The card is made in your browser. Nothing is posted for you."));
    document.body.append(dialog);
    parts = { canvas, text, send, play, status };

    const file = () => new Promise(resolve => canvas.toBlob(blob => resolve(blob && new File([blob], "cargo-desk-result.png", { type: "image/png" })), "image/png"));
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(lines(shown));
        status.textContent = "Copied.";
      } catch {
        // Without clipboard access, select the text so it can be copied by hand.
        const range = document.createRange();
        range.selectNodeContents(text);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = "Select and copy the text above.";
      }
    });
    save.addEventListener("click", async () => {
      const image = await file();
      if (!image) { status.textContent = "This browser could not make the image."; return; }
      const url = URL.createObjectURL(image);
      const anchor = make("a");
      anchor.href = url;
      anchor.download = image.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Image saved.";
    });
    send.addEventListener("click", async () => {
      try {
        const result = shown;
        const image = await file();
        const data = { text: lines(result, false), url: marketLink(result) };
        if (image && navigator.canShare?.({ files: [image] })) data.files = [image];
        await navigator.share(data);
      } catch (error) {
        if (error?.name !== "AbortError") status.textContent = "Sharing is not available here. Copy the text or save the image.";
      }
    });
  }

  // result: { kind, net, grade, drawdown, benchmark, seed, scenario, days: [ten daily changes], path: [P&L after each ticket] }
  async function open(result) {
    if (!dialog) build();
    shown = result;
    parts.text.textContent = lines(result);
    parts.play.href = marketLink(result);
    parts.status.textContent = "";
    parts.send.hidden = typeof navigator.share !== "function";
    parts.canvas.setAttribute("aria-label", "Result card. " + lines(result).split("\n").slice(0, 2).join(". ") + ".");
    draw(parts.canvas, result);
    if (!dialog.open) dialog.showModal();
    // Draw again once the site's fonts are certain to be loaded.
    try {
      const font = fonts();
      await Promise.all([document.fonts.load("190px " + font.display), document.fonts.load("500 22px " + font.mono), document.fonts.load("28px " + font.sans)]);
      if (shown === result) draw(parts.canvas, result);
    } catch {}
  }

  window.CargoShare = { open, lines, marketLink, readMarketLink };
})();
