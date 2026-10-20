import { useCallback, useRef, useState } from 'react';
import { addAsset, createId } from '@shared/project-ops.js';
import type { MediaAsset } from '@shared/types.js';
import { swatchForKind, validateMediaFile } from '../../storage/db.js';
import { storeMediaBlob } from '../../storage/repository.js';
import { probeMedia } from '../../lib/mediaCache.js';
import { useEditor } from '../../state/editorStore.js';

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

/**
 * Imports local files into the project: the bytes are stored in IndexedDB and
 * a metadata asset + timeline clip are created. Nothing is uploaded.
 */
export function useMediaImport() {
  const project = useEditor((state) => state.project);
  const commit = useEditor((state) => state.commit);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const importFiles = useCallback(
    async (files: FileList | File[]): Promise<ImportResult> => {
      const list = Array.from(files);
      const result: ImportResult = { imported: 0, failed: 0, errors: [] };
      if (!project) {
        result.errors.push('Open a project before importing media.');
        return result;
      }
      if (list.length === 0) return result;

      setBusy(true);
      try {
        for (const [index, file] of list.entries()) {
          setProgress(`Importing ${index + 1}/${list.length}…`);
          const validation = validateMediaFile(file);
          if (!validation.ok || !validation.kind) {
            result.failed += 1;
            result.errors.push(validation.error ?? 'Unsupported file.');
            continue;
          }
          try {
            const probe = await probeMedia(file, validation.kind);
            const storageKey = await storeMediaBlob(file, file.name, file.type);
            const asset: MediaAsset = {
              id: createId('asset'),
              name: file.name,
              kind: validation.kind,
              mimeType: file.type || 'application/octet-stream',
              sizeBytes: file.size,
              durationMs: probe.durationMs,
              width: probe.width,
              height: probe.height,
              hasAudio: validation.kind === 'audio' ? true : probe.hasAudio,
              status: 'ready',
              swatch: swatchForKind(validation.kind),
              source: { type: 'local', storageKey },
              createdAt: Date.now(),
            };
            commit('Import media', (current) => addAsset(current, asset));
            result.imported += 1;
          } catch (error) {
            result.failed += 1;
            result.errors.push(
              error instanceof Error ? error.message : `“${file.name}” could not be imported.`,
            );
          }
        }
      } finally {
        setBusy(false);
        setProgress(null);
      }
      return result;
    },
    [commit, project],
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return {
    busy,
    progress,
    importFiles,
    openFilePicker,
    inputRef,
    accepts: 'video/*,image/*,audio/*',
  };
}
