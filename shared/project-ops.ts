/**
 * Pure, engine-independent project operations.
 *
 * Every mutation returns a *new* project object so the editor can implement
 * undo/redo with snapshots and React can rely on referential equality.
 */
import {
  SCHEMA_VERSION,
  type Clip,
  type ClipEffect,
  type EditOperation,
  type HistoryEntry,
  type MediaAsset,
  type ProjectSettings,
  type ProjectSnapshot,
  type TextOverlay,
  type Track,
  type Transition,
  type XORVYNEProject,
} from './types.js';
import { STYLE_PRESETS, effectDefaults } from './catalog.js';

export const MIN_CLIP_DURATION_MS = 200;
export const MAX_HISTORY_ENTRIES = 40;

let idCounter = 0;
/** Deterministic-ish unique id. Uses crypto when available. */
export function createId(prefix = 'id'): string {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (globalCrypto?.randomUUID) return `${prefix}_${globalCrypto.randomUUID().slice(0, 8)}`;
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  backgroundColor: '#000000',
  sampleRate: 48000,
  gridMs: 500,
  snapToGrid: true,
  zoom: 60,
  autoSave: true,
};

export const DEFAULT_TEXT: TextOverlay = {
  content: 'Your text',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontSize: 64,
  fontWeight: 700,
  color: '#ffffff',
  align: 'center',
  x: 0.5,
  y: 0.5,
  uppercase: false,
  letterSpacing: 0,
  shadow: true,
  background: null,
};

export function createEmptyProject(name = 'Untitled Project', overrides: Partial<ProjectSettings> = {}): XORVYNEProject {
  const now = Date.now();
  const settings: ProjectSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const videoTrack: Track = {
    id: createId('trk'),
    kind: 'video',
    name: 'V1 Footage',
    order: 0,
    muted: false,
    locked: false,
    hidden: false,
    height: 64,
  };
  const textTrack: Track = {
    id: createId('trk'),
    kind: 'text',
    name: 'T1 Titles',
    order: 1,
    muted: false,
    locked: false,
    hidden: false,
    height: 48,
  };
  const audioTrack: Track = {
    id: createId('trk'),
    kind: 'audio',
    name: 'A1 Music',
    order: 2,
    muted: false,
    locked: false,
    hidden: false,
    height: 56,
  };
  return {
    id: createId('prj'),
    name,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    settings,
    assets: [],
    tracks: [videoTrack, textTrack, audioTrack],
    clips: [],
    history: [],
    historyIndex: 0,
    meta: { createdFrom: 'blank' },
  };
}

export function cloneProject(project: XORVYNEProject): XORVYNEProject {
  return {
    ...project,
    settings: { ...project.settings },
    assets: project.assets.map((asset) => ({ ...asset })),
    tracks: project.tracks.map((track) => ({ ...track })),
    clips: project.clips.map((clip) => ({
      ...clip,
      transform: { ...clip.transform },
      effects: clip.effects.map((effect) => ({ ...effect, params: { ...effect.params } })),
      transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined,
      text: clip.text ? { ...clip.text } : undefined,
    })),
    history: [],
  };
}

export function snapshot(project: XORVYNEProject): ProjectSnapshot {
  return {
    name: project.name,
    settings: { ...project.settings },
    assets: project.assets.map((asset) => ({ ...asset })),
    tracks: project.tracks.map((track) => ({ ...track })),
    clips: project.clips.map((clip) => ({
      ...clip,
      transform: { ...clip.transform },
      effects: clip.effects.map((effect) => ({ ...effect, params: { ...effect.params } })),
      transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined,
      text: clip.text ? { ...clip.text } : undefined,
    })),
    meta: { ...project.meta },
  };
}

export function restoreSnapshot(project: XORVYNEProject, snap: ProjectSnapshot): XORVYNEProject {
  return {
    ...project,
    name: snap.name,
    settings: { ...snap.settings },
    assets: snap.assets.map((asset) => ({ ...asset })),
    tracks: snap.tracks.map((track) => ({ ...track })),
    clips: snap.clips.map((clip) => ({
      ...clip,
      transform: { ...clip.transform },
      effects: clip.effects.map((effect) => ({ ...effect, params: { ...effect.params } })),
      transitionIn: clip.transitionIn ? { ...clip.transitionIn } : undefined,
      text: clip.text ? { ...clip.text } : undefined,
    })),
    meta: { ...snap.meta },
    updatedAt: Date.now(),
  };
}

