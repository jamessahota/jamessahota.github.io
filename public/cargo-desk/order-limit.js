(function () {
  "use strict";

  const sum = positions => positions.reduce((total, position) => total + position, 0);
  const gross = positions => positions.reduce((total, position) => total + Math.abs(position), 0);

  function closeOpposing(positions, change) {
    const direction = Math.sign(change);
    let remaining = Math.abs(change);
    for (let slot = 0; slot < positions.length && remaining; slot++) {
      const closed = Math.min(remaining, Math.max(0, -direction * positions[slot]));
      positions[slot] += direction * closed;
      remaining -= closed;
    }
    return direction * remaining;
  }

  function moveToNet(positions, startingNet, targetNet, room) {
    const change = targetNet - startingNet;
    const startingGross = gross(positions);
    const next = positions.slice();
    // Prefer changing one month. Check the nearest month first, then months
    // where the adjustment may close an existing position and free gross room.
    const slot = positions.findIndex(position => startingGross - Math.abs(position) + Math.abs(position + change) <= room);
    if (slot !== -1) {
      next[slot] += change;
      return next;
    }

    // A fixed net change takes at least this many lots. Closing opposing lots
    // first gives the smallest gross for that change. If it still exceeds room,
    // close matched long and short lots, two for each pair.
    const remaining = closeOpposing(next, change);
    next[0] += remaining;
    const pairs = Math.max(0, Math.ceil((gross(next) - room) / 2));
    closeOpposing(next, pairs);
    closeOpposing(next, -pairs);
    return next;
  }

  function fitPhysicalOrder(game, state, draft, result = game.preview(state, draft)) {
    const limit = state?.netLimitLots;
    if (!state?.round || !draft || !Number.isSafeInteger(limit) || limit <= 0) return null;
    const { errors, futuresPositions, netLots, netLotsAfterExpiry } = result;
    if ((draft.side === "hold" && !result.delivery) || errors.side || errors.barrels || errors.haggle || errors.delivery ||
        (Math.abs(netLots) <= limit && (netLotsAfterExpiry === null || Math.abs(netLotsAfterExpiry) <= limit))) return null;
    if (!Array.isArray(draft.futuresTrades) || draft.futuresTrades.length !== futuresPositions.length ||
        ![...draft.futuresTrades].every(trade => Number.isSafeInteger(trade) && Math.abs(trade) <= 2 * game.maxFuturesLots)) return null;

    // The far month, when estimated, can be carried but cannot be traded.
    const listed = futuresPositions.length;
    if (state.market.estimated && draft.futuresTrades[listed - 1]) return null;
    const fixed = state.market.estimated ? futuresPositions[listed - 1] : 0;
    const room = game.maxFuturesLots - Math.abs(fixed);
    const expiry = netLotsAfterExpiry !== null;
    const start = expiry ? 1 : 0;
    const end = state.market.estimated ? listed - 1 : listed;
    const positions = futuresPositions.slice(start, end);
    if (!positions.length || room < 0) return null;
    const startingNet = sum(positions);
    const crudeAndFixed = result.availableBarrels / game.lot + fixed;
    const minNet = Math.ceil(-limit - crudeAndFixed);
    const maxNet = Math.floor(limit - crudeAndFixed);

    let best = null;
    let fewestLots = Infinity;
    let fewestExpiryLots = Infinity;
    const draftExpiring = expiry ? futuresPositions[0] : 0;
    // Only the expiring position needs an independent search: each possible
    // value gives a range of sums that fits both before and after the close.
    for (let expiring = expiry ? -room : 0; expiring <= (expiry ? room : 0); expiring++) {
      const rest = room - Math.abs(expiring);
      const low = Math.max(-rest, minNet, minNet - expiring);
      const high = Math.min(rest, maxNet, maxNet - expiring);
      if (low > high) continue;
      const nearest = Math.max(low, Math.min(high, startingNet));
      // One extra adjacent sum checks the other parity. A tighter gross
      // allowance can make that sum cheaper by one lot when closing a pair.
      for (const target of [nearest, nearest - 1, nearest + 1]) {
        if (target < low || target > high) continue;
        const next = moveToNet(positions, startingNet, target, rest);
        const expiryLots = Math.abs(expiring - draftExpiring);
        const moved = next.reduce((count, position, index) => count + Math.abs(position - positions[index]), expiryLots);
        if (moved > fewestLots || (moved === fewestLots && expiryLots >= fewestExpiryLots)) continue;
        best = [...(expiry ? [expiring] : []), ...next, ...futuresPositions.slice(end)];
        fewestLots = moved;
        fewestExpiryLots = expiryLots;
      }
    }
    if (!best || fewestLots === 0) return null;

    const trades = best.map((position, slot) => position - state.futuresPositions[slot]);
    const checked = game.preview(state, { ...draft, futuresTrades: trades });
    if (checked.errors.futuresTrades || checked.errors.exposure || checked.errors.expiry) return null;
    return { trades, netLots: checked.netLots, netLotsAfterExpiry: checked.netLotsAfterExpiry };
  }

  const api = { fitPhysicalOrder };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else window.CargoOrderLimit = api;
})();
