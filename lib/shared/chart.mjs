// Charts as plain SVG, drawn from a chart block's data. Colours come from the slide's theme
// (accent first, then the scheme's own pop colours, in a fixed order), text wears ink colours,
// marks are thin with rounded data ends, there is one axis, and two or more series get a legend.
// Every mark has a <title>, so hovering it shows its value.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SERIES_VARS = ['var(--dk-c1)', 'var(--dk-c2)', 'var(--dk-c3)', 'var(--dk-c4)', 'var(--dk-c5)', 'var(--dk-c6)'];

export function fmt(v, unit = '') {
  const a = Math.abs(v);
  let s = a >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : a >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : a >= 1e5 ? `${+(v / 1e3).toFixed(0)}k` : (+v.toFixed(a < 10 && a % 1 ? 1 : 0)).toLocaleString('en-US');
  if (!unit) return s;
  if (/^[$€£¥]/.test(unit)) return `${unit[0]}${s}${unit.slice(1)}`;
  return `${s}${unit}`;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

export function chartSvg(b, { w = 560, h = 300 } = {}) {
  const series = (b.series ?? []).filter((s) => s.values?.length);
  const labels = b.labels ?? [];
  const unit = b.unit ?? '';
  if (!series.length || !labels.length) return `<div class="dk-chart-empty">Add labels and numbers to draw this chart.</div>`;
  const legend = series.length > 1 ? `<div class="dk-legend">${series.map((s, i) => `<span><i style="background:${SERIES_VARS[i % 6]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  const title = b.title ? `<div class="dk-chart-t">${esc(b.title)}</div>` : '';
  let svg;
  if (b.kind === 'donut') svg = donut(series[0], labels, unit, w, h);
  else if (b.kind === 'bar') svg = bars(series, labels, unit, w, h);
  else if (b.kind === 'line' || b.kind === 'area') svg = lines(series, labels, unit, w, h, b.kind === 'area');
  else svg = columns(series, labels, unit, w, h);
  return `<figure class="dk-chart">${title}${svg}${b.kind === 'donut' ? '' : legend}</figure>`;
}

function frame(w, h, inner) {
  return `<svg class="dk-svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img">${inner}</svg>`;
}

function columns(series, labels, unit, w, h) {
  const padL = 44, padB = 26, padT = 18, padR = 6;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const group = plotW / labels.length;
  const gap = 2;
  const barW = Math.max(4, Math.min(56, (group * 0.72 - gap * (series.length - 1)) / series.length));
  const y = (v) => padT + plotH - (Math.max(0, v) / max) * plotH;
  let g = grid(padL, padT, plotW, plotH, max, unit);
  labels.forEach((l, i) => {
    const gx = padL + group * i + (group - (barW * series.length + gap * (series.length - 1))) / 2;
    series.forEach((s, k) => {
      const v = s.values[i] ?? 0;
      const x = gx + k * (barW + gap);
      g += `<path d="${roundTop(x, y(v), barW, padT + plotH - y(v))}" fill="${SERIES_VARS[k % 6]}"><title>${esc(`${s.name}, ${l}: ${fmt(v, unit)}`)}</title></path>`;
      if (series.length === 1 && labels.length <= 12) g += `<text x="${x + barW / 2}" y="${y(v) - 6}" class="dk-val" text-anchor="middle">${esc(fmt(v, unit))}</text>`;
    });
    g += `<text x="${padL + group * i + group / 2}" y="${h - 8}" class="dk-axis" text-anchor="middle">${esc(l)}</text>`;
  });
  return frame(w, h, g);
}

function bars(series, labels, unit, w, h) {
  const padL = Math.min(170, 14 + Math.max(...labels.map((l) => String(l).length)) * 7.2), padR = 54, padT = 6, padB = 6;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const group = plotH / labels.length;
  const gap = 2;
  const barH = Math.max(4, Math.min(30, (group * 0.7 - gap * (series.length - 1)) / series.length));
  let g = '';
  labels.forEach((l, i) => {
    const gy = padT + group * i + (group - (barH * series.length + gap * (series.length - 1))) / 2;
    series.forEach((s, k) => {
      const v = s.values[i] ?? 0;
      const len = (Math.max(0, v) / max) * plotW;
      const yy = gy + k * (barH + gap);
      g += `<path d="${roundRight(padL, yy, len, barH)}" fill="${SERIES_VARS[k % 6]}"><title>${esc(`${s.name}, ${l}: ${fmt(v, unit)}`)}</title></path>`;
      if (series.length === 1) g += `<text x="${padL + len + 6}" y="${yy + barH / 2 + 4}" class="dk-val">${esc(fmt(v, unit))}</text>`;
    });
    g += `<text x="${padL - 10}" y="${padT + group * i + group / 2 + 4}" class="dk-axis" text-anchor="end">${esc(l)}</text>`;
  });
  return frame(w, h, g);
}

function lines(series, labels, unit, w, h, area) {
  const padL = 44, padB = 26, padT = 18, padR = 16;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 0));
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const n = labels.length;
  const x = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v) => padT + plotH - (Math.max(0, v) / max) * plotH;
  let g = grid(padL, padT, plotW, plotH, max, unit);
  series.forEach((s, k) => {
    const pts = labels.map((_, i) => [x(i), y(s.values[i] ?? 0)]);
    const d = pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    if (area) g += `<path d="${d}L${pts.at(-1)[0].toFixed(1)},${padT + plotH}L${pts[0][0].toFixed(1)},${padT + plotH}Z" fill="${SERIES_VARS[k % 6]}" fill-opacity="${series.length > 1 ? 0.14 : 0.2}"/>`;
    g += `<path d="${d}" fill="none" stroke="${SERIES_VARS[k % 6]}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(([a, b], i) => { g += `<circle cx="${a}" cy="${b}" r="4" fill="${SERIES_VARS[k % 6]}" stroke="var(--dk-plot-bg)" stroke-width="2"><title>${esc(`${s.name}, ${labels[i]}: ${fmt(s.values[i] ?? 0, unit)}`)}</title></circle>`; });
    // the last value, labelled at the end of each line
    const last = pts.at(-1);
    if (series.length <= 3) g += `<text x="${last[0]}" y="${last[1] - 10}" class="dk-val" text-anchor="end">${esc(fmt(s.values[n - 1] ?? 0, unit))}</text>`;
  });
  const every = Math.ceil(n / 10);
  labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${x(i)}" y="${h - 8}" class="dk-axis" text-anchor="middle">${esc(l)}</text>`; });
  return frame(w, h, g);
}

