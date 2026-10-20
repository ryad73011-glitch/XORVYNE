/**
 * XORVYNE asset catalogue.
 *
 * Everything in this file is serialisable and engine independent: the client
 * renders it in the browser preview, the server maps the same semantic
 * definitions onto ffmpeg filters, and the asset library UI reads it directly.
 */

export type EffectCategory = 'color' | 'style' | 'motion' | 'text' | 'audio';

export interface EffectParamDef {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'select';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  default: number | string | boolean;
}

export interface EffectDefinition {
  type: string;
  label: string;
  category: EffectCategory;
  description: string;
  params: EffectParamDef[];
  /** Effects that need a companion video layer (handled specially). */
  composited?: boolean;
}

/* --------------------------------------------------------------- overlays */

export interface OverlayDefinition {
  id: string;
  label: string;
  description: string;
  category: 'film' | 'light' | 'frame';
  params: { key: string; label: string; min: number; max: number; step: number; default: number }[];
}

export const OVERLAY_CATALOG: OverlayDefinition[] = [
  {
    id: 'grain',
    label: 'Film Grain',
    description: 'Analogue texture over the whole frame.',
    category: 'film',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.25 }],
  },
  {
    id: 'vignette',
    label: 'Vignette',
    description: 'Darkened frame edges.',
    category: 'frame',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.5 }],
  },
  {
    id: 'lightleak',
    label: 'Light Leak',
    description: 'Animated warm flare across the frame.',
    category: 'light',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.4 }],
  },
  {
    id: 'letterbox',
    label: 'Letterbox',
    description: 'Cinema bars for a 2.39:1 look.',
    category: 'frame',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.6 }],
  },
  {
    id: 'scanlines',
    label: 'Scanlines',
    description: 'CRT horizontal lines.',
    category: 'film',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.3 }],
  },
  {
    id: 'dust',
    label: 'Dust & Scratches',
    description: 'Occasional dust specks and hairline scratches.',
    category: 'film',
    params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01, default: 0.3 }],
  },
];

