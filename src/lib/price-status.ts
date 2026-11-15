export interface PriceObservation {
  label: string;
  unit: string;
  source: string;
  sourceUrl: string;
  cadence: 'daily' | 'weekly';
  maxAgeDays: number;
  value: number | null;
  date: string | null;
  checkedAt?: string;
  lastAttemptAt?: string;
  refreshStatus?: 'ok' | 'failed';
}

export type AvailableObservation = PriceObservation & { value: number; date: string };
export interface ChartView {
  due: string;
  range: { unit: string };
  outcome?: { value: number; date: string; source: string; sourceUrl?: string };
  track?: string;
  referenceTrack?: string;
}

const day = (now: Date) => now.toISOString().slice(0, 10);
const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && day(parsed) === value;
};

/** Freshness is based on the market observation date, never on the date it was fetched. */
export function observationState(price: PriceObservation, now = new Date()) {
  const available = Number.isFinite(price.value) && price.value !== null && validDay(price.date) && price.date <= day(now);
  const age = available ? (Date.parse(`${day(now)}T00:00:00Z`) - Date.parse(`${price.date}T00:00:00Z`)) / 86_400_000 : Infinity;
  return { available, stale: available && age > price.maxAgeDays, failed: price.refreshStatus === 'failed' };
}

export function pendingState(view: { due: string }, now = new Date()) {
  return view.due < day(now) ? 'outcome' : 'open';
}

/** Strict benchmark lookup for assessment logic; related references are never substituted. */
export function trackedObservation(
  view: { due: string; outcome?: unknown; track?: string; referenceTrack?: string },
  prices: Record<string, PriceObservation>,
  now = new Date(),
): AvailableObservation | undefined {
  if (view.outcome || !view.track || pendingState(view, now) !== 'open') return undefined;
  const latest = prices[view.track];
  return latest && observationState(latest, now).available ? latest as AvailableObservation : undefined;
}

/** Displayed points may be related references, while their identity remains explicit. */
export function chartObservation(view: ChartView, prices: Record<string, PriceObservation>, now = new Date()) {
  if (view.outcome) return { ...view.outcome, kind: 'outcome' as const };
  const key = view.track ?? view.referenceTrack;
  if (!key) return undefined;
  const price = prices[key];
  if (!price || price.unit !== view.range.unit || !observationState(price, now).available) return undefined;
  return { ...price, value: price.value!, date: price.date!, kind: view.track ? 'benchmark' as const : 'reference' as const };
}

/** A benchmark price move since publication, separate from whether its forecast is right. */
export function changeSinceEntry(entry: number, current: number) {
  if (!Number.isFinite(entry) || !Number.isFinite(current)) throw new Error('A price change needs finite benchmark observations');
  const absolute = current - entry;
  // Percentage moves from a zero or negative reference have no useful conventional return interpretation.
  return { absolute, percent: entry > 0 ? absolute / entry * 100 : undefined };
}

/** Related-market moves require explicit reference entry data and compatible quoted units. */
export function entryMove(
  view: ChartView & {
    entry?: { value: number; basis?: 'benchmark' | 'reference' };
  },
  prices: Record<string, PriceObservation>,
  now = new Date(),
) {
  if (!view.entry) return undefined;
  const comparison = chartObservation(view, prices, now);
  if (!comparison) return undefined;
  if (view.entry.basis === 'reference') {
    return comparison.kind === 'reference'
      ? { ...changeSinceEntry(view.entry.value, comparison.value), basis: 'reference' as const } : undefined;
  }
  return comparison.kind !== 'reference'
    ? { ...changeSinceEntry(view.entry.value, comparison.value), basis: 'benchmark' as const } : undefined;
}