function donut(s, labels, unit, w, h) {
  const vals = labels.map((_, i) => Math.max(0, s.values[i] ?? 0));
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  const r = Math.min(h, w * 0.5) / 2 - 8, cx = r + 10, cy = h / 2, inner = r * 0.62;
  let a0 = -Math.PI / 2, g = '';
  vals.forEach((v, i) => {
    const a1 = a0 + (v / total) * Math.PI * 2;
    if (v > 0) g += `<path d="${arc(cx, cy, r, inner, a0, a1)}" fill="${SERIES_VARS[i % 6]}" stroke="var(--dk-plot-bg)" stroke-width="2"><title>${esc(`${labels[i]}: ${fmt(v, unit)} (${Math.round((v / total) * 100)}%)`)}</title></path>`;
    a0 = a1;
  });
  // The middle says the biggest share and what it is.
  const top = vals.indexOf(Math.max(...vals));
  g += `<text x="${cx}" y="${cy + 4}" class="dk-donut-n" text-anchor="middle">${Math.round((vals[top] / total) * 100)}%</text><text x="${cx}" y="${cy + 24}" class="dk-axis" text-anchor="middle">${esc(labels[top])}</text>`;
  const lx = cx + r + 28;
  const step = Math.min(30, (h - 20) / Math.max(1, labels.length));
  labels.forEach((l, i) => {
    const yy = cy - ((labels.length - 1) * step) / 2 + i * step;
    g += `<rect x="${lx}" y="${yy - 6}" width="12" height="12" rx="3" fill="${SERIES_VARS[i % 6]}"/><text x="${lx + 20}" y="${yy + 4}" class="dk-axis dk-leg-t">${esc(l)}</text><text x="${w - 4}" y="${yy + 4}" class="dk-val" text-anchor="end">${esc(`${Math.round((vals[i] / total) * 100)}%`)}</text>`;
  });
  return frame(w, h, g);
}

function grid(x, y, w, h, max, unit) {
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const yy = y + h - (h * i) / 4;
    g += `<line x1="${x}" x2="${x + w}" y1="${yy}" y2="${yy}" class="${i ? 'dk-grid' : 'dk-base'}"/>`;
    g += `<text x="${x - 8}" y="${yy + 4}" class="dk-axis" text-anchor="end">${esc(fmt((max * i) / 4, unit))}</text>`;
  }
  return g;
}

function roundTop(x, y, w, h) {
  if (h <= 0) return `M${x},${y}h${w}`;
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function roundRight(x, y, w, h) {
  if (w <= 0) return `M${x},${y}v${h}`;
  const r = Math.min(4, h / 2, w);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function arc(cx, cy, r, ir, a0, a1) {
  if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
  const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ir, a1)}A${ir},${ir} 0 ${large} 0 ${p(ir, a0)}Z`;
}
