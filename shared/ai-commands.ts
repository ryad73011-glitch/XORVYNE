/**
 * Deterministic natural-language command engine.
 *
 * This is the *real* implementation that powers the AI assistant in demo mode:
 * the user's sentence is parsed into structured edit operations that the
 * editor applies locally. It is intentionally deterministic and auditable —
 * a live LLM provider (when configured) can replace it, but the contract
 * between "assistant" and "project model" stays exactly the same.
 */
import {
  type Clip,
  type ClipEffect,
  type EditOperation,
  type MediaAsset,
  type ProjectSettings,
  type ProposedEdit,
  type TextOverlay,
  type Track,
  type Transition,
} from './types.js';
import { EFFECT_BY_TYPE, effectDefaults } from './catalog.js';
import { DEFAULT_TEXT, createId } from './project-ops.js';

export interface CommandContext {
  clips: Clip[];
  tracks: Track[];
  assets: MediaAsset[];
  settings: ProjectSettings;
  selectedClipId?: string | null;
}

export interface ParsedCommand {
  understood: boolean;
  reply: string;
  proposal: ProposedEdit | null;
  warnings: string[];
  suggestions: string[];
}

/* ----------------------------------------------------------- number words */

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, ninety: 90, hundred: 100,
  // French
  un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  // Arabic (transliterated)
  wahid: 1, ithnan: 2, thalatha: 3, arbaa: 4, khamsa: 5, sitta: 6, saba: 7, thamaniya: 8, tisa: 9, ashara: 10,
};

const ARABIC_DIGITS: Record<string, number> = {
  '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9,
};

export function parseNumber(raw: string): number | null {
  const token = raw.trim().toLowerCase().replace(/[.,]$/, '');
  if (token in ARABIC_DIGITS) return ARABIC_DIGITS[token];
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  if (token in WORD_NUMBERS) return WORD_NUMBERS[token];
  return null;
}

const DURATION_UNITS: Record<string, number> = {
  ms: 1, millisecond: 1, milliseconds: 1,
  s: 1000, sec: 1000, secs: 1000, second: 1000, seconds: 1000, seconde: 1000, secondes: 1000, 'ثانية': 1000, 'ثوان': 1000,
  m: 60000, min: 60000, mins: 60000, minute: 60000, minutes: 60000, 'دقيقة': 60000, 'دقائق': 60000,
  h: 3600000, hour: 3600000, hours: 3600000,
};

/** Parses "3", "three", "2.5", "1:30", "00:01:30" into milliseconds. */
export function parseDurationToMs(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (clock) {
    const hours = clock[1] ? Number(clock[1]) : 0;
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3]);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  const numberToken = '(?:\\d+(?:\\.\\d+)?|[a-z\\u00C0-\\u024F\\u0600-\\u06FF]+|\\d)';
  const unitPattern = Object.keys(DURATION_UNITS).sort((a, b) => b.length - a.length).join('|');
  const pattern = new RegExp(`(${numberToken})\\s*(${unitPattern})\\b`, 'gi');
  let total = 0;
  let matched = false;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const value = parseNumber(match[1]);
    if (value === null) continue;
    const unit = DURATION_UNITS[match[2].toLowerCase()];
    if (unit === undefined) continue;
    total += value * unit;
    matched = true;
  }
  if (matched) return Math.round(total);

  const bare = parseNumber(text);
  if (bare !== null) return Math.round(bare * 1000);
  return null;
}

/* ------------------------------------------------------------------ scenes */

export function sceneClipsFrom(clips: Clip[]): Clip[] {
  return clips
    .filter((clip) => clip.kind === 'video' || clip.kind === 'image')
    .sort((a, b) => a.startMs - b.startMs);
}

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6, '7th': 7, '8th': 8, '9th': 9, '10th': 10,
  dernier: -1, last: -1, premiere: 1, premier: 1, '1ère': 1,
};

export function parseOrdinal(raw: string): number | null {
  const token = raw.trim().toLowerCase();
  if (token in ORDINALS) return ORDINALS[token];
  const numeric = parseNumber(token);
  return numeric;
}

interface SceneTarget {
  clip: Clip | null;
  label: string;
}