export const EFFECT_CATALOG: EffectDefinition[] = [
  {
    type: 'brightness',
    label: 'Brightness',
    category: 'color',
    description: 'Lifts or crushes the exposure of the clip.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: -1, max: 1, step: 0.01, default: 0 }],
  },
  {
    type: 'contrast',
    label: 'Contrast',
    category: 'color',
    description: 'Increases or flattens the tonal range.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: -1, max: 1, step: 0.01, default: 0 }],
  },
  {
    type: 'saturation',
    label: 'Saturation',
    category: 'color',
    description: 'Controls colour intensity. 0 is greyscale.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 3, step: 0.01, default: 1 }],
  },
  {
    type: 'temperature',
    label: 'Temperature',
    category: 'color',
    description: 'Warms (orange) or cools (blue) the image.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: -1, max: 1, step: 0.01, default: 0 }],
  },
  {
    type: 'tint',
    label: 'Tint',
    category: 'color',
    description: 'Duotone style colour wash.',
    params: [
      { key: 'color', label: 'Colour', type: 'select', default: '#7c3aed', options: [
        { value: '#7c3aed', label: 'Violet' },
        { value: '#f97316', label: 'Amber' },
        { value: '#22d3ee', label: 'Cyan' },
        { value: '#f43f5e', label: 'Rose' },
      ] },
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
  },
  {
    type: 'blur',
    label: 'Blur',
    category: 'style',
    description: 'Gaussian blur for depth or censoring.',
    params: [{ key: 'amount', label: 'Radius', type: 'number', min: 0, max: 40, step: 0.5, default: 4 }],
  },
  {
    type: 'sharpen',
    label: 'Sharpen',
    category: 'style',
    description: 'Crispens soft footage.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 3, step: 0.05, default: 1 }],
  },
  {
    type: 'grayscale',
    label: 'Black & White',
    category: 'style',
    description: 'Removes colour completely.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 1 }],
  },
  {
    type: 'sepia',
    label: 'Sepia',
    category: 'style',
    description: 'Warm vintage tone.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 }],
  },
  {
    type: 'vignette',
    label: 'Vignette',
    category: 'style',
    description: 'Darkens the frame edges for a cinematic frame.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 }],
  },
  {
    type: 'grain',
    label: 'Film Grain',
    category: 'style',
    description: 'Adds analogue texture.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 }],
  },
  {
    type: 'glitch',
    label: 'Glitch',
    category: 'style',
    description: 'RGB split and scanline disruption.',
    params: [{ key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 }],
  },
  {
    type: 'overlay',
    label: 'Film Overlay',
    category: 'style',
    description: 'Grain, vignette, letterbox, scanlines or light leak over the frame.',
    params: [
      {
        key: 'kind',
        label: 'Overlay',
        type: 'select',
        default: 'grain',
        options: [
          { value: 'grain', label: 'Film Grain' },
          { value: 'vignette', label: 'Vignette' },
          { value: 'lightleak', label: 'Light Leak' },
          { value: 'letterbox', label: 'Letterbox' },
          { value: 'scanlines', label: 'Scanlines' },
          { value: 'dust', label: 'Dust & Scratches' },
        ],
      },
      { key: 'amount', label: 'Amount', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    ],
  },
  {
    type: 'kenburns',
    label: 'Ken Burns',
    category: 'motion',
    description: 'Slow push-in on stills and images.',
    params: [{ key: 'amount', label: 'Zoom', type: 'number', min: 1, max: 1.6, step: 0.01, default: 1.15 }],
  },
  {
    type: 'fadeIn',
    label: 'Fade In',
    category: 'motion',
    description: 'Dissolves the clip in from black.',
    params: [{ key: 'durationMs', label: 'Duration (ms)', type: 'number', min: 100, max: 5000, step: 50, default: 500 }],
  },
  {
    type: 'fadeOut',
    label: 'Fade Out',
    category: 'motion',
    description: 'Dissolves the clip out to black.',
    params: [{ key: 'durationMs', label: 'Duration (ms)', type: 'number', min: 100, max: 5000, step: 50, default: 500 }],
  },
];

export const EFFECT_BY_TYPE: Record<string, EffectDefinition> = Object.fromEntries(
  EFFECT_CATALOG.map((effect) => [effect.type, effect]),
);

/** Look presets are bundles of the primitives above. */
export interface StylePreset {
  id: string;
  label: string;
  description: string;
  effects: { type: string; params: Record<string, number | string | boolean> }[];
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Teal shadows, warm highlights, soft vignette.',
    effects: [
      { type: 'contrast', params: { amount: 0.12 } },
      { type: 'saturation', params: { amount: 1.08 } },
      { type: 'temperature', params: { amount: -0.12 } },
      { type: 'vignette', params: { amount: 0.45 } },
    ],
  },
  {
    id: 'noir',
    label: 'Noir',
    description: 'High contrast monochrome with heavy grain.',
    effects: [
      { type: 'grayscale', params: { amount: 1 } },
      { type: 'contrast', params: { amount: 0.35 } },
      { type: 'grain', params: { amount: 0.4 } },
      { type: 'vignette', params: { amount: 0.6 } },
    ],
  },
  {
    id: 'vhs',
    label: 'VHS',
    description: 'Retro tape colour bleed and scanlines.',
    effects: [
      { type: 'saturation', params: { amount: 1.35 } },
      { type: 'glitch', params: { amount: 0.5 } },
      { type: 'grain', params: { amount: 0.35 } },
    ],
  },
  {
    id: 'warm',
    label: 'Warm Light',
    description: 'Golden hour warmth.',
    effects: [
      { type: 'temperature', params: { amount: 0.4 } },
      { type: 'saturation', params: { amount: 1.12 } },
      { type: 'brightness', params: { amount: 0.05 } },
    ],
  },
  {
    id: 'cold',
    label: 'Cold Blue',
    description: 'Icy, clinical grade.',
    effects: [
      { type: 'temperature', params: { amount: -0.45 } },
      { type: 'contrast', params: { amount: 0.1 } },
      { type: 'saturation', params: { amount: 0.9 } },
    ],
  },
  {
    id: 'dreamy',
    label: 'Dreamy',
    description: 'Soft focus haze with lifted blacks.',
    effects: [
      { type: 'blur', params: { amount: 2 } },
      { type: 'brightness', params: { amount: 0.08 } },
      { type: 'saturation', params: { amount: 0.85 } },
    ],
  },
  {
    id: 'vivid',
    label: 'Vivid',
    description: 'Punchy social-media colour.',
    effects: [
      { type: 'saturation', params: { amount: 1.45 } },
      { type: 'contrast', params: { amount: 0.18 } },
      { type: 'sharpen', params: { amount: 1.2 } },
    ],
  },
  {
    id: 'faded',
    label: 'Faded Film',
    description: 'Lifted blacks and muted colour.',
    effects: [
      { type: 'brightness', params: { amount: 0.06 } },
      { type: 'contrast', params: { amount: -0.15 } },
      { type: 'saturation', params: { amount: 0.78 } },
      { type: 'grain', params: { amount: 0.2 } },
    ],
  },
];

/* ------------------------------------------------------------- transitions */

export interface TransitionDefinition {
  type: string;
  label: string;
  description: string;
  group: 'basic' | 'dynamic' | 'glitch';
  /** ffmpeg xfade transition name, when one exists. */
  ffmpeg: string | null;
}

export const TRANSITION_CATALOG: TransitionDefinition[] = [
  { type: 'cut', label: 'Cut', description: 'Hard cut, no transition time.', group: 'basic', ffmpeg: null },
  { type: 'fade', label: 'Fade', description: 'Classic cross dissolve.', group: 'basic', ffmpeg: 'fade' },
  { type: 'fadeblack', label: 'Fade to Black', description: 'Dip to black between scenes.', group: 'basic', ffmpeg: 'fadeblack' },
  { type: 'fadewhite', label: 'Fade to White', description: 'Flash to white between scenes.', group: 'basic', ffmpeg: 'fadewhite' },
  { type: 'wipeleft', label: 'Wipe Left', description: 'Edge wipe across the frame.', group: 'basic', ffmpeg: 'wipeleft' },
  { type: 'wiperight', label: 'Wipe Right', description: 'Edge wipe across the frame.', group: 'basic', ffmpeg: 'wiperight' },
  { type: 'dissolve', label: 'Dissolve', description: 'Pixel dissolve.', group: 'dynamic', ffmpeg: 'dissolve' },
  { type: 'slideleft', label: 'Slide Left', description: 'Second scene slides in.', group: 'dynamic', ffmpeg: 'slideleft' },
  { type: 'slideright', label: 'Slide Right', description: 'Second scene slides in.', group: 'dynamic', ffmpeg: 'slideright' },
  { type: 'slideup', label: 'Slide Up', description: 'Second scene slides in.', group: 'dynamic', ffmpeg: 'slideup' },
  { type: 'circleopen', label: 'Circle Open', description: 'Iris opening.', group: 'dynamic', ffmpeg: 'circleopen' },
  { type: 'radial', label: 'Radial', description: 'Rotating radial wipe.', group: 'dynamic', ffmpeg: 'radial' },
  { type: 'smoothleft', label: 'Smooth Left', description: 'Smooth directional blend.', group: 'dynamic', ffmpeg: 'smoothleft' },
  { type: 'hblur', label: 'Blur Wipe', description: 'Blur-through transition.', group: 'dynamic', ffmpeg: 'hblur' },
  { type: 'glitch', label: 'Digital Glitch', description: 'RGB split flash cut.', group: 'glitch', ffmpeg: null },
  { type: 'cutflash', label: 'Flash Cut', description: 'Single frame of white between scenes.', group: 'glitch', ffmpeg: null },
];

/* ------------------------------------------------------------------ fonts */

export interface FontDefinition {
  id: string;
  label: string;
  family: string;
  category: 'sans' | 'serif' | 'display' | 'mono' | 'arabic';
  weights: number[];
}

export const FONT_CATALOG: FontDefinition[] = [
  { id: 'inter', label: 'Inter', family: 'Inter, "Segoe UI", system-ui, sans-serif', category: 'sans', weights: [400, 600, 800] },
  { id: 'system', label: 'System Sans', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', category: 'sans', weights: [400, 500, 700] },
  { id: 'cinematic', label: 'Cinematic Serif', family: 'Georgia, "Times New Roman", serif', category: 'serif', weights: [400, 700] },
  { id: 'display', label: 'Impact Display', family: 'Impact, "Haettenschweiler", "Arial Black", sans-serif', category: 'display', weights: [700] },
  { id: 'mono', label: 'Terminal Mono', family: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace', category: 'mono', weights: [400, 700] },
  { id: 'arabic', label: 'Noto Naskh Arabic', family: '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma, sans-serif', category: 'arabic', weights: [400, 700] },
];

/* ------------------------------------------------------- sound / music beds */

export interface SfxDefinition {
  id: string;
  label: string;
  category: 'transition' | 'ui' | 'impact' | 'nature';
  description: string;
  /** Procedural recipe — the client synthesises the waveform with WebAudio. */
  recipe: { kind: 'noise-sweep' | 'click' | 'riser' | 'impact' | 'typewriter' | 'shutter' | 'glitch' | 'chime'; durationMs: number };
}

export const SFX_CATALOG: SfxDefinition[] = [
  { id: 'whoosh', label: 'Whoosh', category: 'transition', description: 'Air transition swoosh.', recipe: { kind: 'noise-sweep', durationMs: 700 } },
  { id: 'riser', label: 'Riser', category: 'transition', description: 'Tension build.', recipe: { kind: 'riser', durationMs: 2200 } },
  { id: 'impact', label: 'Impact', category: 'impact', description: 'Deep hit.', recipe: { kind: 'impact', durationMs: 900 } },
  { id: 'click', label: 'Click', category: 'ui', description: 'UI tick.', recipe: { kind: 'click', durationMs: 160 } },
  { id: 'typewriter', label: 'Typewriter', category: 'ui', description: 'Key press.', recipe: { kind: 'typewriter', durationMs: 220 } },
  { id: 'shutter', label: 'Camera Shutter', category: 'ui', description: 'Photo shutter.', recipe: { kind: 'shutter', durationMs: 420 } },
  { id: 'glitch', label: 'Glitch', category: 'transition', description: 'Digital glitch burst.', recipe: { kind: 'glitch', durationMs: 520 } },
  { id: 'chime', label: 'Chime', category: 'ui', description: 'Soft notification.', recipe: { kind: 'chime', durationMs: 1200 } },
];

export interface MusicDefinition {
  id: string;
  label: string;
  bpm: number;
  mood: string;
  description: string;
  /** Chord/scale recipe for the procedural generator. */
  recipe: { root: number; scale: 'minor' | 'dorian' | 'major'; pad: boolean; pulse: boolean };
}

export const MUSIC_CATALOG: MusicDefinition[] = [
  { id: 'ambient-drone', label: 'Ambient Drone', bpm: 70, mood: 'Cosmic / Calm', description: 'Slow evolving pad.', recipe: { root: 55, scale: 'minor', pad: true, pulse: false } },
  { id: 'cinematic-pulse', label: 'Cinematic Pulse', bpm: 90, mood: 'Epic', description: 'Sub pulse with rising strings.', recipe: { root: 45, scale: 'minor', pad: true, pulse: true } },
  { id: 'lofi-chill', label: 'Lo-Fi Chill', bpm: 78, mood: 'Relaxed', description: 'Warm dusty loop.', recipe: { root: 62, scale: 'dorian', pad: true, pulse: true } },
  { id: 'tension-build', label: 'Tension Build', bpm: 120, mood: 'Suspense', description: 'Driving ostinato.', recipe: { root: 49, scale: 'minor', pad: false, pulse: true } },
  { id: 'uplifting', label: 'Uplifting', bpm: 104, mood: 'Positive', description: 'Bright major arpeggio.', recipe: { root: 65, scale: 'major', pad: true, pulse: true } },
];

/* --------------------------------------------------------------- templates */

export interface TemplateDefinition {
  id: string;
  label: string;
  category: 'social' | 'brand' | 'cinematic' | 'tutorial';
  aspect: '16:9' | '9:16' | '1:1';
  description: string;
  durationMs: number;
  swatch: string;
  /** Timeline skeleton created from the template. */
  build: {
    width: number;
    height: number;
    fps: number;
    tracks: { kind: 'video' | 'audio' | 'text'; name: string }[];
    clips: { track: string; kind: 'video' | 'text' | 'audio'; startMs: number; durationMs: number; name: string; text?: string }[];
  };
}

export const TEMPLATE_CATALOG: TemplateDefinition[] = [
  {
    id: 'cinematic-intro',
    label: 'Cinematic Intro',
    category: 'cinematic',
    aspect: '16:9',
    description: 'Title card, slow colour grade, drone bed.',
    durationMs: 12000,
    swatch: '#7c3aed',
    build: {
      width: 1920,
      height: 1080,
      fps: 30,
      tracks: [
        { kind: 'video', name: 'V1 Footage' },
        { kind: 'text', name: 'Titles' },
        { kind: 'audio', name: 'Music' },
      ],
      clips: [
        { track: 'V1 Footage', kind: 'video', startMs: 0, durationMs: 12000, name: 'Scene 01' },
        { track: 'Titles', kind: 'text', startMs: 1200, durationMs: 4000, name: 'Title', text: 'CREATE BEYOND LIMITS' },
        { track: 'Music', kind: 'audio', startMs: 0, durationMs: 12000, name: 'Ambient Drone' },
      ],
    },
  },
  {
    id: 'vertical-reel',
    label: 'Vertical Reel',
    category: 'social',
    aspect: '9:16',
    description: 'Vertical 1080×1920 with hook text and beats.',
    durationMs: 15000,
    swatch: '#22d3ee',
    build: {
      width: 1080,
      height: 1920,
      fps: 30,
      tracks: [
        { kind: 'video', name: 'V1 Footage' },
        { kind: 'text', name: 'Captions' },
        { kind: 'audio', name: 'Music' },
      ],
      clips: [
        { track: 'V1 Footage', kind: 'video', startMs: 0, durationMs: 15000, name: 'Hook' },
        { track: 'Captions', kind: 'text', startMs: 400, durationMs: 3000, name: 'Hook caption', text: 'WAIT FOR IT' },
        { track: 'Captions', kind: 'text', startMs: 6000, durationMs: 3000, name: 'Body', text: 'This changes everything' },
        { track: 'Music', kind: 'audio', startMs: 0, durationMs: 15000, name: 'Lo-Fi Chill' },
      ],
    },
  },
  {
    id: 'product-launch',
    label: 'Product Launch',
    category: 'brand',
    aspect: '16:9',
    description: 'Three-beat product story with spec captions.',
    durationMs: 20000,
    swatch: '#f97316',
    build: {
      width: 1920,
      height: 1080,
      fps: 30,
      tracks: [
        { kind: 'video', name: 'V1 Footage' },
        { kind: 'text', name: 'Titles' },
        { kind: 'audio', name: 'Music' },
      ],
      clips: [
        { track: 'V1 Footage', kind: 'video', startMs: 0, durationMs: 6000, name: 'Scene 01' },
        { track: 'V1 Footage', kind: 'video', startMs: 6000, durationMs: 7000, name: 'Scene 02' },
        { track: 'V1 Footage', kind: 'video', startMs: 13000, durationMs: 7000, name: 'Scene 03' },
        { track: 'Titles', kind: 'text', startMs: 800, durationMs: 3500, name: 'Title', text: 'NEW // 2026' },
        { track: 'Titles', kind: 'text', startMs: 7000, durationMs: 3500, name: 'Spec', text: 'Built for creators' },
        { track: 'Music', kind: 'audio', startMs: 0, durationMs: 20000, name: 'Uplifting' },
      ],
    },
  },
  {
    id: 'tutorial-beats',
    label: 'Tutorial Beats',
    category: 'tutorial',
    aspect: '16:9',
    description: 'Step cards with progress captions.',
    durationMs: 18000,
    swatch: '#f43f5e',
    build: {
      width: 1920,
      height: 1080,
      fps: 30,
      tracks: [
        { kind: 'video', name: 'V1 Screen' },
        { kind: 'text', name: 'Steps' },
        { kind: 'audio', name: 'Music' },
      ],
      clips: [
        { track: 'V1 Screen', kind: 'video', startMs: 0, durationMs: 18000, name: 'Recording' },
        { track: 'Steps', kind: 'text', startMs: 500, durationMs: 4500, name: 'Step 1', text: '1. Import your footage' },
        { track: 'Steps', kind: 'text', startMs: 6000, durationMs: 4500, name: 'Step 2', text: '2. Cut the timeline' },
        { track: 'Steps', kind: 'text', startMs: 11500, durationMs: 4500, name: 'Step 3', text: '3. Export in 4K' },
        { track: 'Music', kind: 'audio', startMs: 0, durationMs: 18000, name: 'Cinematic Pulse' },
      ],
    },
  },
];

/* ----------------------------------------------------------------- helpers */

export function effectDefaults(type: string): Record<string, number | string | boolean> {
  const definition = EFFECT_BY_TYPE[type];
  if (!definition) return {};
  return Object.fromEntries(definition.params.map((param) => [param.key, param.default]));
}
