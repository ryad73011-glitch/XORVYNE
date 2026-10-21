/**
 * XORVYNE shared domain model.
 *
 * These types describe the *project* (intent) and never the *rendering engine*.
 * The browser preview, the ffmpeg export pipeline and any future cloud renderer
 * all consume this same model, so a project saved today can be rendered later
 * by a different backend without migrating the timeline.
 */

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ assets */

export type AssetKind = 'video' | 'image' | 'audio';

export type AssetSource =
  | { type: 'local'; storageKey: string }
  | { type: 'uploaded'; uploadToken: string }
  | { type: 'generated'; generator: string; params: Record<string, string | number | boolean> };

export type AssetStatus = 'ready' | 'processing' | 'error';

export interface MediaAsset {
  id: string;
  name: string;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  /** Intrinsic duration in ms. 0 for still images. */
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  status: AssetStatus;
  errorMessage?: string;
  /** Swatch used by the timeline / library when no thumbnail is available. */
  swatch: string;
  source: AssetSource;
  createdAt: number;
}

/* ------------------------------------------------------------------ tracks */

export type TrackKind = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  order: number;
  muted: boolean;
  locked: boolean;
  hidden: boolean;
  height: number;
}

/* ------------------------------------------------------------------- clips */

export type ClipKind = 'video' | 'image' | 'audio' | 'text';

export interface Transform {
  x: number; // -1..1 relative to frame
  y: number;
  scale: number; // 1 = fit
  rotation: number; // degrees
  opacity: number; // 0..1
}

export interface TextOverlay {
  content: string;
  fontFamily: string;
  fontSize: number; // px at 1080p reference height
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  x: number; // 0..1 relative position
  y: number;
  uppercase: boolean;
  letterSpacing: number;
  shadow: boolean;
  background: string | null;
}

export interface Transition {
  type: string;
  durationMs: number;
}

export interface ClipEffect {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export interface Clip {
  id: string;
  trackId: string;
  assetId?: string;
  kind: ClipKind;
  name: string;
  /** Timeline position of the clip start, in ms. */
  startMs: number;
  /** Timeline duration of the clip, in ms. */
  durationMs: number;
  /** Source in-point (trim head), in ms, relative to the source asset. */
  inMs: number;
  /** Source out-point (trim tail), in ms, relative to the source asset. */
  outMs: number;
  speed: number;
  opacity: number;
  volume: number;
  transform: Transform;
  effects: ClipEffect[];
  transitionIn?: Transition;
  text?: TextOverlay;
  /** Flat colour used for generated placeholders / colour cards. */
  swatch: string;
}

/* ---------------------------------------------------------------- project */

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  sampleRate: number;
  /** Grid used for snapping while dragging clips. */
  gridMs: number;
  snapToGrid: boolean;
  /** Timeline zoom in px per second. */
  zoom: number;
  autoSave: boolean;
}

export interface ProjectMeta {
  createdFrom: 'blank' | 'template' | 'ai' | 'import';
  templateId?: string;
  aiWorkflow?: 'text-to-video' | 'image-to-video' | 'edit-existing';
  notes?: string;
}

export interface ProjectSnapshot {
  name: string;
  settings: ProjectSettings;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  meta: ProjectMeta;
}

export interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  /** State *before* the operation, used to undo. */
  before: ProjectSnapshot;
  /** State *after* the operation, used to redo. */
  after: ProjectSnapshot;
}

export interface XORVYNEProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
  settings: ProjectSettings;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  history: HistoryEntry[];
  /** Cursor inside the undo/redo history when this project was last saved. */
  historyIndex?: number;
  meta: ProjectMeta;
}

/** Lightweight record used by the projects library. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  clipCount: number;
  trackCount: number;
  thumbnail: string | null;
  createdFrom: ProjectMeta['createdFrom'];
}

/* -------------------------------------------------------------- ai shared */

/** Modes a provider can run in. `demo` never touches a paid API. */
export type ProviderMode = 'demo' | 'live' | 'unavailable';

export interface ProviderInfo {
  id: string;
  label: string;
  mode: ProviderMode;
  /** Human readable explanation shown in the UI. */
  detail: string;
  /** True when the provider requires a paid/third-party credential. */
  requiresCredentials: boolean;
}

