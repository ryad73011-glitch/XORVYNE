import { useEffect, useMemo, useRef, useState } from 'react';
import type { Clip, MediaAsset } from '@shared/types.js';
import { useEditor } from '../../state/editorStore.js';
import { getAssetUrl } from '../../lib/mediaCache.js';
import { effectsToCssFilter } from '../../lib/effectsCss.js';
import { Icon } from '../ui/Icon.js';
import { formatTimecode } from '../../lib/format.js';

interface ActiveLayer {
  clip: Clip;
  asset?: MediaAsset;
  alpha: number;
  transitionProgress: number;
}

function useStageScale(projectWidth: number) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const width = element.clientWidth;
      if (width > 0) setScale(width / projectWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [projectWidth]);

  return { stageRef, scale };
}

function ClipMedia({
  clip,
  asset,
  alpha,
  expectedTime,
  isPlaying,
  muted,
}: {
  clip: Clip;
  asset?: MediaAsset;
  alpha: number;
  expectedTime: number;
  isPlaying: boolean;
  muted: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!asset) {
      setUrl(null);
      return;
    }
    void getAssetUrl(asset).then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.volume = Math.max(0, Math.min(1, clip.volume));
    element.playbackRate = Math.max(0.25, Math.min(4, clip.speed));
    if (isPlaying) {
      if (Math.abs(element.currentTime - expectedTime) > 0.28) {
        try {
          element.currentTime = expectedTime;
        } catch {
          /* seeking before metadata is ready */
        }
      }
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [expectedTime, isPlaying]);

  const filter = effectsToCssFilter(clip.effects);
  const kenBurns = clip.effects.find((effect) => effect.enabled && effect.type === 'kenburns');
  const elapsedSourceMs = Math.max(0, expectedTime * 1000 - clip.inMs);
  const progress = clip.durationMs > 0 ? Math.min(1, Math.max(0, elapsedSourceMs / (clip.durationMs * clip.speed))) : 0;
  const scale = clip.transform.scale * (kenBurns ? Number(kenBurns.params.amount ?? 1) : 1);
  const zoom = kenBurns ? 1 + (Number(kenBurns.params.amount ?? 1) - 1) * progress : 1;

  const style: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    opacity: alpha * clip.opacity * clip.transform.opacity,
    filter,
    transform: `translate(${clip.transform.x * 100}%, ${clip.transform.y * 100}%) scale(${scale * zoom}) rotate(${clip.transform.rotation}deg)`,
    transformOrigin: 'center',
  };

  if (!url) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          background: 'repeating-linear-gradient(45deg, #17171d, #17171d 12px, #1c1c24 12px, #1c1c24 24px)',
          color: 'var(--text-mute)',
          fontSize: 14,
        }}
      >
        <span className="row" style={{ gap: 8 }}>
          <Icon name="film" size={16} /> {asset?.name ?? 'Media unavailable'}
        </span>
      </div>
    );
  }

  if (clip.kind === 'image' || asset?.kind === 'image') {
    return <img src={url} alt={clip.name} style={style} draggable={false} />;
  }

  return (
    <video
      ref={ref}
      src={url}
      style={style}
      playsInline
      muted={muted}
      preload="auto"
      onLoadedMetadata={(event) => {
        const element = event.currentTarget;
        if (Math.abs(element.currentTime - expectedTime) > 0.2) element.currentTime = expectedTime;
      }}
    />
  );
}

