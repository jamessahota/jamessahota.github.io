export const books = [
  { id: 'with_wti', name: 'With WTI', markets: 'WTI crude, natural gas and RBOB gasoline' },
  { id: 'without_wti', name: 'Without WTI', markets: 'Natural gas and RBOB gasoline' },
] as const;
export type Book = typeof books[number]['id'];
export const markets: Record<string, string> = { CL: 'WTI crude', NG: 'Natural gas', RB: 'RBOB gasoline' };
export type Positions = Record<string, string>;

interface Trade {
  ticker: string;
  signed_quantity: string;
  before: string;
  after: string;
  filled_at_utc: string;
  signal_recorded_at_utc: string;
}
interface Account {
  positions: Positions;
  entry_status: string;
  daily_pnl_usd: string;
  cumulative_pnl_usd: string;
  equity_usd: string;
  peak_equity_usd: string;
  drawdown_pct: string;
  max_drawdown_pct: string;
  daily_market_pnl_usd: Record<string, string>;
  trades: Trade[];
}
interface Curve { near: string; deferred: string; trade_contract: string; annualized_carry: string | null; }
interface Signal {
  status: 'recorded' | 'missed_deadline';
  recorded_at_utc: string | null;
  for_session: string;
  settlement_at_utc: string;
  deadline_utc: string;
  curves: Record<string, Curve>;
  books: Partial<Record<Book, { positions: Positions; weights: Record<string, string> }>>;
}
export interface Session {
  session: string;
  event_sha256: string;
  settlement_at_utc: string;
  processed_at_utc: string;
  books: Record<Book, Account>;
  signal: Signal;
}
export interface TrackRecord {
  schema: string;
  inception_session: string;
  as_of_session: string;
  updated_at_utc: string;
  reference_capital_usd: string;
  sessions: Session[];
}

const hasPosition = (positions: Positions) => Object.values(positions).some(qty => Number(qty) !== 0);

export function firstResultIndices(sessions: Session[]): Record<Book, number> {
  function firstResult(book: Book) {
    // A settlement fill can first earn P&L at the following settlement.
    const heldAt = sessions.findIndex(s => hasPosition(s.books[book].positions));
    return heldAt >= 0 && heldAt + 1 < sessions.length ? heldAt + 1 : Infinity;
  }
  return { with_wti: firstResult('with_wti'), without_wti: firstResult('without_wti') };
}

export function paperStatus(session: Session, book: Book, hasResult: boolean): string | null {
  if (hasResult) return null;
  if (hasPosition(session.books[book].positions)) return 'First fill recorded, awaiting first result.';
  const target = session.signal.books[book];
  if (session.signal.status === 'recorded' && target && hasPosition(target.positions)) {
    return 'Signal recorded, awaiting first fill.';
  }
  return 'Awaiting first position.';
}

const dates = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' });
const times = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York',
});
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const percents = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const day = (value: string) => dates.format(new Date(value + 'T12:00:00Z'));
export const timestamp = (value: string) => times.format(new Date(value)) + ' ET';
export const usd = (value: string | number) => dollars.format(Number(value));
export const percent = (value: string | number) => percents.format(Number(value)) + '%';
export function quantity(value: string) {
  const abs = value.replace(/^[+-]/, '');
  return abs.includes('.') ? abs.replace(/0+$/, '').replace(/\.$/, '') : abs;
}
export const direction = (value: string) => Number(value) > 0 ? 'Long' : Number(value) < 0 ? 'Short' : 'Flat';
