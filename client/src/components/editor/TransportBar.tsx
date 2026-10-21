import { useEffect, useRef } from 'react';
import { useEditor } from '../../state/editorStore.js';
import { useT } from '../../lib/useT.js';
import { IconButton } from '../ui/primitives.js';
import { formatTimecode } from '../../lib/format.js';

export function TransportBar() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const playheadMs = useEditor((state) => state.playheadMs);
  const setPlayhead = useEditor((state) => state.setPlayhead);
  const isPlaying = useEditor((state) => state.isPlaying);
  const setPlaying = useEditor((state) => state.setPlaying);
  const loop = useEditor((state) => state.loop);
  const setLoop = useEditor((state) => state.setLoop);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const splitSelected = useEditor((state) => state.splitSelected);
  const addTextToTimeline = useEditor((state) => state.addTextToTimeline);
  const frameRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const durationMs = project
    ? project.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0)
    : 0;

  useEffect(() => {
    if (!isPlaying || !project) return;
    lastRef.current = performance.now();

    const tick = (now: number) => {
      const delta = now - lastRef.current;
      lastRef.current = now;
      const next = useEditor.getState().playheadMs + delta;
      if (next >= durationMs) {
        if (loop) {
          setPlayhead(0);
        } else {
          setPlayhead(durationMs);
          setPlaying(false);
          return;
        }
      } else {
        setPlayhead(next);
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, project, durationMs, loop, setPlayhead, setPlaying]);

  if (!project) return null;

  return (
    <div className="transport">
      <div className="transport__group">
        <IconButton
          icon="play"
          label={isPlaying ? t('editor.pause') : t('editor.play')}
          variant={isPlaying ? 'primary' : 'default'}
          onClick={() => {
            if (!isPlaying && playheadMs >= durationMs) setPlayhead(0);
            setPlaying(!isPlaying);
          }}
        />
        <IconButton icon="pause" label="Stop" onClick={() => { setPlaying(false); setPlayhead(0); }} />
        <IconButton
          icon="clock"
          label="Loop playback"
          variant={loop ? 'primary' : 'ghost'}
          onClick={() => setLoop(!loop)}
        />
      </div>

      <div className="transport__time mono">
        {formatTimecode(playheadMs, project.settings.fps)}
        <span className="muted"> / {formatTimecode(durationMs, project.settings.fps)}</span>
      </div>

      <div className="transport__group">
        <IconButton
          icon="split"
          label={t('editor.split')}
          disabled={!selectedClipId}
          onClick={() => splitSelected(playheadMs)}
        />
        <IconButton
          icon="text"
          label={t('editor.addText')}
          onClick={() => addTextToTimeline(playheadMs, 4000, { content: 'New title' })}
        />
      </div>
    </div>
  );
}