function TextLayer({ clip, alpha, scale }: { clip: Clip; alpha: number; scale: number }) {
  const text = clip.text;
  if (!text) return null;
  const fontSize = text.fontSize * scale;
  return (
    <div
      style={{
        position: 'absolute',
        left: `${text.x * 100}%`,
        top: `${text.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        opacity: alpha,
        pointerEvents: 'none',
        maxWidth: '90%',
        textAlign: text.align,
      }}
    >
      <span
        style={{
          display: 'inline-block',
          fontFamily: text.fontFamily,
          fontWeight: text.fontWeight,
          fontSize,
          lineHeight: 1.15,
          color: text.color,
          letterSpacing: `${text.letterSpacing * scale}px`,
          textTransform: text.uppercase ? 'uppercase' : 'none',
          textShadow: text.shadow ? `0 ${2 * scale}px ${8 * scale}px rgba(0,0,0,0.8)` : 'none',
          background: text.background ?? 'transparent',
          padding: text.background ? `${4 * scale}px ${10 * scale}px` : undefined,
          borderRadius: text.background ? `${6 * scale}px` : undefined,
        }}
      >
        {text.content}
      </span>
    </div>
  );
}

function AudioClipPlayer({
  clip,
  asset,
  expectedTime,
  isPlaying,
}: {
  clip: Clip;
  asset?: MediaAsset;
  expectedTime: number;
  isPlaying: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!asset) return;
    void getAssetUrl(asset).then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !url) return;
    element.volume = Math.max(0, Math.min(1, clip.volume));
    element.playbackRate = Math.max(0.25, Math.min(4, clip.speed));
    if (isPlaying) {
      if (Math.abs(element.currentTime - expectedTime) > 0.28) {
        try {
          element.currentTime = expectedTime;
        } catch {
          /* ignore */
        }
      }
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [expectedTime, isPlaying, url, clip.volume]);

  if (!url) return null;
  return <audio ref={ref} src={url} preload="auto" />;
}

export function PreviewPlayer() {
  const project = useEditor((state) => state.project);
  const playheadMs = useEditor((state) => state.playheadMs);
  const isPlaying = useEditor((state) => state.isPlaying);
  const { stageRef, scale } = useStageScale(project?.settings.width ?? 1920);

  const assetsById = useMemo(() => {
    const map = new Map<string, MediaAsset>();
    for (const asset of project?.assets ?? []) map.set(asset.id, asset);
    return map;
  }, [project?.assets]);

  const layers = useMemo<ActiveLayer[]>(() => {
    if (!project) return [];
    const result: ActiveLayer[] = [];
    const videoTracks = project.tracks
      .filter((track) => track.kind === 'video' && !track.hidden)
      .sort((a, b) => a.order - b.order);
    const textTracks = project.tracks
      .filter((track) => track.kind === 'text' && !track.hidden)
      .sort((a, b) => a.order - b.order);

    for (const track of [...videoTracks, ...textTracks]) {
      const clips = project.clips
        .filter((clip) => clip.trackId === track.id)
        .sort((a, b) => a.startMs - b.startMs);
      for (let index = 0; index < clips.length; index += 1) {
        const clip = clips[index];
        const local = playheadMs - clip.startMs;
        if (local < 0 || local > clip.durationMs) continue;
        let alpha = 1;
        let transitionProgress = 0;
        const transition = clip.transitionIn;
        if (transition && transition.durationMs > 0 && local < transition.durationMs) {
          transitionProgress = local / transition.durationMs;
          alpha = transitionProgress;
        }
        result.push({ clip, asset: clip.assetId ? assetsById.get(clip.assetId) : undefined, alpha, transitionProgress });
      }
    }
    return result;
  }, [project, playheadMs, assetsById]);

  const audioLayers = useMemo(() => {
    if (!project) return [];
    return project.clips.filter((clip) => {
      if (clip.kind !== 'audio') return false;
      const track = project.tracks.find((item) => item.id === clip.trackId);
      if (!track || track.muted) return false;
      const local = playheadMs - clip.startMs;
      return local >= 0 && local <= clip.durationMs;
    });
  }, [project, playheadMs]);

  if (!project) return null;
  const { width, height } = project.settings;

  return (
    <div className="preview">
      <div
        className="preview__stage"
        ref={stageRef}
        style={{ aspectRatio: `${width} / ${height}`, background: project.settings.backgroundColor }}
      >
        <div
          className="preview__layer"
          style={{ width, height, transform: `scale(${scale})` }}
        >
          {layers.map((layer) =>
            layer.clip.kind === 'text' ? (
              <TextLayer key={layer.clip.id} clip={layer.clip} alpha={layer.alpha} scale={scale} />
            ) : (
              <ClipMedia
                key={layer.clip.id}
                clip={layer.clip}
                asset={layer.asset}
                alpha={layer.alpha}
                expectedTime={Math.max(0, (layer.clip.inMs + (playheadMs - layer.clip.startMs) * layer.clip.speed) / 1000)}
                isPlaying={isPlaying}
                muted={project.tracks.find((track) => track.id === layer.clip.trackId)?.muted ?? false}
              />
            ),
          )}
          {audioLayers.map((clip) => (
            <AudioClipPlayer
              key={clip.id}
              clip={clip}
              asset={clip.assetId ? assetsById.get(clip.assetId) : undefined}
              expectedTime={Math.max(0, (clip.inMs + (playheadMs - clip.startMs) * clip.speed) / 1000)}
              isPlaying={isPlaying}
            />
          ))}
        </div>
        {layers.length === 0 ? (
          <div className="preview__empty">
            <Icon name="film" size={22} />
            <span>Import media to preview your cut</span>
          </div>
        ) : null}
      </div>
      <div className="preview__meta">
        <span className="mono">{formatTimecode(playheadMs, project.settings.fps)}</span>
        <span className="muted">
          {width}×{height} · {project.settings.fps} fps
        </span>
      </div>
    </div>
  );
}