export function projectDuration(project: XORVYNEProject): number {
  return project.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
}

export function clipEnd(clip: Clip): number {
  return clip.startMs + clip.durationMs;
}

export function findClip(project: XORVYNEProject, clipId: string): Clip | undefined {
  return project.clips.find((clip) => clip.id === clipId);
}

export function findTrack(project: XORVYNEProject, trackId: string): Track | undefined {
  return project.tracks.find((track) => track.id === trackId);
}

export function trackOf(project: XORVYNEProject, clip: Clip): Track | undefined {
  return findTrack(project, clip.trackId);
}

export function clipsOnTrack(project: XORVYNEProject, trackId: string): Clip[] {
  return project.clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.startMs - b.startMs);
}

/** Video clips in timeline order — used to address "scene 2". */
export function sceneClips(project: XORVYNEProject): Clip[] {
  return project.clips
    .filter((clip) => clip.kind === 'video' || clip.kind === 'image')
    .sort((a, b) => a.startMs - b.startMs);
}

export function addTrack(project: XORVYNEProject, kind: Track['kind'], name?: string): { project: XORVYNEProject; track: Track } {
  const prefix = kind === 'video' ? 'V' : kind === 'audio' ? 'A' : 'T';
  const count = project.tracks.filter((track) => track.kind === kind).length + 1;
  const track: Track = {
    id: createId('trk'),
    kind,
    name: name ?? `${prefix}${count} ${kind === 'video' ? 'Footage' : kind === 'audio' ? 'Audio' : 'Titles'}`,
    order: project.tracks.length,
    muted: false,
    locked: false,
    hidden: false,
    height: kind === 'text' ? 48 : 60,
  };
  return { project: { ...project, tracks: [...project.tracks, track] }, track };
}

export function addAsset(project: XORVYNEProject, asset: MediaAsset): XORVYNEProject {
  return { ...project, assets: [...project.assets, asset], updatedAt: Date.now() };
}

export function addClip(project: XORVYNEProject, clip: Clip): XORVYNEProject {
  return { ...project, clips: [...project.clips, clip], updatedAt: Date.now() };
}

export function updateClip(project: XORVYNEProject, clipId: string, patch: Partial<Clip>): XORVYNEProject {
  return {
    ...project,
    clips: project.clips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip)),
    updatedAt: Date.now(),
  };
}

export function removeClip(project: XORVYNEProject, clipId: string): XORVYNEProject {
  return { ...project, clips: project.clips.filter((clip) => clip.id !== clipId), updatedAt: Date.now() };
}

/**
 * Splits a clip in two at an absolute timeline position.
 * The right-hand part keeps the transition of the original clip.
 */
export function splitClip(project: XORVYNEProject, clipId: string, atMs: number): XORVYNEProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;
  const relative = atMs - clip.startMs;
  if (relative < MIN_CLIP_DURATION_MS || relative > clip.durationMs - MIN_CLIP_DURATION_MS) return project;

  const left: Clip = {
    ...clip,
    durationMs: relative,
    outMs: clip.inMs + relative * clip.speed,
  };
  const right: Clip = {
    ...clip,
    id: createId('clip'),
    name: `${clip.name} (2)`,
    startMs: atMs,
    durationMs: clip.durationMs - relative,
    inMs: clip.inMs + relative * clip.speed,
    transitionIn: undefined,
  };
  return {
    ...project,
    clips: project.clips.flatMap((existing) => (existing.id === clipId ? [left, right] : [existing])),
    updatedAt: Date.now(),
  };
}

/**
 * Trims a clip. `newStart`/`newEnd` are absolute timeline positions.
 * The source in/out points are updated so the visible content stays aligned.
 */
