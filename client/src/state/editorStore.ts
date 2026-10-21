import { create } from 'zustand';
import {
  MAX_HISTORY_ENTRIES,
  addClip,
  applyOperations,
  createAudioClip,
  createTextClip,
  moveClip,
  projectDuration,
  redo as redoHistory,
  removeClip,
  setEffect,
  setTransition,
  snapshot,
  splitClip,
  trimClip,
  undo as undoHistory,
  updateClip,
} from '@shared/project-ops.js';
import type {
  Clip,
  ClipEffect,
  EditOperation,
  MediaAsset,
  TextOverlay,
  Transition,
  XORVYNEProject,
} from '@shared/types.js';
import { saveProject } from '../storage/repository.js';

export interface EditorState {
  project: XORVYNEProject | null;
  selectedClipId: string | null;
  playheadMs: number;
  isPlaying: boolean;
  historyIndex: number;
  dirty: boolean;
  lastSavedAt: number | null;
  /** Playback rate used by the preview loop. */
  loop: boolean;

  openProject: (project: XORVYNEProject) => void;
  closeProject: () => void;
  select: (clipId: string | null) => void;
  setPlayhead: (ms: number) => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  commit: (label: string, mutator: (project: XORVYNEProject) => XORVYNEProject) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  save: () => Promise<void>;
  markSaved: () => void;

