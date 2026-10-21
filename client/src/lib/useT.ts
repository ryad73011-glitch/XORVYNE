import { useSettings } from '../state/settingsStore.js';
import { translate, type LanguageCode } from './i18n.js';

/** Translation hook bound to the active language. */
export function useT(): (key: string, fallback?: string) => string {
  const language = useSettings((state) => state.language);
  return (key: string, fallback?: string) => translate(language as LanguageCode, key, fallback);
}
