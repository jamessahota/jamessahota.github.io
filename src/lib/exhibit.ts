/** One zero-anchored scale, including negative stock changes when present. */
export function comparisonGeometry(values: number[], domain?: { min: number; max: number }) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error('A comparison needs finite values');
  }
  const min = domain?.min ?? Math.min(0, ...values);
  const max = domain?.max ?? (Math.max(0, ...values) || (min === 0 ? 1 : 0));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > 0 || max < 0 || max <= min || values.some((value) => value < min || value > max)) {
    throw new Error('A comparison domain must include zero and every value');
  }
  const span = max - min;
  return {
    min,
    max,
    zero: min === 0 ? 0 : (-min / span) * 100,
    bars: values.map((value) => ({
      left: ((Math.min(value, 0) - min) / span) * 100,
      width: (Math.abs(value) / span) * 100,
      negative: value < 0,
    })),
  };
}
