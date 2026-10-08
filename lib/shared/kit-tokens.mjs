/* ui-design · tokens
   Every option a site can pick, as data. tools/tokens.mjs turns this into src/tokens.css and
   checks every scheme for readable contrast; the playground reads it to draw its controls.

   A site picks one value per axis on <html>:
     <html data-scheme="midnight" data-mode="dark" data-shape="round" data-density="comfortable"
           data-type="grotesk" data-surface="elevated" data-motion="subtle" data-speed="normal">
   or in content.json: "site": { "style": { "scheme": "midnight", "shape": "round", ... } } */

/* A scheme is a palette in two modes. Each mode gives the seed colours; the kit mixes the rest
   (accent lines and washes, tags, the scrim) from these, so a brand accent dropped on top still
   produces matching shades.
     bg, surface, raised   the page, a card, a card on a card (inputs, the composer)
     ink, ink2, ink3       text: main, secondary, quiet (all pass WCAG AA on bg and surface)
     line, line2           hairlines: quiet and firm
     accent, onAccent      the one colour that acts, and text on it
     good, warn, bad       state
     glow                  an ambient light behind the opening screen, or none
     pop                   three small colours for playful details (chip dots, figures)
   `natural` is the mode a scheme uses when data-mode is not set. */
export const SCHEMES = {
  ops: {
    label: 'Ops', note: 'Monochrome. State in words, not colour. The warOnSaaS default.', natural: 'dark',
    dark: { bg: '#0b0b0b', surface: '#111111', raised: '#171717', ink: '#ededed', ink2: '#a8a8a8', ink3: '#8a8a8a', line: 'rgba(255,255,255,.10)', line2: 'rgba(255,255,255,.18)', accent: '#ededed', onAccent: '#0b0b0b', good: '#ededed', warn: '#a3a3a3', bad: '#737373', glow: 'transparent', pop: ['#ededed', '#a3a3a3', '#737373'] },
    light: { bg: '#f7f7f5', surface: '#ffffff', raised: '#efefec', ink: '#0b0b0b', ink2: '#454545', ink3: '#5e5e5e', line: 'rgba(0,0,0,.10)', line2: 'rgba(0,0,0,.20)', accent: '#0b0b0b', onAccent: '#f7f7f5', good: '#0b0b0b', warn: '#5e5e5e', bad: '#9a9a9a', glow: 'transparent', pop: ['#0b0b0b', '#5e5e5e', '#9a9a9a'] },
  },
  midnight: {
    label: 'Midnight', note: 'Near-black with a cool glow.', natural: 'dark',
    dark: { bg: '#09090b', surface: '#111113', raised: '#18181b', ink: '#fafafa', ink2: '#a1a1aa', ink3: '#8b8b95', line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)', accent: '#7dd3fc', onAccent: '#04202e', good: '#22c55e', warn: '#f59e0b', bad: '#ef4444', glow: 'rgba(125,211,252,.085)', pop: ['#7dd3fc', '#22c55e', '#f472b6'] },
    light: { bg: '#f8fafc', surface: '#ffffff', raised: '#f1f5f9', ink: '#0b1220', ink2: '#475569', ink3: '#5d6b7e', line: 'rgba(15,23,42,.08)', line2: 'rgba(15,23,42,.15)', accent: '#0369a1', onAccent: '#ffffff', good: '#15803d', warn: '#b45309', bad: '#dc2626', glow: 'rgba(56,189,248,.12)', pop: ['#0284c7', '#16a34a', '#db2777'] },
  },
  neutral: {
    label: 'Neutral', note: 'Quiet zinc greys and one blue. Gets out of the way.', natural: 'light',
    light: { bg: '#ffffff', surface: '#fafafa', raised: '#f4f4f5', ink: '#18181b', ink2: '#52525b', ink3: '#6b6b74', line: 'rgba(0,0,0,.08)', line2: 'rgba(0,0,0,.14)', accent: '#2563eb', onAccent: '#ffffff', good: '#15803d', warn: '#b45309', bad: '#dc2626', glow: 'transparent', pop: ['#2563eb', '#16a34a', '#d97706'] },
    dark: { bg: '#161616', surface: '#1c1c1c', raised: '#242424', ink: '#ededed', ink2: '#a3a3a3', ink3: '#8f8f8f', line: 'rgba(255,255,255,.08)', line2: 'rgba(255,255,255,.14)', accent: '#60a5fa', onAccent: '#08152b', good: '#4ade80', warn: '#facc15', bad: '#f87171', glow: 'transparent', pop: ['#60a5fa', '#4ade80', '#facc15'] },
  },
  ember: {
    label: 'Ember', note: 'Warm paper, ink brown and terracotta.', natural: 'light',
    light: { bg: '#f7f1e8', surface: '#fcf8f2', raised: '#f1e8dc', ink: '#2a1c13', ink2: '#5b4637', ink3: '#735d4c', line: 'rgba(74,46,26,.12)', line2: 'rgba(74,46,26,.22)', accent: '#a8471f', onAccent: '#fff8f0', good: '#56702a', warn: '#a26a16', bad: '#b42318', glow: 'rgba(255,214,170,.35)', pop: ['#a8471f', '#56702a', '#c79a2b'] },
    dark: { bg: '#17110d', surface: '#1e1712', raised: '#271e17', ink: '#f3e9dc', ink2: '#c4b3a0', ink3: '#a08d7b', line: 'rgba(243,233,220,.09)', line2: 'rgba(243,233,220,.16)', accent: '#f0915c', onAccent: '#200e04', good: '#a9c46e', warn: '#e9b35f', bad: '#f07a62', glow: 'rgba(240,145,92,.08)', pop: ['#f0915c', '#a9c46e', '#e9b35f'] },
  },
  tide: {
    label: 'Tide', note: 'Cool slate and sea teal. Clear and calm.', natural: 'light',
    light: { bg: '#f2f6f9', surface: '#ffffff', raised: '#e8eff4', ink: '#0f1e2b', ink2: '#43576a', ink3: '#586d80', line: 'rgba(15,30,43,.09)', line2: 'rgba(15,30,43,.16)', accent: '#0e7490', onAccent: '#ffffff', good: '#0f766e', warn: '#b45309', bad: '#be123c', glow: 'rgba(103,232,249,.16)', pop: ['#0e7490', '#0f766e', '#6366f1'] },
    dark: { bg: '#0a1218', surface: '#0f1a22', raised: '#15232d', ink: '#e6f0f5', ink2: '#9fb4c2', ink3: '#8299a8', line: 'rgba(200,230,245,.09)', line2: 'rgba(200,230,245,.16)', accent: '#5ccbe6', onAccent: '#03171e', good: '#34d399', warn: '#fbbf24', bad: '#fb7185', glow: 'rgba(92,203,230,.08)', pop: ['#5ccbe6', '#34d399', '#a5b4fc'] },
  },
  sage: {
    label: 'Sage', note: 'Soft green and linen. Unhurried.', natural: 'light',
    light: { bg: '#f4f7f4', surface: '#ffffff', raised: '#e9efea', ink: '#1b2a24', ink2: '#4a5d55', ink3: '#5c6f66', line: 'rgba(27,42,36,.09)', line2: 'rgba(27,42,36,.16)', accent: '#2f7564', onAccent: '#ffffff', good: '#2f7564', warn: '#a5701b', bad: '#b9461f', glow: 'rgba(170,215,190,.35)', pop: ['#2f7564', '#a5701b', '#6b8fbf'] },
    dark: { bg: '#0d1311', surface: '#121a17', raised: '#18231f', ink: '#e7efe9', ink2: '#a7b8ae', ink3: '#8a9d92', line: 'rgba(230,245,235,.09)', line2: 'rgba(230,245,235,.16)', accent: '#7fcfb0', onAccent: '#06180f', good: '#7fcfb0', warn: '#e3b76a', bad: '#f08a6c', glow: 'rgba(127,207,176,.07)', pop: ['#7fcfb0', '#e3b76a', '#9db8e0'] },
  },
  arcade: {
    label: 'Arcade', note: 'Bright and playful. Pink, sun and sky on cream or night.', natural: 'light',
    light: { bg: '#fff8ee', surface: '#ffffff', raised: '#fff0d9', ink: '#1d1340', ink2: '#4b3f73', ink3: '#5f5389', line: 'rgba(29,19,64,.10)', line2: 'rgba(29,19,64,.18)', accent: '#c0156b', onAccent: '#ffffff', good: '#0f8a5f', warn: '#b86e00', bad: '#d1242f', glow: 'rgba(255,170,210,.35)', pop: ['#e0218a', '#f59f00', '#1c9bd6'] },
    dark: { bg: '#130e29', surface: '#1b1536', raised: '#241c45', ink: '#f6f1ff', ink2: '#c3b8e6', ink3: '#a296cc', line: 'rgba(230,220,255,.10)', line2: 'rgba(230,220,255,.18)', accent: '#ff6bb5', onAccent: '#24061a', good: '#3ee6a8', warn: '#ffd166', bad: '#ff6b7a', glow: 'rgba(255,107,181,.10)', pop: ['#ff6bb5', '#ffd166', '#4cc9f0'] },
  },
  warroom: {
    label: 'War room', note: 'A 90s strategy game: map grid, EGA green, a blinking cursor. Light is the field manual.', natural: 'dark',
    dark: { bg: '#0b0e09', surface: '#11150e', raised: '#181d13', ink: '#e9f0df', ink2: '#a9b59a', ink3: '#8d9a7e', line: 'rgba(200,230,160,.10)', line2: 'rgba(200,230,160,.19)', accent: '#55ff55', onAccent: '#031a03', good: '#55ff55', warn: '#ffff55', bad: '#ff5555', glow: 'rgba(85,255,85,.05)', pop: ['#ffff55', '#55ff55', '#ff55ff'] },
    light: { bg: '#ece6d3', surface: '#f6f1e2', raised: '#e3dcc6', ink: '#1f2414', ink2: '#4a5236', ink3: '#575f42', line: 'rgba(31,36,20,.12)', line2: 'rgba(31,36,20,.24)', accent: '#33601a', onAccent: '#f6f1e2', good: '#33601a', warn: '#8a5d00', bad: '#a12c2c', glow: 'transparent', pop: ['#b58900', '#33601a', '#a12c80'] },
  },
};

