// Deck themes: every scheme and style option of the ui-design kit (v2), plus a brand layer on top.
// Shared by the server (tools, exports) and the browser (editor, present mode). The colour values
// come from the kit's own tokens.mjs, copied in by scripts/sync-kit.mjs.
import { SCHEMES, AXES } from '../../public/ui/src/tokens.mjs';

export { SCHEMES };
export const SCHEME_NAMES = Object.keys(SCHEMES);
export const MODES = ['light', 'dark'];
export const SHAPES = Object.keys(AXES.shape.values);
export const TYPES = Object.keys(AXES.type.values);
export const SURFACES = Object.keys(AXES.surface.values);
export const DENSITIES = Object.keys(AXES.density.values);

export const DEFAULT_THEME = { scheme: 'neutral', mode: 'light', shape: 'soft', type: 'grotesk', surface: 'bordered', density: 'comfortable' };

// A few ready looks, so a person (or an agent) can pick one word instead of six options.
export const PRESETS = {
  clean: { scheme: 'neutral', mode: 'light', shape: 'soft', type: 'grotesk', surface: 'bordered', density: 'comfortable' },
  ops: { scheme: 'ops', mode: 'dark', shape: 'sharp', type: 'mono', surface: 'bordered', density: 'comfortable' },
  midnight: { scheme: 'midnight', mode: 'dark', shape: 'round', type: 'grotesk', surface: 'elevated', density: 'comfortable' },
  editorial: { scheme: 'ember', mode: 'light', shape: 'soft', type: 'editorial', surface: 'flat', density: 'spacious' },
  calm: { scheme: 'tide', mode: 'light', shape: 'round', type: 'humanist', surface: 'elevated', density: 'comfortable' },
  garden: { scheme: 'sage', mode: 'light', shape: 'round', type: 'humanist', surface: 'flat', density: 'spacious' },
  playful: { scheme: 'arcade', mode: 'light', shape: 'round', type: 'grotesk', surface: 'elevated', density: 'comfortable' },
  war_room: { scheme: 'warroom', mode: 'dark', shape: 'sharp', type: 'pixel', surface: 'bordered', density: 'comfortable' },
};

export function normalTheme(t = {}) {
  const base = t.preset && PRESETS[t.preset] ? PRESETS[t.preset] : DEFAULT_THEME;
  const out = { ...DEFAULT_THEME, ...base };
  const pick = (k, list) => { if (t[k] != null && list.includes(t[k])) out[k] = t[k]; };
  pick('scheme', SCHEME_NAMES); pick('mode', MODES); pick('shape', SHAPES); pick('type', TYPES); pick('surface', SURFACES); pick('density', DENSITIES);
  return out;
}

// The seed colours of a theme, for exports (PPTX has no CSS).
export function palette(theme, brand = {}) {
  const t = normalTheme(theme);
  const p = SCHEMES[t.scheme][t.mode];
  const hex = (c) => (String(c).startsWith('#') ? String(c).slice(1, 7).toUpperCase() : null);
  const rgba = (c, bg) => {
    // a hairline colour like rgba(0,0,0,.10) mixed over the background, as a plain hex
    const m = /rgba?\(([^)]+)\)/.exec(String(c));
    if (!m) return hex(c);
    const [r, g, b, a = 1] = m[1].split(',').map(Number);
    const B = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    return [r, g, b].map((v, i) => Math.round(v * a + B[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const accent = brand.accent && /^#[0-9a-f]{6}$/i.test(brand.accent) ? brand.accent : p.accent;
  return {
    bg: hex(p.bg), surface: hex(p.surface), raised: hex(p.raised), ink: hex(p.ink), ink2: hex(p.ink2), ink3: hex(p.ink3),
    line: rgba(p.line, p.bg), line2: rgba(p.line2, p.bg), accent: hex(accent),
    onAccent: hex(brand.on_accent && /^#[0-9a-f]{6}$/i.test(brand.on_accent) ? brand.on_accent : p.onAccent),
    good: hex(p.good), warn: hex(p.warn), bad: hex(p.bad), pop: p.pop.map(hex),
    dark: t.mode === 'dark',
  };
}

const FACES = {
  grotesk: { body: 'Arial', head: 'Arial' },
  mono: { body: 'Consolas', head: 'Consolas' },
  editorial: { body: 'Georgia', head: 'Georgia' },
  humanist: { body: 'Calibri', head: 'Calibri' },
  pixel: { body: 'Arial', head: 'Consolas' },
  system: { body: 'Arial', head: 'Arial' },
};
// Faces for PowerPoint: the brand's own if set, otherwise a safe face close to the kit's pairing.
export function faces(theme, brand = {}) {
  const t = normalTheme(theme);
  const first = (s) => String(s ?? '').split(',')[0].replace(/["']/g, '').trim() || null;
  return { body: first(brand.font) ?? FACES[t.type].body, head: first(brand.display) ?? first(brand.font) ?? FACES[t.type].head };
}

// The brand layer as CSS custom properties on a slide.
export function brandStyle(brand = {}) {
  const v = [];
  const safe = (s) => String(s).replace(/[;{}<>"\\]/g, '');
  if (brand.accent && /^#[0-9a-f]{3,8}$/i.test(brand.accent)) v.push(`--ui-accent:${brand.accent}`, `--ui-pop-1:${brand.accent}`);
  if (brand.on_accent && /^#[0-9a-f]{3,8}$/i.test(brand.on_accent)) v.push(`--ui-on-accent:${brand.on_accent}`);
  if (brand.font) v.push(`--ui-font:${safe(brand.font)}`);
  if (brand.display) v.push(`--ui-display:${safe(brand.display)}`, `--ui-numeric:${safe(brand.display)}`);
  return v.join(';');
}

export function themeList() {
  return {
    schemes: SCHEME_NAMES.map((id) => ({ id, label: SCHEMES[id].label, note: SCHEMES[id].note, natural_mode: SCHEMES[id].natural, accent: { light: SCHEMES[id].light.accent, dark: SCHEMES[id].dark.accent }, background: { light: SCHEMES[id].light.bg, dark: SCHEMES[id].dark.bg } })),
    modes: MODES,
    shapes: SHAPES.map((id) => ({ id, label: AXES.shape.values[id].label })),
    types: TYPES.map((id) => ({ id, label: AXES.type.values[id].label, faces: AXES.type.values[id].sample })),
    surfaces: SURFACES.map((id) => ({ id, label: AXES.surface.values[id].label })),
    densities: DENSITIES.map((id) => ({ id, label: AXES.density.values[id].label })),
    presets: Object.entries(PRESETS).map(([id, v]) => ({ id, ...v })),
    brand: { logo: 'An image address or an uploaded file url, shown on every slide', accent: '#rrggbb, replaces the scheme accent', on_accent: '#rrggbb, text on the accent', font: 'A CSS font family for body text', display: 'A CSS font family for titles', fonts_href: 'A Google Fonts stylesheet address that loads those faces', footer: 'A short line on every slide, like the company name' },
  };
}