  // Editing operations
  splitSelected: (atMs: number) => void;
  deleteClip: (clipId: string) => void;
  trimSelected: (startMs: number, endMs: number) => void;
  moveClipTo: (clipId: string, startMs: number, trackId?: string) => void;
  duplicateClip: (clipId: string) => void;
  setClipTransition: (clipId: string, transition: Transition | undefined) => void;
  setClipEffect: (clipId: string, effect: ClipEffect) => void;
  setClipText: (clipId: string, text: Partial<TextOverlay>) => void;
  setClipVolume: (clipId: string, volume: number) => void;
  setClipOpacity: (clipId: string, opacity: number) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;
  setTrackHidden: (trackId: string, hidden: boolean) => void;
  addTextToTimeline: (startMs: number, durationMs: number, text: Partial<TextOverlay>) => string | null;
  addAudioToTimeline: (startMs: number, durationMs: number, name: string) => string | null;
  addAssetToTimeline: (asset: MediaAsset, startMs?: number) => string | null;
  applyProposedOperations: (operations: EditOperation[], label: string) => void;
  updateProjectSettings: (patch: Partial<XORVYNEProject['settings']>) => void;
  renameProject: (name: string) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(project: XORVYNEProject, onSaved: () => void): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveProject(project);
      onSaved();
    } catch {
      /* surfaced by the UI through the dirty flag */
    }
  }, 900);
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  selectedClipId: null,
  playheadMs: 0,
  isPlaying: false,
  historyIndex: 0,
  dirty: false,
  lastSavedAt: null,
  loop: true,

  openProject: (project) => {
    const previous = get().project;
    if (previous && previous.id !== project.id && get().dirty) {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      // Flush the previous project before navigation so a quick project switch
      // cannot cancel its pending debounced save.
      void saveProject(previous);
    }
    set({
      project,
      selectedClipId: null,
      playheadMs: 0,
      isPlaying: false,
      historyIndex: project.historyIndex ?? project.history.length,
      dirty: false,
    });
  },

  closeProject: () => {
    const previous = get().project;
    if (previous && get().dirty) {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      void saveProject(previous);
    }
    set({ project: null, selectedClipId: null, isPlaying: false, playheadMs: 0, dirty: false });
  },

  select: (clipId) => set({ selectedClipId: clipId }),

  setPlayhead: (ms) => set({ playheadMs: Math.max(0, ms) }),

  setPlaying: (isPlaying) => set({ isPlaying }),

  setLoop: (loop) => set({ loop }),

  commit: (label, mutator) => {
    const current = get().project;
    if (!current) return;
    const before = snapshot(current);
    const next = mutator(current);
    if (!next || next === current) return;
    const after = snapshot(next);
    const trimmed = current.history.slice(0, get().historyIndex);
    const entry = {
      id: `hist_${Date.now().toString(36)}_${trimmed.length}`,
      label,
      timestamp: Date.now(),
      before,
      after,
    };
    const history = [...trimmed, entry].slice(-MAX_HISTORY_ENTRIES);
    const updated: XORVYNEProject = { ...next, history, historyIndex: history.length, updatedAt: Date.now() };
    set({ project: updated, dirty: true, historyIndex: history.length });
    if (updated.settings.autoSave) {
      scheduleSave(updated, () => set({ dirty: false, lastSavedAt: Date.now() }));
    } else if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  },

  undo: () => {
    const { project, historyIndex } = get();
    if (!project) return;
    const result = undoHistory(project, historyIndex);
    if (!result.undone) return;
    const updatedProject = { ...result.project, history: project.history, historyIndex: result.index };
    set({ project: updatedProject, historyIndex: result.index, dirty: true });
    if (updatedProject.settings.autoSave) {
      scheduleSave(updatedProject, () => set({ dirty: false, lastSavedAt: Date.now() }));
    } else if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  },

  redo: () => {
    const { project, historyIndex } = get();
    if (!project) return;
    const result = redoHistory(project, historyIndex);
    if (!result.redone) return;
    const updatedProject = { ...result.project, history: project.history, historyIndex: result.index };
    set({ project: updatedProject, historyIndex: result.index, dirty: true });
    if (updatedProject.settings.autoSave) {
      scheduleSave(updatedProject, () => set({ dirty: false, lastSavedAt: Date.now() }));
    } else if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  },

  canUndo: () => {
    const { project, historyIndex } = get();
    return !!project && historyIndex > 0 && project.history.length > 0;
  },

  canRedo: () => {
    const { project, historyIndex } = get();
    return !!project && historyIndex < project.history.length;
  },

  save: async () => {
    const project = get().project;
    if (!project) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      await saveProject(project);
      set({ dirty: false, lastSavedAt: Date.now() });
    } catch (error) {
      console.error('Project save failed', error);
    }
  },

  markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

  splitSelected: (atMs) => {
    const { project, selectedClipId } = get();
    if (!project || !selectedClipId) return;
    get().commit('Split clip', (current) => splitClip(current, selectedClipId, atMs));
  },

  deleteClip: (clipId) => {
    get().commit('Delete clip', (current) => removeClip(current, clipId));
    if (get().selectedClipId === clipId) set({ selectedClipId: null });
  },

  trimSelected: (startMs, endMs) => {
    const { selectedClipId } = get();
    if (!selectedClipId) return;
    get().commit('Trim clip', (current) => trimClip(current, selectedClipId, startMs, endMs));
  },

  moveClipTo: (clipId, startMs, trackId) => {
    get().commit('Move clip', (current) => moveClip(current, clipId, startMs, trackId));
  },

  duplicateClip: (clipId) => {
    const { project } = get();
    if (!project) return;
    const source = project.clips.find((clip) => clip.id === clipId);
    if (!source) return;
    get().commit('Duplicate clip', (current) => {
      const copy: Clip = {
        ...source,
        id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${source.name} copy`,
        startMs: source.startMs + source.durationMs,
      };
      return addClip(current, copy);
    });
  },

  setClipTransition: (clipId, transition) => {
    get().commit('Change transition', (current) => setTransition(current, clipId, transition));
  },

  setClipEffect: (clipId, effect) => {
    get().commit('Change effect', (current) => setEffect(current, clipId, effect));
  },

  setClipText: (clipId, text) => {
    const { project } = get();
    if (!project) return;
    const clip = project.clips.find((item) => item.id === clipId);
    if (!clip?.text) return;
    get().commit('Edit text', (current) => updateClip(current, clipId, { text: { ...clip.text!, ...text } }));
  },

  setClipVolume: (clipId, volume) => {
    get().commit('Change volume', (current) => updateClip(current, clipId, { volume }));
  },

  setClipOpacity: (clipId, opacity) => {
    get().commit('Change opacity', (current) => updateClip(current, clipId, { opacity }));
  },

  setClipSpeed: (clipId, speed) => {
    get().commit('Change speed', (current) => {
      const clip = current.clips.find((item) => item.id === clipId);
      if (!clip) return current;
      if (speed <= 0) return current;
      const ratio = (clip.speed || 1) / speed;
      return updateClip(current, clipId, {
        speed,
        durationMs: Math.max(200, Math.round(clip.durationMs * ratio)),
      });
    });
  },

  setTrackMuted: (trackId, muted) => {
    get().commit(muted ? 'Mute track' : 'Unmute track', (current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, muted } : track)),
    }));
  },

  setTrackLocked: (trackId, locked) => {
    get().commit(locked ? 'Lock track' : 'Unlock track', (current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, locked } : track)),
    }));
  },

  setTrackHidden: (trackId, hidden) => {
    get().commit(hidden ? 'Hide track' : 'Show track', (current) => ({
      ...current,
      tracks: current.tracks.map((track) => (track.id === trackId ? { ...track, hidden } : track)),
    }));
  },

  addTextToTimeline: (startMs, durationMs, text) => {
    const { project } = get();
    if (!project) return null;
    const track = project.tracks.find((item) => item.kind === 'text');
    if (!track) return null;
    let created: string | null = null;
    get().commit('Add text', (current) => {
      const clip = createTextClip({ trackId: track.id, startMs, durationMs, text });
      created = clip.id;
      return addClip(current, clip);
    });
    return created;
  },

  addAudioToTimeline: (startMs, durationMs, name) => {
    const { project } = get();
    if (!project) return null;
    const track = project.tracks.find((item) => item.kind === 'audio');
    if (!track) return null;
    let created: string | null = null;
    get().commit('Add audio', (current) => {
      const clip = createAudioClip({ trackId: track.id, startMs, durationMs, name });
      created = clip.id;
      return addClip(current, clip);
    });
    return created;
  },

  addAssetToTimeline: (asset, startMs) => {
    const { project } = get();
    if (!project) return null;
    const kind = asset.kind === 'audio' ? 'audio' : 'video';
    const track = project.tracks.find((item) => item.kind === kind);
    if (!track) return null;
    let created: string | null = null;
    get().commit('Add media', (current) => {
      const clip: Clip = {
        id: `clip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        trackId: track.id,
        assetId: asset.id,
        kind: asset.kind === 'image' ? 'video' : asset.kind,
        name: asset.name,
        startMs: startMs ?? projectDuration(current),
        durationMs: asset.kind === 'image' ? 4000 : Math.max(200, asset.durationMs || 4000),
        inMs: 0,
        outMs: asset.kind === 'image' ? 4000 : asset.durationMs || 4000,
        speed: 1,
        opacity: 1,
        volume: 1,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        swatch: asset.swatch,
      };
      created = clip.id;
      return addClip(current, clip);
    });
    return created;
  },

  applyProposedOperations: (operations, label) => {
    get().commit(label, (current) => applyOperations(current, operations));
  },

  updateProjectSettings: (patch) => {
    get().commit('Project settings', (current) => ({
      ...current,
      settings: { ...current.settings, ...patch },
    }));
  },

  renameProject: (name) => {
    get().commit('Rename project', (current) => ({ ...current, name }));
  },
}));
