// Geometry for a futures curve drawn from a chart in a report's front matter.
// Points are spaced by the real gap between contract months when every item has a
// `period`; otherwise they are spaced evenly. Nothing is interpolated or invented:
// the line only joins the prices that are printed beside it.

export interface CurveItem {
  label: string;
  value: number;
  period?: string;
}

export interface CurveBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const monthIndex = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7));

/** The smallest "round" step (1, 2, 5 or 10 times a power of ten) that is at least `raw`. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((factor) => factor * magnitude).find((step) => step >= raw) ?? 10 * magnitude;
}

export function curveGeometry(items: CurveItem[], box: CurveBox) {
  const values = items.map((item) => item.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const step = niceStep(Math.max(high - low, Math.abs(high) * 0.02, 1e-9) / 3);
  const axisMin = Math.floor(low / step) * step;
  const axisMax = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let tick = axisMin; tick <= axisMax + step / 1000; tick += step) ticks.push(Number(tick.toFixed(6)));

  const months = items.map((item) => (item.period ? monthIndex(item.period) : NaN));
  const span = months.at(-1)! - months[0]!;
  const dated = months.every(Number.isFinite) && span > 0;
  const fraction = (index: number) =>
    dated ? (months[index]! - months[0]!) / span : items.length > 1 ? index / (items.length - 1) : 0;

  const y = (value: number) => box.bottom - ((value - axisMin) / (axisMax - axisMin)) * (box.bottom - box.top);
  const points = items.map((item, index) => ({
    ...item,
    x: box.left + fraction(index) * (box.right - box.left),
    y: y(item.value),
  }));
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
  // How far along the drawn line each point sits (0 to 1), so a marker can
  // switch on as the line reaches it.
  const lengths = points.map((point, index) =>
    index ? Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y) : 0,
  );
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  let run = 0;
  const reached = lengths.map((length) => (run += length) / total);

  return {
    points: points.map((point, index) => ({ ...point, reached: reached[index]! })),
    line,
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    axisMin,
    axisMax,
    dated,
    /** 'backwardation' when later contracts are cheaper than the first, 'contango' when dearer. */
    shape: values.at(-1)! < values[0]! ? 'backwardation' : values.at(-1)! > values[0]! ? 'contango' : 'flat',
  } as const;
}
