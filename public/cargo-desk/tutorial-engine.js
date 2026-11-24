(function (game) {
  "use strict";

  const seed = "cushing-tutorial-492";
  const deliveryCycle = 3;
  const purchaseSizes = Object.freeze([game.lot, 2 * game.lot]);
  const replay = (decisions) => game.replay(seed, decisions, { withReview: false });

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
      barrels: 0,
      buyQuote: openingQuote(market),
      forwardOptions: [],
      contract: null,
      breakdown: null,
    };
  }

  const error = (message) => ({ ok: false, error: message });
  const lotCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= game.maxFuturesLots;
  const orderIssue = (estimate) => Object.values(estimate.errors)[0] || "This ticket could not be accepted.";

  function buyQuote(state, choice) {
    if (state?.step !== "buy") return error("Finish the opening ticket first.");
    const { barrels, shortLots } = choice ?? {};
    const details = state.buyQuote;
    if (!purchaseSizes.includes(barrels)) return { ...details, ...error("Choose 1,000 or 2,000 barrels.") };
    const expectedLots = barrels / game.lot;
    const order = { ...baseOrder(state.market), side: "buy", barrels };
    order.futuresTrades[0] = lotCount(shortLots) ? -shortLots : 0;
    const estimate = game.preview(state.market, order);
    const full = { ...details, barrels, expectedLots, shortLots, order, estimate, netLots: estimate.netLots };
    if (shortLots !== expectedLots) {
      return { ...full, ...error("Sell " + expectedLots + " " + details.monthName + " " + (expectedLots === 1 ? "lot" : "lots") + " to hedge the new barrels.") };
    }
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
      const order = deliveryDraft(market, barrels, route, reference.month, barrels / game.lot);
      const result = game.preview(market, order);
      const contract = result.delivery;
      return result.ok ? [{ ...contract, futuresPrice: reference.price, netPrice: contract.fixedGross - contract.tariff }] : [];
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
    const { route, month, closeLots } = choice ?? {};
    const options = state.forwardOptions;
    const selected = options.find((offer) => offer.route === route && offer.month === month);
    if (!selected) return { options, ...error("Choose a route and an available WTI month.") };
    const expectedLots = state.barrels / game.lot;
    const order = deliveryDraft(state.market, state.barrels, route, month, lotCount(closeLots) ? closeLots : 0);
    const estimate = game.preview(state.market, order);
    const contract = { ...selected, ...estimate.delivery };
    const full = { ...contract, contract, options, expectedLots, closeLots, order, estimate, netLots: estimate.netLots };
    if (closeLots !== expectedLots) {
      return { ...full, ...error("Buy back the " + expectedLots + " " + state.buyQuote.monthName + " " + (expectedLots === 1 ? "lot" : "lots") + " you added. The fixed sale now sets the parcel’s price.") };
    }
    return { ...full, ...(estimate.ok ? { ok: true } : error(orderIssue(estimate))) };
  }

  function forward(state, choice) {
    const offer = forwardQuote(state, choice);
    if (!offer.ok) return { ...offer, state };
    const market = advance(state.market, offer.order);
    if (market?.stage !== 2 || market.phase !== "am") return { ...error("The tutorial’s delivery-day ticket is unavailable."), state };
    return { ok: true, state: {
      ...state, step: "settle", market, contract: offer.contract,
      hedgeClosePrice: state.market.market.prices[1],
    } };
  }

  function explain(state, market) {
    const parts = { trading: 0, price: 0, basis: 0, spreads: 0, clients: 0, costs: 0 };
    for (const ticket of market.history) {
      for (const category of Object.keys(parts)) parts[category] += ticket.parts[category];
    }
    const fees = (label) => -market.entries.filter((entry) => entry.label === label).reduce((total, entry) => total + entry.cents, 0);
    const { contract, buyQuote } = state;
    const priceMargin = contract.barrels * (contract.fixedGross - buyQuote.price);
    const hedgePnl = contract.barrels * (buyQuote.hedgePrice - state.hedgeClosePrice);
    return {
      ...parts,
      total: market.net - state.opening,
      opening: state.opening,
      closing: market.net,
      clientFees: fees("Client sent elsewhere"),
      tankFees: fees("Tank A lease"),
      tariffCost: contract.tariffCost,
      parcel: { priceMargin, hedgePnl, tariffCost: contract.tariffCost,
        netBeforeSharedCosts: priceMargin + hedgePnl - contract.tariffCost },
    };
  }

  function settle(state) {
    if (state?.step !== "settle") return { ...error("Book a delivery and close its hedge before settling."), state };
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
