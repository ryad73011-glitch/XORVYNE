import { create } from 'zustand';
import type { ProjectSummary } from '@shared/types.js';
import {
  createProject as createProjectRecord,
  removeProject as deleteProjectRecord,
  listProjects,
  renameProject as renameProjectRecord,
} from '../storage/repository.js';
import { useSettings } from './settingsStore.js';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface AppState {
  projects: ProjectSummary[];
  status: LoadState;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (name?: string) => Promise<string>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setError: (message: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  projects: [],
  status: 'idle',
  error: null,

  refresh: async () => {
    set({ status: 'loading', error: null });
    try {
      const projects = await listProjects();
      set({ projects, status: 'ready' });
    } catch (error) {
      set({
        status: 'error',
        error:
          error instanceof Error
            ? error.message
            : 'The local project library could not be read. Private browsing can block local storage.',
      });
    }
  },

  createProject: async (name) => {
    try {
      const defaults = useSettings.getState();
      const project = await createProjectRecord(name, {
        width: defaults.defaultWidth,
        height: defaults.defaultHeight,
        fps: defaults.defaultFps,
        autoSave: defaults.autoSave,
        snapToGrid: defaults.snapToGrid,
        gridMs: defaults.gridMs,
      });
      await get().refresh();
      return project.id;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'The project could not be created.' });
      throw error;
    }
  },

  renameProject: async (id, name) => {
    try {
      await renameProjectRecord(id, name);
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'The project could not be renamed.' });
    }
  },

  deleteProject: async (id) => {
    try {
      await deleteProjectRecord(id);
      await get().refresh();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'The project could not be deleted.' });
    }
  },

  setError: (message) => set({ error: message }),
}));