function resolveScene(context: CommandContext, message: string): SceneTarget {
  const scenes = sceneClipsFrom(context.clips);
  if (scenes.length === 0) return { clip: null, label: 'the timeline' };

  // "this scene" / "this clip" / "the current clip"
  if (/\b(this|current|selected|ce|cette|ه(?:ذا|ـذ)?)\b/.test(message)) {
    const selected = context.selectedClipId ? context.clips.find((clip) => clip.id === context.selectedClipId) : undefined;
    if (selected) return { clip: selected, label: `“${selected.name}”` };
    return { clip: scenes[0], label: `scene 1 (“${scenes[0].name}”)` };
  }

  // "scene two" / "the second scene" / "scene 2"
  const ordinalMatch = message.match(
    /\b(?:scene|shot|clip|step|ص?مشهد|لقطة)\s*\(?(\d+(?:st|nd|rd|th)?|[a-z]+)\)?/i,
  );
  if (ordinalMatch) {
    const index = parseOrdinal(ordinalMatch[1]);
    if (index !== null) {
      const resolved = index === -1 ? scenes.length : index;
      if (resolved >= 1 && resolved <= scenes.length) {
        return { clip: scenes[resolved - 1], label: `scene ${resolved} (“${scenes[resolved - 1].name}”)` };
      }
    }
  }

  const ordinalWordMatch = message.match(
    /\b(the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last)\s+(scene|shot|clip|step)\b/i,
  );
  if (ordinalWordMatch) {
    const index = parseOrdinal(ordinalWordMatch[2]);
    if (index !== null) {
      const resolved = index === -1 ? scenes.length : index;
      if (resolved >= 1 && resolved <= scenes.length) {
        return { clip: scenes[resolved - 1], label: `scene ${resolved} (“${scenes[resolved - 1].name}”)` };
      }
    }
  }

  return { clip: scenes[0], label: `scene 1 (“${scenes[0].name}”)` };
}

function resolveTransition(message: string): Transition | undefined {
  if (/\b(cut|hard cut)\b/i.test(message)) return { type: 'cut', durationMs: 0 };
  if (/\bdissolve\b/i.test(message)) return { type: 'dissolve', durationMs: 700 };
  if (/\bfade\s*to\s*black\b/i.test(message)) return { type: 'fadeblack', durationMs: 800 };
  if (/\bfade\s*to\s*white\b/i.test(message)) return { type: 'fadewhite', durationMs: 600 };
  if (/\bfade\b/i.test(message)) return { type: 'fade', durationMs: 700 };
  if (/\bwipe\b/i.test(message)) return { type: 'wipeleft', durationMs: 700 };
  if (/\bslide\b/i.test(message)) return { type: 'slideleft', durationMs: 700 };
  if (/\bcircle\b|\biris\b/i.test(message)) return { type: 'circleopen', durationMs: 700 };
  if (/\bglitch\b/i.test(message)) return { type: 'glitch', durationMs: 400 };
  if (/\bblur\b/i.test(message)) return { type: 'hblur', durationMs: 600 };
  if (/\bradial\b/i.test(message)) return { type: 'radial', durationMs: 700 };
  return undefined;
}

function languageList(message: string): { languages: string[]; raw: string } {
  const match = message.match(/\b(?:subtitles?|captions?|sous-?titres?|ترجمة|ترجمات|رومان? subtitles?)\b\s*(?:in|à|en|into|ب)?\s*([a-zA-Z؀-ۿ ,]+)/i);
  const raw = match ? match[1].trim() : '';
  if (!raw) return { languages: [], raw: '' };
  const known: Record<string, string> = {
    arabic: 'Arabic', french: 'French', english: 'English', spanish: 'Spanish', german: 'German',
    turkish: 'Turkish', hindi: 'Hindi', urdu: 'Urdu', japanese: 'Japanese', korean: 'Korean',
    chinese: 'Chinese', italian: 'Italian', portuguese: 'Portuguese', russian: 'Russian',
    'العربية': 'Arabic', 'الفرنسية': 'French', 'français': 'French', 'arabe': 'Arabic', 'anglais': 'English',
  };
  const languages: string[] = [];
  const lower = raw.toLowerCase();
  for (const [needle, label] of Object.entries(known)) {
    if (lower.includes(needle) && !languages.includes(label)) languages.push(label);
  }
  if (languages.length === 0) {
    // Fall back to capitalised words as language names.
    for (const part of raw.split(/[,/]| and | et | و/)) {
      const name = part.trim();
      if (name.length > 2) languages.push(name[0].toUpperCase() + name.slice(1));
    }
  }
  return { languages, raw };
}

