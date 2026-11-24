(function (game) {
  "use strict";

  const seed = "cushing-tutorial-492";
  const deliveryCycle = 3;
  const replay = (decisions) => game.replay(seed, decisions, { withReview: false });
  const openingMarket = replay([]);
  const purchaseLimit = Math.min(4 * game.lot, openingMarket.round.orderBook.buy.max, game.capacity - openingMarket.occupancy);
  const purchaseSizes = Object.freeze(Array.from({ length: Math.floor(purchaseLimit / game.lot) }, (_, index) => (index + 1) * game.lot));

  function baseOrder(market) {
    return {
      side: "hold",
      barrels: 0,
      storage: 0,
      storageCycles: 0,
      client: market.round.orderBook.client ? "redirect" : "none",
      futuresTrades: [0, 0, 0, 0],
    };
  }

  function openingQuote(market) {
    return {
      price: market.round.orderBook.buy.price,
      hedgePrice: market.market.prices[1],
      monthName: market.months[0],
      tankLease: market.round.orderBook.tankLease,
      clientFee: market.round.orderBook.client?.redirect.fee ?? 0,
    };
  }

  function init() {
    const market = replay([]);
    return {
      step: "buy",
      market,
      opening: market.net,
      openingFuturesPnl: market.components.hedge,
      barrels: 0,
      buyQuote: openingQuote(market),
      forwardOptions: [],
      contract: null,
      breakdown: null,
    };
  }

  const error = (message) => ({ ok: false, error: message });
  const validLots = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 2 * game.maxFuturesLots;
  const orderIssue = (estimate) => Object.values(estimate.errors)[0] || "This ticket could not be accepted.";
  const number = (value) => value.toLocaleString("en-US");

  function neutralTrade(market, order) {
    const hedge = game.hedgeOrder(market, { ...order, futuresTrades: [0, 0, 0, 0] });
    return hedge.trades?.[0] ?? null;
  }

  function buyQuote(state, choice) {
    if (state?.step !== "buy") return error("Finish the opening ticket first.");
    const { barrels, shortLots } = choice ?? {};
    const details = state.buyQuote;
    if (!purchaseSizes.includes(barrels)) return { ...details, ...error("Choose a purchase size in " + number(game.lot) + "-barrel increments, up to " + number(purchaseSizes.at(-1)) + " barrels.") };
    const order = { ...baseOrder(state.market), side: "buy", barrels };
    order.futuresTrades[0] = validLots(shortLots) && shortLots >= 0 ? -shortLots : null;
    const estimate = game.preview(state.market, order);
    const neutral = neutralTrade(state.market, order);
    const suggestedLots = neutral === null ? null : Math.abs(neutral);
    const full = { ...details, barrels, suggestedLots, shortLots, order, estimate, netLots: estimate.netLots };
    return { ...full, ...(estimate.ok ? { ok: true } : error(orderIssue(estimate))) };
  }

  function advance(market, order) {
    const next = replay([...market.decisions, order]);
    return next.decisions.length === market.decisions.length + 1 ? next : null;
  }

  function deliveryDraft(market, barrels, route, month, closeLots) {
    const order = baseOrder(market);
    order.futuresTrades[0] = closeLots;
    order.delivery = { cycle: deliveryCycle, barrels, route, month };
    return order;
  }

  function forwardOptions(market, barrels) {
    return ["local", "gulf"].flatMap((route) => market.deliveryOptions.months.flatMap((reference) => {
      const order = deliveryDraft(market, barrels, route, reference.month, 0);
      const { delivery: contract } = game.preview(market, order);
      return contract ? [{ ...contract, futuresPrice: reference.price, netPrice: contract.fixedGross - contract.tariff }] : [];
    }));
  }

  function buy(state, choice) {
    const offer = buyQuote(state, choice);
    if (!offer.ok) return { ...offer, state };
    const market = advance(state.market, offer.order);
    if (market?.stage !== 1 || market.phase !== "am") return { ...error("The tutorial’s second morning ticket is unavailable."), state };
    return { ok: true, state: {
      ...state, step: "forward", market, barrels: offer.barrels,
      buyQuote: offer, forwardOptions: forwardOptions(market, offer.barrels),
    } };
  }

  function forwardQuote(state, choice) {
    if (state?.step !== "forward") return error("Buy and hedge the opening parcel before booking delivery.");
    const { route, month, barrels = state.barrels, closeLots } = choice ?? {};
    if (!purchaseSizes.includes(barrels) || barrels > state.barrels) {
      return { options: state.forwardOptions, ...error("Choose a delivery size in " + number(game.lot) + "-barrel increments, up to the " + number(state.barrels) + " barrels you bought.") };
    }
    const options = barrels === state.barrels ? state.forwardOptions : forwardOptions(state.market, barrels);
    const selected = options.find((offer) => offer.route === route && offer.month === month);
    if (!selected) return { options, ...error("Choose a route and an available WTI month.") };
    const order = deliveryDraft(state.market, barrels, route, month, validLots(closeLots) ? closeLots : null);
    const estimate = game.preview(state.market, order);
    const contract = { ...selected, ...estimate.delivery };
    const suggestedLots = neutralTrade(state.market, order);
    const full = { ...contract, contract, options, suggestedLots, closeLots, order, estimate, netLots: estimate.netLots };
    return { ...full, ...(estimate.ok ? { ok: true } : error(orderIssue(estimate))) };
  }

  function forward(state, choice) {
    const offer = forwardQuote(state, choice);
    if (!offer.ok) return { ...offer, state };
    const market = advance(state.market, offer.order);
    if (market?.stage !== 2 || market.phase !== "am") return { ...error("The tutorial’s delivery-day ticket is unavailable."), state };
    return { ok: true, state: { ...state, step: "settle", market, contract: offer.contract } };
  }

  function explain(state, market) {
    const parts = { trading: 0, price: 0, basis: 0, spreads: 0, clients: 0, costs: 0 };
    for (const ticket of market.history) {
      for (const category of Object.keys(parts)) parts[category] += ticket.parts[category];
    }
    const fees = (label) => -market.entries.filter((entry) => entry.label === label).reduce((total, entry) => total + entry.cents, 0);
    const { barrels, fixedGross, tariffCost } = state.contract;
    const buyPrice = state.buyQuote.price;
    const priceMargin = barrels * (fixedGross - buyPrice);
    return {
      ...parts,
      total: market.net - state.opening,
      opening: state.opening,
      closing: market.net,
      clientFees: fees("Client sent elsewhere"),
      tankFees: fees("Tank A lease"),
      tariffCost,
      futuresPnl: market.components.hedge - state.openingFuturesPnl,
      endingNetLots: market.netLots,
      endingCrudeBarrels: market.barrels,
      endingFuturesPositions: market.futuresPositions.slice(),
      drawdown: market.maxDrawdown,
      parcel: { barrels, buyPrice, fixedGross, priceMargin, tariffCost, marginAfterTariff: priceMargin - tariffCost },
    };
  }

  function settle(state) {
    if (state?.step !== "settle") return { ...error("Commit the delivery ticket before settling."), state };
    let market = state.market;
    while (market.round && market.stage < deliveryCycle) {
      const next = advance(market, baseOrder(market));
      if (!next) return { ...error("The delivery-day ticket could not be settled."), state };
      market = next;
    }
    if (!market.deliveryHistory.some((contract) => contract.settledCycle === deliveryCycle)) {
      return { ...error("The booked parcel did not settle."), state };
    }
    return { ok: true, state: { ...state, step: "complete", market, breakdown: explain(state, market) } };
  }

  const tutorial = { init, buyQuote, buy, forwardQuote, forward, settle, purchaseSizes, deliveryCycle, seed };
  if (typeof module !== "undefined" && module.exports) module.exports = tutorial;
  else window.CargoTutorial = tutorial;
})(typeof module !== "undefined" && module.exports ? require("./engine.js") : window.CargoDesk);
