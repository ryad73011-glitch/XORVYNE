import { useState } from 'react';
import { useEditor } from '../../state/editorStore.js';
import { useT } from '../../lib/useT.js';
import { Button, Card, Chip, EmptyState, IconButton } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import { useMediaImport } from './useMediaImport.js';
import { formatBytes } from '../../storage/db.js';
import { formatDuration } from '../../lib/format.js';
import { toast } from '../../state/toastStore.js';

export function MediaPanel() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const addAssetToTimeline = useEditor((state) => state.addAssetToTimeline);
  const commit = useEditor((state) => state.commit);
  const { openFilePicker, inputRef, busy, progress, importFiles } = useMediaImport();
  const [dragOver, setDragOver] = useState(false);

  if (!project) return null;

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const files = event.dataTransfer.files;
    if (files.length === 0) return;
    const result = await importFiles(files);
    if (result.imported > 0) toast.success(`${result.imported} file${result.imported === 1 ? '' : 's'} imported.`);
    if (result.errors.length > 0) toast.error(result.errors[0]);
  };

  return (
    <div className="media-panel">
      <div className="row row--between">
        <span className="eyebrow">{t('editor.assets')}</span>
        <Button size="sm" icon="upload" onClick={openFilePicker} disabled={busy}>
          {t('editor.importMedia')}
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*,image/*,audio/*"
        multiple
        hidden
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length > 0) void importFiles(files).then((result) => {
            if (result.imported > 0) toast.success(`${result.imported} file(s) imported.`);
            if (result.errors.length > 0) toast.error(result.errors[0]);
          });
          event.target.value = '';
        }}
      />

      <div
        className={`media-drop${dragOver ? ' is-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Icon name="upload" size={18} />
        <span>{progress ?? t('editor.dropHint')}</span>
      </div>

      {project.assets.length === 0 ? (
        <EmptyState icon="film" title="No media yet" text={t('editor.dropHint')} />
      ) : (
        <div className="media-list">
          {project.assets.map((asset) => (
            <Card key={asset.id} className="media-item">
              <span className="media-item__icon" style={{ background: `${asset.swatch}22`, color: asset.swatch }}>
                <Icon name={asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'image' : 'video'} size={16} />
              </span>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <span className="text-sm truncate" style={{ display: 'block' }}>
                  {asset.name}
                </span>
                <span className="text-xs text-mute">
                  {asset.kind === 'image'
                    ? `${asset.width}×${asset.height}`
                    : `${formatDuration(asset.durationMs)} · ${formatBytes(asset.sizeBytes)}`}
                </span>
              </div>
              <div className="row" style={{ gap: 4 }}>
                <Chip tone={asset.status === 'ready' ? 'success' : 'warning'}>{asset.status}</Chip>
                <IconButton
                  icon="plus"
                  label={t('assets.addToTimeline')}
                  small
                  onClick={() => {
                    const id = addAssetToTimeline(asset);
                    if (id) toast.success('Added to the timeline.');
                  }}
                />
                <IconButton
                  icon="trash"
                  label={t('common.delete')}
                  small
                  onClick={() => {
                    commit('Remove media', (current) => ({
                      ...current,
                      assets: current.assets.filter((item) => item.id !== asset.id),
                      clips: current.clips.filter((clip) => clip.assetId !== asset.id),
                    }));
                    toast.success('Media removed.');
                  }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
