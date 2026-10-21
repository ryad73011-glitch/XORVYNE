import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, Track } from '@shared/types.js';
import { kindMatchesTrack } from '@shared/project-ops.js';
import { useEditor } from '../../state/editorStore.js';
import { useT } from '../../lib/useT.js';
import { Icon } from '../ui/Icon.js';
import { IconButton, Button } from '../ui/primitives.js';
import { formatDuration, formatTimecode } from '../../lib/format.js';
import { useMediaImport } from './useMediaImport.js';
import { toast } from '../../state/toastStore.js';

type DragKind = 'move' | 'trim-start' | 'trim-end' | 'scrub';

interface DragState {
  kind: DragKind;
  clipId?: string;
  deltaMs?: number;
  targetTrackId?: string;
  originX?: number;
}

const MIN_CLIP_MS = 200;

function snap(value: number, grid: number): number {
  if (grid <= 0) return value;
  return Math.round(value / grid) * grid;
}

export function Timeline() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const select = useEditor((state) => state.select);
  const playheadMs = useEditor((state) => state.playheadMs);
  const setPlayhead = useEditor((state) => state.setPlayhead);
  const zoom = project?.settings.zoom ?? 60;
  const commit = useEditor((state) => state.commit);
  const moveClipTo = useEditor((state) => state.moveClipTo);
  const deleteClip = useEditor((state) => state.deleteClip);
  const splitSelected = useEditor((state) => state.splitSelected);
  const updateProjectSettings = useEditor((state) => state.updateProjectSettings);
  const addTextToTimeline = useEditor((state) => state.addTextToTimeline);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const historyIndex = useEditor((state) => state.historyIndex);
  const { openFilePicker, inputRef, busy, importFiles } = useMediaImport();

  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const gridMs = project?.settings.gridMs ?? 500;
  const snapToGrid = project?.settings.snapToGrid ?? true;

  const updateDrag = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const tracks = useMemo(() => (project ? [...project.tracks].sort((a, b) => a.order - b.order) : []), [project]);

  const clipsByTrack = useMemo(() => {
    const map = new Map<string, Clip[]>();
    if (!project) return map;
    for (const clip of project.clips) {
      const list = map.get(clip.trackId) ?? [];
      list.push(clip);
      map.set(clip.trackId, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startMs - b.startMs);
    return map;
  }, [project]);

  const durationMs = useMemo(
    () => (project ? project.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0) : 0),
    [project],
  );

  const contentWidth = Math.max(620, (durationMs / 1000) * zoom + 280);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const lane = laneRef.current;
      if (!lane) return;
      const rect = lane.getBoundingClientRect();
      const offset = clientX - rect.left + lane.scrollLeft;
      const ms = (offset / zoom) * 1000;
      setPlayhead(Math.max(0, Math.min(ms, durationMs + 5000)));
    },
    [durationMs, setPlayhead, zoom],
  );

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      if (state.kind === 'scrub') {
        seekFromEvent(event.clientX);
        return;
      }
      const originX = state.originX ?? event.clientX;
      const deltaMs = ((event.clientX - originX) / zoom) * 1000;
      let targetTrackId = state.targetTrackId;
      if (state.kind === 'move' && state.clipId) {
        const element = document.elementFromPoint(event.clientX, event.clientY);
        const lane = element?.closest('[data-track-id]') as HTMLElement | null;
        const trackId = lane?.dataset.trackId;
        if (trackId) {
          const track = tracks.find((item) => item.id === trackId);
          const clip = project?.clips.find((item) => item.id === state.clipId);
          if (track && clip && kindMatchesTrack(clip.kind, track.kind)) targetTrackId = trackId;
        }
      }
      updateDrag({ ...state, deltaMs, targetTrackId });
    };

    const onUp = () => {
      const state = dragRef.current;
      if (!state) return;
      if (state.kind !== 'scrub' && state.clipId && state.deltaMs) {
        const clip = project?.clips.find((item) => item.id === state.clipId);
        if (clip) {
          if (state.kind === 'move') {
            const nextStart = Math.max(
              0,
              snapToGrid ? snap(clip.startMs + state.deltaMs, gridMs) : clip.startMs + state.deltaMs,
            );
            moveClipTo(clip.id, nextStart, state.targetTrackId);
          } else if (state.kind === 'trim-start') {
            const start = Math.max(
              0,
              Math.min(
                clip.startMs + clip.durationMs - MIN_CLIP_MS,
                snapToGrid ? snap(clip.startMs + state.deltaMs, gridMs) : clip.startMs + state.deltaMs,
              ),
            );
            commit('Trim clip', (currentProject) => {
              const inMs = Math.max(0, clip.inMs + (start - clip.startMs) * clip.speed);
              return {
                ...currentProject,
                clips: currentProject.clips.map((item) =>
                  item.id === clip.id
                    ? {
                        ...item,
                        startMs: start,
                        durationMs: clip.durationMs - (start - clip.startMs),
                        inMs,
                        outMs: inMs + (clip.durationMs - (start - clip.startMs)) * clip.speed,
                      }
                    : item,
                ),
              };
            });
          } else if (state.kind === 'trim-end') {
            const end = Math.max(
              clip.startMs + MIN_CLIP_MS,
              snapToGrid
                ? snap(clip.startMs + clip.durationMs + state.deltaMs, gridMs)
                : clip.startMs + clip.durationMs + state.deltaMs,
            );
            commit('Trim clip', (currentProject) => ({
              ...currentProject,
              clips: currentProject.clips.map((item) =>
                item.id === clip.id
                  ? {
                      ...item,
                      durationMs: end - item.startMs,
                      outMs: item.inMs + (end - item.startMs) * item.speed,
                    }
                  : item,
              ),
            }));
          }
        }
      }
      updateDrag(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [commit, gridMs, moveClipTo, project, seekFromEvent, snapToGrid, tracks, updateDrag, zoom]);

  if (!project) return null;

  const handleClipPointerDown = (event: React.PointerEvent, clip: Clip, kind: DragKind) => {
    event.stopPropagation();
    select(clip.id);
    const track = tracks.find((item) => item.id === clip.trackId);
    if (track?.locked) return;
    updateDrag({ kind, clipId: clip.id, deltaMs: 0, targetTrackId: clip.trackId, originX: event.clientX });
  };

  const ticks = useMemo(() => {
    const step = zoom >= 140 ? 500 : zoom >= 70 ? 1000 : zoom >= 35 ? 2000 : 5000;
    const result: { ms: number; major: boolean }[] = [];
    for (let ms = 0; ms <= durationMs + 6000; ms += step) {
      result.push({ ms, major: ms % (step * 5) === 0 });
    }
    return result;
  }, [durationMs, zoom]);

  return (
    <section className="timeline" aria-label={t('editor.timeline')}>
      <header className="timeline__toolbar">
        <div className="row" style={{ gap: 4 }}>
          <IconButton icon="undo" label={t('editor.undo')} small disabled={historyIndex === 0} onClick={undo} />
          <IconButton
            icon="redo"
            label={t('editor.redo')}
            small
            disabled={historyIndex >= project.history.length}
            onClick={redo}
          />
          <span className="toolbar__divider" />
          <IconButton
            icon="split"
            label={t('editor.split')}
            small
            disabled={!selectedClipId}
            onClick={() => splitSelected(playheadMs)}
          />
          <IconButton
            icon="trash"
            label={t('editor.delete')}
            small
            disabled={!selectedClipId}
            onClick={() => selectedClipId && deleteClip(selectedClipId)}
          />
          <span className="toolbar__divider" />
          <Button size="sm" icon="text" onClick={() => addTextToTimeline(playheadMs, 4000, { content: 'New title' })}>
            {t('editor.addText')}
          </Button>
          <Button size="sm" icon="upload" onClick={openFilePicker} disabled={busy}>
            {t('editor.importMedia')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*,image/*,audio/*"
            multiple
            hidden
            onChange={(event) => {
              const files = event.target.files;
              if (files && files.length > 0) void handleImport(files);
              event.target.value = '';
            }}
          />
        </div>
        <div className="row" style={{ gap: 4 }}>
          <IconButton
            icon="zoomOut"
            label={t('editor.zoomOut')}
            small
            onClick={() => updateProjectSettings({ zoom: Math.max(16, Math.round(zoom / 1.4)) })}
          />
          <span className="toolbar__zoom mono">{Math.round(zoom)} px/s</span>
          <IconButton
            icon="zoomIn"
            label={t('editor.zoomIn')}
            small
            onClick={() => updateProjectSettings({ zoom: Math.min(400, Math.round(zoom * 1.4)) })}
          />
        </div>
      </header>

      <div className="timeline__body">
        <div className="timeline__gutter">
          <div className="timeline__gutter-head">
            <span className="eyebrow">Tracks</span>
          </div>
          {tracks.map((track) => (
            <TrackHeader key={track.id} track={track} />
          ))}
        </div>

        <div className="timeline__scroll" ref={laneRef}>
          <div className="timeline__content" style={{ width: contentWidth }}>
            <div
              className="timeline__ruler"
              onPointerDown={(event) => {
                updateDrag({ kind: 'scrub', originX: event.clientX });
                seekFromEvent(event.clientX);
              }}
            >
              {ticks.map((tick) => (
                <div
                  key={tick.ms}
                  className={`timeline__tick${tick.major ? ' is-major' : ''}`}
                  style={{ left: (tick.ms / 1000) * zoom }}
                >
                  {tick.major ? <span className="mono">{formatDuration(tick.ms)}</span> : null}
                </div>
              ))}
            </div>

            {tracks.map((track) => (
              <div
                key={track.id}
                data-track-id={track.id}
                className={`timeline__lane${track.hidden ? ' is-hidden' : ''}`}
                style={{ height: track.height }}
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) select(null);
                }}
              >
                {(clipsByTrack.get(track.id) ?? []).map((clip) => {
                  const dragging = drag?.clipId === clip.id;
                  const offset = dragging ? (drag?.deltaMs ?? 0) : 0;
                  const left = (clip.startMs / 1000) * zoom + (drag?.kind === 'trim-start' ? offset : 0);
                  const width = Math.max(
                    16,
                    (clip.durationMs / 1000) * zoom +
                      (drag?.kind === 'trim-start' ? -offset : drag?.kind === 'trim-end' ? offset : 0),
                  );
                  return (
                    <div
                      key={clip.id}
                      className={`clip clip--${clip.kind}${selectedClipId === clip.id ? ' is-selected' : ''}${
                        dragging ? ' is-dragging' : ''
                      }`}
                      style={
                        {
                          left,
                          width,
                          '--clip-accent': clip.swatch,
                        } as React.CSSProperties
                      }
                      onPointerDown={(event) => handleClipPointerDown(event, clip, 'move')}
                      title={`${clip.name} · ${formatDuration(clip.durationMs)}`}
                    >
                      {clip.transitionIn ? (
                        <span
                          className="clip__transition"
                          style={{ width: Math.min(20, (clip.transitionIn.durationMs / 1000) * zoom) }}
                        />
                      ) : null}
                      <span className="clip__name truncate">{clip.name}</span>
                      {clip.effects.length > 0 ? <span className="clip__fx">fx</span> : null}
                      <span
                        className="clip__handle clip__handle--start"
                        onPointerDown={(event) => handleClipPointerDown(event, clip, 'trim-start')}
                      />
                      <span
                        className="clip__handle clip__handle--end"
                        onPointerDown={(event) => handleClipPointerDown(event, clip, 'trim-end')}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="timeline__playhead" style={{ left: (playheadMs / 1000) * zoom }}>
              <span className="timeline__playhead-head" />
            </div>
          </div>
        </div>
      </div>

      <footer className="timeline__footer">
        <span className="mono text-xs text-mute">{formatTimecode(playheadMs, project.settings.fps)}</span>
        <span className="text-xs text-mute">
          {project.clips.length} clips · {tracks.length} tracks
        </span>
        <span className="text-xs text-mute truncate">
          {selectedClipId ? t('editor.clipProperties') : t('editor.noClipSelected')}
        </span>
      </footer>
    </section>
  );
  async function handleImport(files: FileList) {
    const result = await importFiles(files);
    if (result.imported > 0) toast.success(`${result.imported} file${result.imported === 1 ? '' : 's'} imported.`);
    if (result.errors.length > 0) toast.error(result.errors[0]);
  }
}

function TrackHeader({ track }: { track: Track }) {
  const t = useT();
  const setTrackMuted = useEditor((state) => state.setTrackMuted);
  const setTrackLocked = useEditor((state) => state.setTrackLocked);
  const setTrackHidden = useEditor((state) => state.setTrackHidden);
  return (
    <div className="track-header" style={{ height: track.height }}>
      <span className="track-header__icon">
        <Icon name={track.kind === 'audio' ? 'audio' : track.kind === 'text' ? 'text' : 'film'} size={14} />
      </span>
      <span className="track-header__name truncate">{track.name}</span>
      <div className="track-header__actions">
        <IconButton
          icon={track.muted ? 'mute' : 'audio'}
          label={track.muted ? t('editor.unmute') : t('editor.mute')}
          small
          onClick={() => setTrackMuted(track.id, !track.muted)}
        />
        <IconButton
          icon={track.hidden ? 'eyeOff' : 'eye'}
          label={track.hidden ? t('editor.show') : t('editor.hide')}
          small
          onClick={() => setTrackHidden(track.id, !track.hidden)}
        />
        <IconButton
          icon={track.locked ? 'lock' : 'unlock'}
          label={track.locked ? t('editor.unlock') : t('editor.lock')}
          small
          onClick={() => setTrackLocked(track.id, !track.locked)}
        />
      </div>
    </div>
  );
}
