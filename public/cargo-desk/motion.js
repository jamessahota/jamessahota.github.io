(function () {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const currencyWithCents = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  let ticket;
  let arrivalTimer;

  async function transition({ from, to, label, delta, time, news = [] }) {
    if (reducedMotion.matches || root.dataset.motion === "paused" || ticket) return;

    window.clearTimeout(arrivalTimer);
    root.classList.remove("cycle-arriving");
    root.classList.add("cycle-committing");
    ticket = document.createElement("div");
    ticket.className = "cycle-transition";
    ticket.setAttribute("aria-hidden", "true");
    ticket.innerHTML =
      '<div class="cycle-ticket">' +
        '<div class="cycle-ticket-header"><span>Orders committed</span><span class="cycle-ticket-time"></span></div>' +
        '<div class="cycle-ticket-route"><span class="cycle-ticket-from"></span>' +
          '<span class="cycle-ticket-track"></span><strong class="cycle-ticket-to"></strong></div>' +
        '<ul class="cycle-ticket-news"></ul>' +
        '<div class="cycle-ticket-result"><span class="cycle-ticket-label"></span>' +
          '<div class="cycle-ticket-amount"><span>P&amp;L change</span><strong></strong></div></div>' +
      '</div>';

    ticket.querySelector(".cycle-ticket-from").textContent = from;
    ticket.querySelector(".cycle-ticket-to").textContent = to;
    ticket.querySelector(".cycle-ticket-label").textContent = label;
    const timeLabel = ticket.querySelector(".cycle-ticket-time");
    timeLabel.textContent = time || "";
    timeLabel.hidden = !time;
    const amount = ticket.querySelector(".cycle-ticket-amount strong");
    if (Number.isFinite(delta)) {
      const formatter = delta % 100 === 0 ? currency : currencyWithCents;
      amount.textContent = (delta < 0 ? "−" : delta > 0 ? "+" : "") + formatter.format(Math.abs(delta) / 100);
      if (delta) amount.classList.add(delta > 0 ? "positive" : "negative");
    } else {
      amount.parentElement.hidden = true;
    }

    const list = ticket.querySelector(".cycle-ticket-news");
    list.hidden = news.length === 0;
    news.forEach((item, index) => {
      const line = document.createElement("li");
      line.textContent = item.text;
      if (item.shock) line.className = "is-shock";
      line.style.animationDelay = 320 + index * 380 + "ms";
      list.append(line);
    });

    document.body.append(ticket);
    // Long enough to read the news, when there is any.
    await new Promise((resolve) => window.setTimeout(resolve, 560 + news.length * 900));
  }

  function reveal() {
    if (!ticket) return;

    const departing = ticket;
    ticket = null;
    root.classList.remove("cycle-committing");
    if (reducedMotion.matches) {
      departing.remove();
      return;
    }

    departing.classList.add("cycle-transition-out");
    root.classList.add("cycle-arriving");
    window.setTimeout(() => departing.remove(), 240);
    arrivalTimer = window.setTimeout(() => root.classList.remove("cycle-arriving"), 760);
  }

  window.CargoMotion = { transition, reveal };
})();