export function trimClip(project: XORVYNEProject, clipId: string, newStart: number, newEnd: number): XORVYNEProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;
  const asset = clip.assetId ? project.assets.find((item) => item.id === clip.assetId) : undefined;
  const maxSource = asset && asset.durationMs > 0 ? asset.durationMs : Number.POSITIVE_INFINITY;

  const durationMs = Math.max(MIN_CLIP_DURATION_MS, newEnd - newStart);
  let inMs = clip.inMs + Math.max(0, newStart - clip.startMs) * clip.speed;
  if (asset && asset.durationMs > 0) {
    inMs = Math.max(0, Math.min(inMs, maxSource - durationMs * clip.speed));
  }
  const outMs = inMs + durationMs * clip.speed;
  return updateClip(project, clipId, { startMs: newStart, durationMs, inMs, outMs });
}

export function moveClip(project: XORVYNEProject, clipId: string, startMs: number, trackId?: string): XORVYNEProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;
  const target = trackId ? findTrack(project, trackId) : undefined;
  if (target?.locked) return project;
  const start = Math.max(0, startMs);
  // If the target track cannot host this kind of clip, keep the original track.
  const compatible = !target || kindMatchesTrack(clip.kind, target.kind);
  return updateClip(project, clipId, {
    startMs: start,
    trackId: compatible ? target?.id ?? clip.trackId : clip.trackId,
  });
}

export function kindMatchesTrack(clipKind: Clip['kind'], trackKind: Track['kind']): boolean {
  if (clipKind === 'text') return trackKind === 'text';
  if (clipKind === 'audio') return trackKind === 'audio';
  return trackKind === 'video';
}

export function setTransition(project: XORVYNEProject, clipId: string, transition: Transition | undefined): XORVYNEProject {
  return updateClip(project, clipId, { transitionIn: transition });
}

export function setEffect(project: XORVYNEProject, clipId: string, effect: ClipEffect): XORVYNEProject {
  const clip = findClip(project, clipId);
  if (!clip) return project;
  const others = clip.effects.filter((item) => item.type !== effect.type);
  const next = [...others, effect];
  return updateClip(project, clipId, { effects: next });
}

export function applyPreset(project: XORVYNEProject, clipId: string, presetId: string): XORVYNEProject {
  const preset = STYLE_PRESETS.find((item) => item.id === presetId);
  const clip = findClip(project, clipId);
  if (!preset || !clip) return project;
  const effects: ClipEffect[] = preset.effects.map((effect) => ({
    id: createId('fx'),
    type: effect.type,
    enabled: true,
    params: { ...effectDefaults(effect.type), ...effect.params },
  }));
  return updateClip(project, clipId, { effects });
}

export function createTextClip(input: {
  trackId: string;
  startMs: number;
  durationMs: number;
  text: Partial<TextOverlay>;
  name?: string;
}): Clip {
  return {
    id: createId('clip'),
    trackId: input.trackId,
    kind: 'text',
    name: input.name ?? 'Text',
    startMs: Math.max(0, input.startMs),
    durationMs: Math.max(MIN_CLIP_DURATION_MS, input.durationMs),
    inMs: 0,
    outMs: 0,
    speed: 1,
    opacity: 1,
    volume: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    text: { ...DEFAULT_TEXT, ...input.text },
    swatch: '#7c3aed',
  };
}

export function createAudioClip(input: {
  trackId: string;
  startMs: number;
  durationMs: number;
  name: string;
  swatch?: string;
}): Clip {
  return {
    id: createId('clip'),
    trackId: input.trackId,
    kind: 'audio',
    name: input.name,
    startMs: Math.max(0, input.startMs),
    durationMs: Math.max(MIN_CLIP_DURATION_MS, input.durationMs),
    inMs: 0,
    outMs: input.durationMs,
    speed: 1,
    opacity: 1,
    volume: 0.8,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    swatch: input.swatch ?? '#22d3ee',
  };
}

export function createMediaClip(input: {
  trackId: string;
  asset: MediaAsset;
  startMs: number;
  durationMs?: number;
}): Clip {
  const durationMs = input.durationMs ?? Math.max(MIN_CLIP_DURATION_MS, input.asset.durationMs || 4000);
  return {
    id: createId('clip'),
    trackId: input.trackId,
    assetId: input.asset.id,
    kind: input.asset.kind === 'audio' ? 'audio' : input.asset.kind,
    name: input.asset.name,
    startMs: Math.max(0, input.startMs),
    durationMs,
    inMs: 0,
    outMs: durationMs,
    speed: 1,
    opacity: 1,
    volume: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    swatch: input.asset.swatch,
  };
}

