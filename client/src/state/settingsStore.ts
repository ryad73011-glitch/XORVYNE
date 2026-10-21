import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS } from '@shared/project-ops.js';
import { directionFor, type LanguageCode } from '../lib/i18n.js';

export type ThemeName = 'noir' | 'ember' | 'frost' | 'void';
export type AccentName = 'violet' | 'cyan' | 'amber' | 'rose';

export interface SettingsState {
  theme: ThemeName;
  accent: AccentName;
  reduceMotion: boolean;
  language: LanguageCode;
  defaultWidth: number;
  defaultHeight: number;
  defaultFps: number;
  autoSave: boolean;
  snapToGrid: boolean;
  gridMs: number;
  defaultTransitionMs: number;
  showWaveforms: boolean;
  setTheme: (theme: ThemeName) => void;
  setAccent: (accent: AccentName) => void;
  setReduceMotion: (value: boolean) => void;
  setLanguage: (language: LanguageCode) => void;
  setProjectDefaults: (patch: Partial<Pick<SettingsState, 'defaultWidth' | 'defaultHeight' | 'defaultFps' | 'autoSave' | 'snapToGrid' | 'gridMs' | 'defaultTransitionMs' | 'showWaveforms'>>) => void;
}

function applyDocumentTheme(state: Pick<SettingsState, 'theme' | 'accent' | 'reduceMotion' | 'language'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = state.theme;
  root.dataset.accent = state.accent;
  root.dataset.motion = state.reduceMotion ? 'reduced' : 'full';
  root.lang = state.language;
  root.dir = directionFor(state.language);
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'noir',
      accent: 'violet',
      reduceMotion: false,
      language: 'en',
      defaultWidth: DEFAULT_SETTINGS.width,
      defaultHeight: DEFAULT_SETTINGS.height,
      defaultFps: DEFAULT_SETTINGS.fps,
      autoSave: true,
      snapToGrid: true,
      gridMs: DEFAULT_SETTINGS.gridMs,
      defaultTransitionMs: 700,
      showWaveforms: true,
      setTheme: (theme) => {
        set({ theme });
        applyDocumentTheme({ ...useSettings.getState(), theme });
      },
      setAccent: (accent) => {
        set({ accent });
        applyDocumentTheme({ ...useSettings.getState(), accent });
      },
      setReduceMotion: (reduceMotion) => {
        set({ reduceMotion });
        applyDocumentTheme({ ...useSettings.getState(), reduceMotion });
      },
      setLanguage: (language) => {
        set({ language });
        applyDocumentTheme({ ...useSettings.getState(), language });
      },
      setProjectDefaults: (patch) => set(patch),
    }),
    {
      name: 'xorvyne.settings',
      onRehydrateStorage: () => (state) => {
        if (state) applyDocumentTheme(state);
      },
    },
  ),
);

export function initialiseTheme(): void {
  applyDocumentTheme(useSettings.getState());
}