/* ------------------------------------------------------------------ parser */

interface HandlerResult {
  reply: string;
  operations: EditOperation[];
  details: string[];
  warnings?: string[];
}

type Handler = (message: string, context: CommandContext) => HandlerResult | null;

const handlers: Handler[] = [
  // ---------------------------------------------------------------- trimming
  (message, context) => {
    const trimMatch = message.match(
      /\b(?:trim|remove|cut off|delete|drop|supprimer|retirer)\b\s*(?:the\s+)?(?:first|last)\s+(\d+(?:\.\d+)?|[a-z]+)\s*(seconds?|secondes?|sec|s\b|milliseconds?|ms)?/i,
    );
    if (!trimMatch) return null;
    const amount = trimMatch[2]
      ? parseDurationToMs(`${trimMatch[1]} ${trimMatch[2]}`)
      : parseDurationToMs(`${trimMatch[1]} seconds`);
    if (amount === null || amount <= 0) return null;

    const { clip, label } = resolveScene(context, message);
    if (!clip) {
      return { reply: 'There are no video clips on the timeline yet, so there is nothing to trim.', operations: [], details: [] };
    }
    const isLast = /last|final|dernier/i.test(message);
    if (isLast) {
      const newEnd = clip.startMs + clip.durationMs - amount;
      if (newEnd <= clip.startMs + 200) {
        return { reply: 'That trim is longer than the available footage, so nothing was changed.', operations: [], details: [] };
      }
      return {
        reply: `I can trim ${formatDuration(amount)} from the end of ${label}.`,
        operations: [{ op: 'trimClip', clipId: clip.id, startMs: clip.startMs, endMs: newEnd }],
        details: [`Shorten ${label} by ${formatDuration(amount)}.`],
      };
    }
    const newStart = clip.startMs + amount;
    if (newStart >= clip.startMs + clip.durationMs - 200) {
      return { reply: 'That trim is longer than the available footage, so nothing was changed.', operations: [], details: [] };
    }
    return {
      reply: `I can trim ${formatDuration(amount)} from the start of ${label}.`,
      operations: [{ op: 'trimClip', clipId: clip.id, startMs: newStart, endMs: clip.startMs + clip.durationMs }],
      details: [`Remove the first ${formatDuration(amount)} of ${label}.`],
    };
  },

  // -------------------------------------------------------- trim to a length
  (message, context) => {
    const match = message.match(/\b(?:make|set|keep|reduce to|shorten)\b.*?\b(?:clip|scene|video|it)\b.*?\bto\s+(\d+(?:\.\d+)?|[a-z]+)\s*(seconds?|secondes?|s\b)?/i);
    if (!match) return null;
    const target = match[2] ? parseDurationToMs(`${match[1]} ${match[2]}`) : parseDurationToMs(`${match[1]} seconds`);
    if (target === null) return null;
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected to resize.', operations: [], details: [] };
    return {
      reply: `I can shorten ${label} to ${formatDuration(target)}.`,
      operations: [{ op: 'trimClip', clipId: clip.id, startMs: clip.startMs, endMs: clip.startMs + target }],
      details: [`Set the length of ${label} to ${formatDuration(target)}.`],
    };
  },

  // ----------------------------------------------------------------- split
  (message, context) => {
    const match = message.match(/\b(?:split|cut|break)\b\s*(?:the\s*)?(?:clip|scene|video|it|at)?\s*(?:at|@|around)?\s*(\d+(?:\.\d+)?|[a-z]+)\s*(seconds?|secondes?|s\b|ms|milliseconds?)?/i);
    if (!match) return null;
    const at = match[2] ? parseDurationToMs(`${match[1]} ${match[2]}`) : parseDurationToMs(`${match[1]} seconds`);
    if (at === null) return null;
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected to split.', operations: [], details: [] };
    const absolute = clip.startMs + at;
    if (absolute <= clip.startMs + 200 || absolute >= clip.startMs + clip.durationMs - 200) {
      return {
        reply: `${label} is too short to split at ${formatDuration(at)}.`,
        operations: [],
        details: [],
      };
    }
    return {
      reply: `I can split ${label} at ${formatDuration(at)}.`,
      operations: [{ op: 'splitClip', clipId: clip.id, atMs: absolute }],
      details: [`Split ${label} at ${formatDuration(at)} into two clips.`],
    };
  },

  // ------------------------------------------------------------------ look
  (message, context) => {
    const { clip, label } = resolveScene(context, message);
    if (!clip) return null;

    if (/\b(cinematic|film look|movie look|filmic)\b/i.test(message)) {
      return {
        reply: `I can apply the Cinematic grade to ${label}.`,
        operations: [{ op: 'applyPreset', clipId: clip.id, presetId: 'cinematic' }],
        details: [`Apply the Cinematic preset (contrast, saturation, cool shadows, vignette) to ${label}.`],
      };
    }
    if (/\b(noir|black and white|monochrome|greyscale|grayscale|b&w)\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'grayscale',
        enabled: true,
        params: { ...effectDefaults('grayscale'), amount: 1 },
      };
      return {
        reply: `I can convert ${label} to black & white.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Convert ${label} to monochrome.`],
      };
    }
    if (/\b(vhs|retro|analogue|analog)\b/i.test(message)) {
      return {
        reply: `I can apply the VHS look to ${label}.`,
        operations: [{ op: 'applyPreset', clipId: clip.id, presetId: 'vhs' }],
        details: [`Apply the VHS preset to ${label}.`],
      };
    }
    if (/\bwarmer|warm\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'temperature',
        enabled: true,
        params: { ...effectDefaults('temperature'), amount: 0.4 },
      };
      return {
        reply: `I can warm up ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Shift ${label} towards warm highlights.`],
      };
    }
    if (/\b(cool(er)?|colder|blue(ish)?)\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'temperature',
        enabled: true,
        params: { ...effectDefaults('temperature'), amount: -0.4 },
      };
      return {
        reply: `I can cool down ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Shift ${label} towards cool tones.`],
      };
    }
    if (/\bbrighter\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'brightness',
        enabled: true,
        params: { ...effectDefaults('brightness'), amount: 0.2 },
      };
      return {
        reply: `I can brighten ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Lift the exposure of ${label}.`],
      };
    }
    if (/\bdarker\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'brightness',
        enabled: true,
        params: { ...effectDefaults('brightness'), amount: -0.2 },
      };
      return {
        reply: `I can darken ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Lower the exposure of ${label}.`],
      };
    }
    if (/\bblur(red)?\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'blur',
        enabled: true,
        params: { ...effectDefaults('blur'), amount: 8 },
      };
      return {
        reply: `I can soften ${label} with a blur.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Apply a soft blur to ${label}.`],
      };
    }
    if (/\b(zoom in|push in|ken burns)\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'kenburns',
        enabled: true,
        params: { ...effectDefaults('kenburns'), amount: 1.2 },
      };
      return {
        reply: `I can add a slow push-in to ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Add a Ken Burns push-in to ${label}.`],
      };
    }
    if (/\bfade in\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'fadeIn',
        enabled: true,
        params: { ...effectDefaults('fadeIn'), durationMs: 800 },
      };
      return {
        reply: `I can add a fade-in to ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Add an 800 ms fade-in to ${label}.`],
      };
    }
    if (/\bfade out\b/i.test(message)) {
      const effect: ClipEffect = {
        id: createId('fx'),
        type: 'fadeOut',
        enabled: true,
        params: { ...effectDefaults('fadeOut'), durationMs: 800 },
      };
      return {
        reply: `I can add a fade-out to ${label}.`,
        operations: [{ op: 'setEffect', clipId: clip.id, effect }],
        details: [`Add an 800 ms fade-out to ${label}.`],
      };
    }
    return null;
  },

  // ------------------------------------------------------------ transitions
  (message, context) => {
    if (!/\btransition\b/i.test(message)) return null;
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected to change.', operations: [], details: [] };
    const requestedTransition = resolveTransition(message);
    const transition = requestedTransition ?? { type: 'fade', durationMs: 700 };
    const defaulted = requestedTransition === undefined;
    return {
      reply: defaulted
        ? `I can change the incoming transition of ${label} to a 700 ms Fade. Tell me another style if you prefer.`
        : `I can set the transition of ${label} to ${transition.type}.`,
      operations: [{ op: 'setTransition', clipId: clip.id, transition }],
      details: [`Change the incoming transition of ${label} to “${transition.type}” (${transition.durationMs} ms).`],
      warnings: defaulted ? ['No transition style was named; Fade is a suggested default.'] : [],
    };
  },

  // -------------------------------------------------------------- subtitles
  (message, context) => {
    if (!/\b(subtitles?|captions?|sous-?titres?|ترجمة|ترجمات)\b/i.test(message)) return null;
    const { languages } = languageList(message);
    const textTrack = context.tracks.find((track) => track.kind === 'text');
    if (!textTrack) {
      return { reply: 'This project has no title track, so subtitles cannot be added yet.', operations: [], details: [] };
    }
    const scenes = sceneClipsFrom(context.clips);
    const total = scenes.length > 0
      ? Math.max(...scenes.map((clip) => clip.startMs + clip.durationMs))
      : 5000;
    const operations: EditOperation[] = [];
    const details: string[] = [];
    const targets = languages.length > 0 ? languages : ['English'];
    for (const language of targets) {
      for (const scene of scenes.length > 0 ? scenes : [{ id: '', startMs: 0, durationMs: total, name: 'Timeline' }]) {
        const text: TextOverlay = {
          ...DEFAULT_TEXT,
          content: `[${language}] ${scene.name}`,
          fontSize: 44,
          fontWeight: 600,
          y: 0.86,
          align: 'center',
          background: 'rgba(0,0,0,0.55)',
          shadow: true,
        };
        operations.push({
          op: 'addTextClip',
          trackId: textTrack.id,
          startMs: scene.startMs,
          durationMs: Math.max(500, Math.min(scene.durationMs, 5000)),
          text,
        });
        details.push(`Add a ${language} caption track over ${scene.name}.`);
      }
    }
    return {
      reply: languages.length > 0
        ? `I can add ${languages.join(' and ')} subtitle tracks.`
        : 'I can add a subtitle track — tell me which language(s) and I will place them.',
      operations,
      details,
      warnings: [
        'Automatic transcription needs a speech-to-text provider, which is not configured. The caption clips are editable placeholders.',
      ],
    };
  },

  // ------------------------------------------------------------------ text
  (message, context) => {
    const match = message.match(/\b(?:add|insert|create|place)\b\s+(?:a\s+)?(?:title|text|caption|label)\b\s*(?:that\s+says|reading|saying|:)?\s*["“'«]?([^"”'»]{1,80}?)["”'»]?\s*$/i);
    if (!match) return null;
    const content = match[1].trim();
    if (!content) return null;
    const textTrack = context.tracks.find((track) => track.kind === 'text');
    if (!textTrack) return { reply: 'This project has no title track.', operations: [], details: [] };
    const text: TextOverlay = { ...DEFAULT_TEXT, content, fontSize: 72, fontWeight: 800, uppercase: /[A-Z]/.test(content) && content.length < 30 };
    return {
      reply: `I can add the title “${content}”.`,
      operations: [{ op: 'addTextClip', trackId: textTrack.id, startMs: 500, durationMs: 4000, text }],
      details: [`Add a title reading “${content}” to the title track.`],
    };
  },

  // ------------------------------------------------------------------ speed
  (message, context) => {
    const match = message.match(/\b(slow motion|slow down|speed up|faster|fast forward|double speed|half speed)\b/i);
    if (!match) return null;
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected to re-time.', operations: [], details: [] };
    const speed = /half/i.test(message) ? 0.5 : /slow/i.test(message) ? 0.5 : 2;
    return {
      reply: `I can set ${label} to ${speed}× speed.`,
      operations: [{ op: 'setClipSpeed', clipId: clip.id, speed }],
      details: [`Re-time ${label} to ${speed}×.`],
    };
  },

  // ------------------------------------------------------------------ music
  (message, context) => {
    if (!/\b(music|soundtrack|bgm|track|ambience|ambient|musique|موسيقى)\b/i.test(message)) return null;
    const audioTrack = context.tracks.find((track) => track.kind === 'audio');
    if (!audioTrack) return { reply: 'This project has no audio track.', operations: [], details: [] };
    if (/\bmute\b/i.test(message)) {
      return {
        reply: 'I can mute the audio track.',
        operations: [{ op: 'setTrackMuted', trackId: audioTrack.id, muted: true }],
        details: [`Mute “${audioTrack.name}”.`],
      };
    }
    return {
      reply: 'Use Asset Library → Music to generate and place a real procedural WAV bed. This text parser cannot create audio assets directly yet.',
      operations: [],
      details: [],
    };
  },

  // -------------------------------------------------------------- volume
  (message, context) => {
    const match = message.match(/\b(?:set|change|make|lower|raise|increase|decrease|reduce)\b.*?\bvolume\b\s*(?:of\s+\w+\s+)?(?:to\s+)?(\d+)\s*%?/i);
    if (!match) return null;
    const value = Math.max(0, Math.min(1, Number(match[1]) / 100));
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected.', operations: [], details: [] };
    return {
      reply: `I can set the volume of ${label} to ${Math.round(value * 100)}%.`,
      operations: [{ op: 'setClipVolume', clipId: clip.id, volume: value }],
      details: [`Set the volume of ${label} to ${Math.round(value * 100)}%.`],
    };
  },

  // --------------------------------------------------------------- delete
  (message, context) => {
    if (!/\b(delete|remove|erase|drop)\b/i.test(message)) return null;
    if (/\bclip\b|\bscene\b|\bshot\b/i.test(message)) {
      const { clip, label } = resolveScene(context, message);
      if (!clip) return { reply: 'No clip is selected to delete.', operations: [], details: [] };
      return {
        reply: `I can delete ${label}.`,
        operations: [{ op: 'deleteClip', clipId: clip.id }],
        details: [`Delete ${label} from the timeline.`],
      };
    }
    return null;
  },

  // -------------------------------------------------------------- reorder
  (message, context) => {
    if (!/\b(move|reorder|bring|put|swap)\b/i.test(message)) return null;
    const { clip, label } = resolveScene(context, message);
    if (!clip) return { reply: 'No clip is selected to move.', operations: [], details: [] };
    const scenes = sceneClipsFrom(context.clips);
    const index = scenes.findIndex((scene) => scene.id === clip.id);
    if (/\bto the (start|beginning|front)\b/i.test(message)) {
      return {
        reply: `I can move ${label} to the start of the timeline.`,
        operations: [{ op: 'moveClip', clipId: clip.id, startMs: 0 }],
        details: [`Move ${label} to the beginning.`],
      };
    }
    if (/\bto the end\b/i.test(message)) {
      const end = scenes.length > 0 ? Math.max(...scenes.map((scene) => scene.startMs + scene.durationMs)) : clip.startMs;
      return {
        reply: `I can move ${label} to the end of the timeline.`,
        operations: [{ op: 'moveClip', clipId: clip.id, startMs: end }],
        details: [`Move ${label} to the end.`],
      };
    }
    if (index >= 0 && index < scenes.length - 1) {
      const next = scenes[index + 1];
      return {
        reply: `I can swap ${label} with the scene that follows it.`,
        operations: [
          { op: 'moveClip', clipId: clip.id, startMs: next.startMs },
          { op: 'moveClip', clipId: next.id, startMs: clip.startMs },
        ],
        details: [`Swap ${label} with the following scene.`],
      };
    }
    return { reply: 'Tell me where to move the clip (for example “move scene two to the end”).', operations: [], details: [] };
  },

  // ------------------------------------------------------------- resolution
  (message) => {
    const match = message.match(/\b(?:make|set|change|convert)\b.*?\b(?:vertical|portrait|square|landscape|widescreen|4k|1080p|720p|480p)\b/i);
    if (!match) return null;
    const vertical = /\b(vertical|portrait)\b/i.test(message);
    const square = /\bsquare\b/i.test(message);
    if (vertical) {
      return {
        reply: 'I can switch the project to a vertical 1080×1920 canvas.',
        operations: [{ op: 'setProjectResolution', width: 1080, height: 1920 }],
        details: ['Set the canvas to 1080×1920 (vertical).'],
      };
    }
    if (square) {
      return {
        reply: 'I can switch the project to a square 1080×1080 canvas.',
        operations: [{ op: 'setProjectResolution', width: 1080, height: 1080 }],
        details: ['Set the canvas to 1080×1080 (square).'],
      };
    }
    return {
      reply: 'I can set the project back to 1920×1080 (landscape).',
      operations: [{ op: 'setProjectResolution', width: 1920, height: 1080 }],
      details: ['Set the canvas to 1920×1080 (landscape).'],
    };
  },

  // ------------------------------------------------------------------- fps
  (message) => {
    const match = message.match(/\b(?:set|change|make)\b.*?\b(?:frame\s*rate|fps)\b\s*(?:to\s*)?(\d+)/i);
    if (!match) return null;
    const fps = Number(match[1]);
    if (![24, 25, 30, 50, 60].includes(fps)) {
      return { reply: 'Common frame rates are 24, 25, 30, 50 and 60 fps.', operations: [], details: [] };
    }
    return {
      reply: `I can set the timeline to ${fps} fps.`,
      operations: [{ op: 'setProjectFps', fps }],
      details: [`Set the project frame rate to ${fps} fps.`],
    };
  },
];

