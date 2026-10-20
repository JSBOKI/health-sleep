export interface MannKendall {
  n: number;
  S: number;
  z: number;
  p: number;
  tau: number;
}

export interface LinearTrend {
  n: number;
  slopePerDay: number;
  intercept: number;
  p: number;
  r: number;
}

export interface Pearson {
  n: number;
  r: number;
  p: number;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  let s = 0;
  for (const v of values) {
    const d = v - mean;
    s += d * d;
  }
  return Math.sqrt(s / (values.length - 1));
}

export function median(values: number[]): number {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid] ?? Number.NaN;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Abramowitz and Stegun approximation of the standard normal CDF. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const erf = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  const p = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) x += (p[i] ?? 0) / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const max = 200;
  const eps = 3e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= max; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  if (x < (a + 1) / (a + b + 2)) {
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
    return front * betacf(a, b, x);
  }
  const front = Math.exp(Math.log(x) * b + Math.log(1 - x) * a - lnBeta) / b;
  return 1 - front * betacf(b, a, 1 - x);
}

/** Two-tailed Student t p-value. */
export function studentTTwoTail(tAbs: number, df: number): number {
  if (!Number.isFinite(tAbs)) return 0;
  if (df <= 0 || !Number.isFinite(df)) return 1;
  if (tAbs === 0) return 1;
  const x = df / (df + tAbs * tAbs);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

export function mannKendall(values: number[]): MannKendall {
  const n = values.length;
  if (n < 3) return { n, S: 0, z: 0, p: 1, tau: 0 };
  let S = 0;
  const ties = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const left = values[i] ?? 0;
    ties.set(left, (ties.get(left) ?? 0) + 1);
    for (let j = i + 1; j < n; j++) {
      const diff = (values[j] ?? 0) - left;
      if (diff > 0) S += 1;
      else if (diff < 0) S -= 1;
    }
  }
  let tieTerm = 0;
  for (const t of ties.values()) {
    if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  }
  const varS = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (varS > 0) {
    if (S > 0) z = (S - 1) / Math.sqrt(varS);
    else if (S < 0) z = (S + 1) / Math.sqrt(varS);
  }
  const p = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
  const tau = S / ((n * (n - 1)) / 2);
  return { n, S, z, p, tau };
}

export function linearTrend(points: Array<{ t: number; y: number }>): LinearTrend {
  const n = points.length;
  if (n < 3) {
    return { n, slopePerDay: 0, intercept: points[0]?.y ?? 0, p: 1, r: 0 };
  }
  const t0 = points[0]?.t ?? 0;
  const xs = points.map((p) => (p.t - t0) / 86400000);
  const ys = points.map((p) => p.y);
  const meanX = average(xs);
  const meanY = average(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r = sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * (xs[i] ?? 0);
    const err = (ys[i] ?? 0) - pred;
    sse += err * err;
  }
  const df = n - 2;
  const seSlope = df > 0 && sxx > 0 ? Math.sqrt(sse / df / sxx) : Number.POSITIVE_INFINITY;
  const tStat = seSlope === 0 ? 0 : slope / seSlope;
  const p = studentTTwoTail(Math.abs(tStat), df);
  return { n, slopePerDay: slope, intercept, p, r };
}

export function pearson(xs: number[], ys: number[]): Pearson {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { n, r: 0, p: 1 };
  const xa = xs.slice(0, n);
  const ya = ys.slice(0, n);
  const mx = average(xa);
  const my = average(ya);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xa[i] ?? 0) - mx;
    const dy = (ya[i] ?? 0) - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0 || syy === 0) return { n, r: 0, p: 1 };
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  if (Math.abs(r) > 0.999999) return { n, r: Math.sign(r), p: 0 };
  const df = n - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  return { n, r, p: studentTTwoTail(Math.abs(t), df) };
}

export interface DatedValue {
  date: string;
  value: number;
}

export function rollingMean(values: DatedValue[], windowDays: number, addDays: (date: string, n: number) => string): Map<string, number> {
  const map = new Map<string, number>();
  let j = 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]?.value ?? 0;
    const cutoff = addDays(values[i]?.date ?? "", -(windowDays - 1));
    while (j < i && (values[j]?.date ?? "") < cutoff) {
      sum -= values[j]?.value ?? 0;
      j++;
    }
    const count = i - j + 1;
    if (count > 0 && values[i]) map.set(values[i].date, sum / count);
  }
  return map;
}

export interface Outlier {
  date: string;
  value: number;
  z: number;
  baselineMean: number;
  baselineSd: number;
}

export function findOutliers(
  values: DatedValue[],
  range: { start: string; end: string },
  addDays: (date: string, n: number) => string,
  k = 2,
): Outlier[] {
  const flags: Outlier[] = [];
  for (let i = 0; i < values.length; i++) {
    const point = values[i];
    if (!point || point.date < range.start || point.date > range.end) continue;
    const cutoff = addDays(point.date, -30);
    const base: number[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const prev = values[j];
      if (!prev || prev.date < cutoff) break;
      base.push(prev.value);
    }
    if (base.length < 10) continue;
    const mean = average(base);
    const sd = stdev(base);
    if (sd < 1e-9) continue;
    const z = (point.value - mean) / sd;
    if (Math.abs(z) > k) {
      flags.push({ date: point.date, value: point.value, z, baselineMean: mean, baselineSd: sd });
    }
  }
  flags.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  return flags;
}

export function windowMean(values: DatedValue[], start: string, end: string): number | null {
  let sum = 0;
  let n = 0;
  for (const point of values) {
    if (point.date < start || point.date > end) continue;
    sum += point.value;
    n++;
  }
  return n ? sum / n : null;
}