/* The style axes. Each value is a set of custom properties; see tools/tokens.mjs for how they
   become CSS. The first value listed is the default. */
export const AXES = {
  mode: { label: 'Mode', values: { natural: 'Scheme default', light: 'Light', dark: 'Dark', auto: 'Follow device' } },
  shape: {
    label: 'Shape', note: 'Corner radius. A brand can set --ui-r to its own.',
    values: {
      sharp: { label: 'Sharp', vars: { '--ui-r': '0px', '--ui-pill': '0px' } },
      soft: { label: 'Soft', vars: { '--ui-r': '10px', '--ui-pill': '8px' } },
      round: { label: 'Round', vars: { '--ui-r': '14px', '--ui-pill': '999px' } },
    },
  },
  density: {
    label: 'Density', note: 'Spacing and text size together.',
    values: {
      compact: { label: 'Compact', vars: { '--ui-u': '3.5px', '--ui-size-adj': '-1px' } },
      comfortable: { label: 'Comfortable', vars: { '--ui-u': '4px', '--ui-size-adj': '0px' } },
      spacious: { label: 'Spacious', vars: { '--ui-u': '4.75px', '--ui-size-adj': '1px' } },
    },
  },
  type: {
    label: 'Type', note: 'A pairing of OFL faces, bundled with the kit.',
    values: {
      grotesk: { label: 'Grotesk', sample: 'Geist and Geist Mono', vars: { '--ui-font': 'Geist,ui-sans-serif,system-ui,sans-serif', '--ui-display': 'Geist,ui-sans-serif,system-ui,sans-serif', '--ui-mono': '"Geist Mono",ui-monospace,monospace', '--ui-numeric': 'Geist,ui-sans-serif,system-ui,sans-serif', '--ui-type-size': '15.5px', '--ui-display-weight': '600', '--ui-display-track': '-.045em', '--ui-label-case': 'none', '--ui-label-track': '0', '--ui-weight-strong': '550', '--ui-prompt-case': 'none', '--ui-prompt-track': '0' } },
      mono: { label: 'Mono', sample: 'JetBrains Mono with Geist Mono headings', vars: { '--ui-font': '"JetBrains Mono",ui-monospace,monospace', '--ui-display': '"Geist Mono",ui-monospace,monospace', '--ui-mono': '"JetBrains Mono",ui-monospace,monospace', '--ui-numeric': '"Geist Mono",ui-monospace,monospace', '--ui-type-size': '14.5px', '--ui-display-weight': '700', '--ui-display-track': '-.03em', '--ui-label-case': 'uppercase', '--ui-label-track': '.06em', '--ui-weight-strong': '700', '--ui-prompt-case': 'uppercase', '--ui-prompt-track': '.06em' } },
      editorial: { label: 'Editorial', sample: 'Fraunces with Source Serif 4', vars: { '--ui-font': '"Source Serif 4",Georgia,serif', '--ui-display': 'Fraunces,Georgia,serif', '--ui-mono': '"Geist Mono",ui-monospace,monospace', '--ui-numeric': 'Fraunces,Georgia,serif', '--ui-type-size': '16.5px', '--ui-display-weight': '500', '--ui-display-track': '-.02em', '--ui-label-case': 'uppercase', '--ui-label-track': '.08em', '--ui-weight-strong': '600', '--ui-prompt-case': 'none', '--ui-prompt-track': '0' } },
      humanist: { label: 'Humanist', sample: 'Instrument Sans with Geist Mono', vars: { '--ui-font': '"Instrument Sans",ui-sans-serif,system-ui,sans-serif', '--ui-display': '"Instrument Sans",ui-sans-serif,system-ui,sans-serif', '--ui-mono': '"Geist Mono",ui-monospace,monospace', '--ui-numeric': '"Instrument Sans",ui-sans-serif,system-ui,sans-serif', '--ui-type-size': '16px', '--ui-display-weight': '600', '--ui-display-track': '-.03em', '--ui-label-case': 'none', '--ui-label-track': '0', '--ui-weight-strong': '600', '--ui-prompt-case': 'none', '--ui-prompt-track': '0' } },
      pixel: { label: 'Pixel', sample: 'Departure Mono headings over Geist', vars: { '--ui-font': 'Geist,ui-sans-serif,system-ui,sans-serif', '--ui-display': '"Departure Mono","Geist Mono",ui-monospace,monospace', '--ui-mono': '"Departure Mono","Geist Mono",ui-monospace,monospace', '--ui-numeric': '"Departure Mono","Geist Mono",ui-monospace,monospace', '--ui-type-size': '15.5px', '--ui-display-weight': '400', '--ui-display-track': '-.01em', '--ui-label-case': 'uppercase', '--ui-label-track': '.08em', '--ui-weight-strong': '550', '--ui-prompt-case': 'none', '--ui-prompt-track': '0' } },
      system: { label: 'System', sample: 'The device’s own faces, nothing to download', vars: { '--ui-font': 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', '--ui-display': 'ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', '--ui-mono': 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', '--ui-numeric': 'ui-sans-serif,system-ui,sans-serif', '--ui-type-size': '15.5px', '--ui-display-weight': '650', '--ui-display-track': '-.035em', '--ui-label-case': 'none', '--ui-label-track': '0', '--ui-weight-strong': '600', '--ui-prompt-case': 'none', '--ui-prompt-track': '0' } },
    },
  },
  surface: {
    label: 'Surface', note: 'How cards sit on the page.',
    values: {
      flat: { label: 'Flat', vars: { '--ui-card': 'var(--ui-surface)', '--ui-card-line': 'transparent', '--ui-card-shadow': 'none', '--ui-card-blur': 'none' } },
      bordered: { label: 'Bordered', vars: { '--ui-card': 'var(--ui-surface)', '--ui-card-line': 'var(--ui-line)', '--ui-card-shadow': 'none', '--ui-card-blur': 'none' } },
      elevated: { label: 'Elevated', vars: { '--ui-card': 'var(--ui-surface)', '--ui-card-line': 'var(--ui-line)', '--ui-card-shadow': 'var(--ui-shadow-sm)', '--ui-card-blur': 'none' } },
      glass: { label: 'Glass', vars: { '--ui-card': 'color-mix(in srgb,var(--ui-surface) 62%,transparent)', '--ui-card-line': 'var(--ui-line-2)', '--ui-card-shadow': 'var(--ui-shadow-glass)', '--ui-card-blur': 'blur(16px) saturate(1.5)' } },
    },
  },
  motion: {
    label: 'Motion', note: 'Transitions and how answers arrive.',
    values: {
      none: { label: 'None', vars: { '--ui-dur': '0ms', '--ui-dur-in': '0ms', '--ui-rise': '0px', '--ui-reveal-blur': '0px', '--ui-lift': '0px', '--ui-ease': 'linear', '--ui-ease-out': 'linear' } },
      subtle: { label: 'Subtle', vars: { '--ui-dur': '160ms', '--ui-dur-in': '320ms', '--ui-rise': '4px', '--ui-reveal-blur': '2px', '--ui-lift': '0px', '--ui-ease': 'cubic-bezier(.22,1,.36,1)', '--ui-ease-out': 'cubic-bezier(.22,1,.36,1)' } },
      lively: { label: 'Lively', vars: { '--ui-dur': '220ms', '--ui-dur-in': '460ms', '--ui-rise': '10px', '--ui-reveal-blur': '4px', '--ui-lift': '-2px', '--ui-ease': 'cubic-bezier(.34,1.56,.64,1)', '--ui-ease-out': 'cubic-bezier(.16,1,.3,1)' } },
    },
  },
  speed: {
    label: 'Streaming', note: 'How fast the agent plays an answer.',
    values: { normal: { label: 'Normal', factor: 1 }, slow: { label: 'Slow', factor: 2.2 }, fast: { label: 'Fast', factor: 0.45 }, instant: { label: 'Instant', factor: 0 } },
  },
};

/* The defaults when a site sets nothing, and the two looks the kit shipped with first.
   site.theme "ops" or "midnight" in content.json still works and means one of these. */
export const DEFAULTS = { scheme: 'ops', mode: 'natural', shape: 'sharp', density: 'comfortable', type: 'mono', surface: 'bordered', motion: 'subtle', speed: 'normal' };
export const PRESETS = {
  ops: { ...DEFAULTS },
  midnight: { scheme: 'midnight', mode: 'natural', shape: 'round', density: 'comfortable', type: 'grotesk', surface: 'bordered', motion: 'subtle', speed: 'normal' },
};
export const AXIS_NAMES = ['scheme', 'mode', 'shape', 'density', 'type', 'surface', 'motion', 'speed'];

/* The style for a content file: a preset from site.theme, then site.style on top. */
export function styleFor(site = {}) {
  const base = PRESETS[site.theme] || DEFAULTS;
  const s = { ...base, ...(site.style || {}) };
  for (const k of AXIS_NAMES) {
    const ok = k === 'scheme' ? s[k] in SCHEMES || /^[a-z][\w-]*$/.test(s[k] || '') : s[k] in AXES[k].values;
    if (!ok) s[k] = base[k] ?? DEFAULTS[k];
  }
  return s;
}