export interface ProposedEdit {
  /** Stable id of the proposal (used for apply/cancel). */
  id: string;
  /** Short machine-ish intent, e.g. `trim` / `transition` / `text`. */
  intent: string;
  /** Human readable, one line per change. */
  summary: string;
  /** Long form explanation of what will happen. */
  details: string[];
  /** Operations applied to the project when the user confirms. */
  operations: EditOperation[];
  /** Effects that could not be honoured (e.g. a missing provider). */
  warnings: string[];
}

/**
 * A single, serialisable mutation of the project model.
 * The client applies these locally — the server never mutates a project.
 */
export type EditOperation =
  | { op: 'trimClip'; clipId: string; startMs: number; endMs: number }
  | { op: 'splitClip'; clipId: string; atMs: number }
  | { op: 'deleteClip'; clipId: string }
  | { op: 'moveClip'; clipId: string; startMs: number; trackId?: string }
  | { op: 'setClipSpeed'; clipId: string; speed: number }
  | { op: 'setTransition'; clipId: string; transition: Transition }
  | { op: 'setEffect'; clipId: string; effect: ClipEffect }
  | { op: 'applyPreset'; clipId: string; presetId: string }
  | { op: 'addTextClip'; trackId: string; startMs: number; durationMs: number; text: TextOverlay }
  | { op: 'addAudioClip'; trackId: string; startMs: number; durationMs: number; name: string; swatch: string }
  | { op: 'setClipVolume'; clipId: string; volume: number }
  | { op: 'setTrackMuted'; trackId: string; muted: boolean }
  | { op: 'setProjectResolution'; width: number; height: number }
  | { op: 'setProjectFps'; fps: number };

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
  /** Set when the assistant produced an applicable proposal. */
  proposal?: ProposedEdit;
  status?: 'pending' | 'applied' | 'cancelled' | 'failed';
  mode?: ProviderMode;
}

export interface CommandRequest {
  message: string;
  project: {
    id: string;
    name: string;
    settings: ProjectSettings;
    tracks: Track[];
    clips: Clip[];
    assets: MediaAsset[];
    /** Clip the user has selected, so “this scene” can be resolved. */
    selectedClipId?: string | null;
  };
  conversation?: { role: 'user' | 'assistant'; text: string }[];
}

export interface CommandResponse {
  reply: string;
  proposal: ProposedEdit | null;
  mode: ProviderMode;
  provider: string;
  /** True when the command could not be understood. */
  understood: boolean;
  suggestions: string[];
}

export interface StoryboardShot {
  index: number;
  title: string;
  description: string;
  durationMs: number;
  prompt: string;
  cameraNote: string;
}

export interface TextToVideoPlan {
  mode: ProviderMode;
  provider: string;
  title: string;
  summary: string;
  shots: StoryboardShot[];
  stylePreset: string;
  musicSuggestion: string;
  /** True when a provider produced real footage instead of a storyboard. */
  footageGenerated: boolean;
  notes: string[];
}

export interface ImageToVideoPlan {
  mode: ProviderMode;
  provider: string;
  summary: string;
  motion: string;
  durationMs: number;
  cameraMoves: string[];
  styleNotes: string[];
  footageGenerated: boolean;
  notes: string[];
}

export interface VideoAnalysis {
  mode: ProviderMode;
  provider: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  sizeBytes: number;
  /** Loudness / black-frame style signals, when measurable. */
  signals: { name: string; value: string }[];
  notes: string[];
}

/* ------------------------------------------------------------------ export */

export type ExportFormat = 'mp4' | 'webm';
export type ExportResolution = 'source' | '1080p' | '720p' | '480p' | 'vertical';
export type ExportFrameRate = 'source' | '24' | '30' | '60';

export interface ExportSettings {
  format: ExportFormat;
  resolution: ExportResolution;
  fps: ExportFrameRate;
  /** 0 = draft, 1 = best. Mapped to a CRF value by the server. */
  quality: number;
  includeAudio: boolean;
  fileName: string;
}

export type ExportJobStatus = 'queued' | 'preparing' | 'rendering' | 'complete' | 'failed' | 'cancelled';

export interface ExportJob {
  id: string;
  status: ExportJobStatus;
  progress: number; // 0..1
  message: string;
  createdAt: number;
  finishedAt?: number;
  errorMessage?: string;
  fileName?: string;
  fileSizeBytes?: number;
  downloadUrl?: string;
  durationMs?: number;
  /** True when a real encoder produced the file. */
  realRender: boolean;
  logTail: string[];
}