export const SUGGESTIONS = [
  'Trim the first three seconds.',
  'Add subtitles in Arabic and French.',
  'Make this scene more cinematic.',
  'Change the transition in scene two only.',
  'Split the clip at 4 seconds.',
  'Set the project to vertical 1080x1920.',
  'Slow down scene two.',
  'Add a title “CREATE BEYOND LIMITS”.',
];

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** Splits a message into independent sentences (decimal safe). */
export function splitSentences(message: string): string[] {
  return message
    .split(/(?<=[.!?؟])\s+(?=[\p{L}\d])/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Parses a natural-language request into a proposal the user can apply.
 */
export function parseCommand(message: string, context: CommandContext): ParsedCommand {
  const trimmed = message.trim();
  if (!trimmed) {
    return { understood: false, reply: 'Tell me what you want to change.', proposal: null, warnings: [], suggestions: SUGGESTIONS };
  }

  const sentences = splitSentences(trimmed);
  const operations: EditOperation[] = [];
  const details: string[] = [];
  const warnings: string[] = [];
  const replies: string[] = [];
  let matchedAny = false;

  for (const sentence of sentences) {
    let handled = false;
    for (const handler of handlers) {
      const result = handler(sentence, context);
      if (!result) continue;
      handled = true;
      matchedAny = true;
      if (result.reply) replies.push(result.reply);
      operations.push(...result.operations);
      details.push(...result.details);
      if (result.warnings) warnings.push(...result.warnings);
      break;
    }
    if (!handled) {
      // No handler matched this sentence — keep looking for a partial match.
      const partial = handlers
        .map((handler) => handler(sentence, context))
        .find((result): result is HandlerResult => result !== null && result.operations.length > 0);
      if (partial) {
        matchedAny = true;
        if (partial.reply) replies.push(partial.reply);
        operations.push(...partial.operations);
        details.push(...partial.details);
        if (partial.warnings) warnings.push(...partial.warnings);
      }
    }
  }

  if (!matchedAny) {
    return {
      understood: false,
      reply:
        'I did not recognise that request yet. In demo mode I can trim, split, delete, re-time, re-grade, restyle transitions, add titles, add subtitle tracks, add music and change the canvas or frame rate.',
      proposal: null,
      warnings: [],
      suggestions: SUGGESTIONS,
    };
  }

  if (operations.length === 0) {
    return {
      understood: true,
      reply: replies.join(' ') || 'I understood the request, but there is nothing to change yet.',
      proposal: null,
      warnings,
      suggestions: SUGGESTIONS,
    };
  }

  const proposal: ProposedEdit = {
    id: createId('prop'),
    intent: operations[0].op,
    summary: details[0] ?? replies[0] ?? 'Proposed edit',
    details,
    operations,
    warnings,
  };

  return {
    understood: true,
    reply: replies.join(' ') || 'Here is a proposed change.',
    proposal,
    warnings,
    suggestions: SUGGESTIONS,
  };
}

/** Human readable list of the effect types the assistant can toggle. */
export const ASSISTANT_EFFECTS = Object.keys(EFFECT_BY_TYPE);