/**
 * Applies a list of serialised operations (produced by the AI assistant) to a
 * project. Returns the mutated project — the caller decides whether to commit
 * it to the undo stack.
 */
export function applyOperations(project: XORVYNEProject, operations: EditOperation[]): XORVYNEProject {
  let next = project;
  for (const operation of operations) {
    switch (operation.op) {
      case 'trimClip': {
        next = trimClip(next, operation.clipId, operation.startMs, operation.endMs);
        break;
      }
      case 'splitClip': {
        next = splitClip(next, operation.clipId, operation.atMs);
        break;
      }
      case 'deleteClip': {
        next = removeClip(next, operation.clipId);
        break;
      }
      case 'moveClip': {
        next = moveClip(next, operation.clipId, operation.startMs, operation.trackId);
        break;
      }
      case 'setClipSpeed': {
        const clip = findClip(next, operation.clipId);
        if (clip && operation.speed > 0) {
          const ratio = (clip.speed || 1) / operation.speed;
          next = updateClip(next, operation.clipId, {
            speed: operation.speed,
            durationMs: Math.max(MIN_CLIP_DURATION_MS, Math.round(clip.durationMs * ratio)),
          });
        }
        break;
      }
      case 'setTransition': {
        next = setTransition(next, operation.clipId, operation.transition);
        break;
      }
      case 'setEffect': {
        next = setEffect(next, operation.clipId, operation.effect);
        break;
      }
      case 'applyPreset': {
        next = applyPreset(next, operation.clipId, operation.presetId);
        break;
      }
      case 'addTextClip': {
        next = addClip(next, createTextClip({
          trackId: operation.trackId,
          startMs: operation.startMs,
          durationMs: operation.durationMs,
          text: operation.text,
        }));
        break;
      }
      case 'addAudioClip': {
        next = addClip(next, createAudioClip({
          trackId: operation.trackId,
          startMs: operation.startMs,
          durationMs: operation.durationMs,
          name: operation.name,
          swatch: operation.swatch,
        }));
        break;
      }
      case 'setClipVolume': {
        next = updateClip(next, operation.clipId, { volume: operation.volume });
        break;
      }
      case 'setTrackMuted': {
        next = {
          ...next,
          tracks: next.tracks.map((track) => (track.id === operation.trackId ? { ...track, muted: operation.muted } : track)),
        };
        break;
      }
      case 'setProjectResolution': {
        next = { ...next, settings: { ...next.settings, width: operation.width, height: operation.height } };
        break;
      }
      case 'setProjectFps': {
        next = { ...next, settings: { ...next.settings, fps: operation.fps } };
        break;
      }
      default: {
        break;
      }
    }
  }
  return { ...next, updatedAt: Date.now() };
}

/* -------------------------------------------------------------- undo/redo */

export function pushHistory(project: XORVYNEProject, label: string, before: ProjectSnapshot, after: ProjectSnapshot): XORVYNEProject {
  const entry: HistoryEntry = { id: createId('hist'), label, timestamp: Date.now(), before, after };
  const history = [...project.history, entry].slice(-MAX_HISTORY_ENTRIES);
  return { ...project, history };
}

/**
 * Undo/redo is index based: the history log keeps every operation and the
 * editor stores the current position inside it. Undo walks one step back,
 * redo walks one step forward. Nothing is ever dropped, so a redo is always
 * available until a new operation truncates the forward branch.
 */
export function canUndo(history: HistoryEntry[], index: number): boolean {
  return index > 0 && history.length > 0;
}

export function canRedo(history: HistoryEntry[], index: number): boolean {
  return index < history.length;
}

export function undo(project: XORVYNEProject, index: number): { project: XORVYNEProject; index: number; undone: HistoryEntry | null } {
  if (!canUndo(project.history, index)) return { project, index, undone: null };
  const entry = project.history[index - 1];
  const restored = restoreSnapshot(project, entry.before);
  return { project: restored, index: index - 1, undone: entry };
}

export function redo(project: XORVYNEProject, index: number): { project: XORVYNEProject; index: number; redone: HistoryEntry | null } {
  if (!canRedo(project.history, index)) return { project, index, redone: null };
  const entry = project.history[index];
  const restored = restoreSnapshot(project, entry.after);
  return { project: restored, index: index + 1, redone: entry };
}
