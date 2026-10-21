/**
 * Maps the engine-independent project model onto a concrete ffmpeg render.
 *
 * The project model knows nothing about ffmpeg — this module is the only
 * place where that mapping lives, so another renderer could be added later
 * without touching the editor or the project format.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Clip, ExportSettings, MediaAsset, ProjectSettings, Track } from '@shared/types.js';
import { TRANSITION_CATALOG } from '@shared/catalog.js';

export interface RenderMedia {
  token: string;
  path: string;
  hasAudio: boolean;
  durationMs: number;
}

export interface RenderProject {
  name: string;
  settings: ProjectSettings;
  tracks: Track[];
  clips: Clip[];
  assets: MediaAsset[];
}

export interface PlanOptions {
  project: RenderProject;
  settings: ExportSettings;
  mediaByAsset: Map<string, RenderMedia>;
  fontFile: string | null;
  workDir: string;
}

export interface RenderPlan {
  args: string[];
  durationMs: number;
  warnings: string[];
  outputName: string;
  textFiles: string[];
}

interface Segment {
  kind: 'clip' | 'black';
  clip?: Clip;
  inputIndex?: number;
  durationSec: number;
  startSec: number;
}

const XFADE_NAMES: Record<string, string> = {
  fade: 'fade',
  fadeblack: 'fadeblack',
  fadewhite: 'fadewhite',
  wipeleft: 'wipeleft',
  wiperight: 'wiperight',
  dissolve: 'dissolve',
  slideleft: 'slideleft',
  slideright: 'slideright',
  slideup: 'slideup',
  circledopen: 'circleopen',
  circleopen: 'circleopen',
  radial: 'radial',
  smoothleft: 'smoothleft',
  hblur: 'hblur',
  glitch: 'fade',
  cutflash: 'fadewhite',
};

function resolutionFor(settings: ExportSettings, project: RenderProject): { width: number; height: number } {
  switch (settings.resolution) {
    case '1080p':
      return { width: 1920, height: 1080 };
    case '720p':
      return { width: 1280, height: 720 };
    case '480p':
      return { width: 854, height: 480 };
    case 'vertical':
      return { width: 1080, height: 1920 };
    case 'source':
    default:
      return { width: project.settings.width, height: project.settings.height };
  }
}

function fpsFor(settings: ExportSettings, project: RenderProject): number {
  if (settings.fps === 'source') return project.settings.fps || 30;
  return Number(settings.fps) || 30;
}

function transitionFor(clip: Clip): { type: string; durationSec: number } | null {
  if (!clip.transitionIn || clip.transitionIn.durationMs <= 0) return null;
  if (clip.transitionIn.type === 'cut') return null;
  const known = TRANSITION_CATALOG.find((item) => item.type === clip.transitionIn!.type);
  const xfade = XFADE_NAMES[clip.transitionIn.type] ?? XFADE_NAMES[known?.type ?? 'fade'] ?? 'fade';
  return { type: xfade, durationSec: clip.transitionIn.durationMs / 1000 };
}

function assColor(hex: string): string {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((character) => character + character).join('') : value;
  const red = normalized.slice(0, 2);
  const green = normalized.slice(2, 4);
  const blue = normalized.slice(4, 6);
  return `&H00${blue}${green}${red}`;
}

function assBackground(value: string): string {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/i);
  if (!match) return '&H80000000';
  const alpha = Math.max(0, Math.min(255, Math.round((1 - Number(match[4] ?? 1)) * 255)));
  const hex = (number: number) => number.toString(16).padStart(2, '0');
  return `&H${hex(alpha)}${hex(Number(match[3]))}${hex(Number(match[2]))}${hex(Number(match[1]))}`.toUpperCase();
}

function assTime(ms: number): string {
  const centiseconds = Math.max(0, Math.floor(ms / 10));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function escapeFilterPath(input: string): string {
  return input.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Translates one semantic effect into ffmpeg filter fragments. */
export function effectFilters(effect: ClipEffectLike, canvasWidth: number, canvasHeight: number, fps: number, clipDurationMs: number): string[] {
  const amount = Number(effect.params.amount ?? 0);
  switch (effect.type) {
    case 'brightness':
      return [`eq=brightness=${amount.toFixed(3)}`];
    case 'contrast':
      return [`eq=contrast=${(1 + amount).toFixed(3)}`];
    case 'saturation':
      return [`eq=saturation=${amount.toFixed(3)}`];
    case 'temperature': {
      const warm = amount >= 0;
      return [
        `colorbalance=rs=${(warm ? 0.18 : 0.04) * Math.abs(amount) + 0.02}:gs=0:bs=${(warm ? 0.02 : 0.2) * Math.abs(amount) + 0.02}`,
      ];
    }
    case 'tint': {
      const color = String(effect.params.color ?? '#7c3aed');
      if (color === '#22d3ee') return [`colorbalance=rs=0.02:gs=${0.16 * amount}:bs=${0.2 * amount}`];
      if (color === '#f97316') return [`colorbalance=rs=${0.2 * amount}:gs=${0.08 * amount}:bs=0.02`];
      if (color === '#f43f5e') return [`colorbalance=rs=${0.2 * amount}:gs=0.02:bs=${0.12 * amount}`];
      return [`colorbalance=rs=${0.14 * amount}:gs=0.02:bs=${0.22 * amount}`];
    }
    case 'blur':
      return [`gblur=sigma=${(amount / 2).toFixed(2)}`];
    case 'sharpen':
      return [`unsharp=5:5:${amount.toFixed(2)}:5:5:0`];
    case 'grayscale':
      return ['hue=s=0'];
    case 'sepia':
      return ['colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0:0:0:1'];
    case 'vignette':
      return [`vignette=angle=${((Math.PI / 5) * amount).toFixed(3)}`];
    case 'grain':
      return [`noise=alls=${(amount * 28).toFixed(1)}:allf=t+u`];
    case 'glitch':
      return [`rgbashift=rh=${(amount * 6).toFixed(1)}:bh=${(-amount * 6).toFixed(1)}`, `hue=h=${(amount * 40).toFixed(1)}`];
    case 'kenburns':
      return [
        `zoompan=z='min(zoom+0.0012,${amount.toFixed(3)})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${canvasWidth}x${canvasHeight}:fps=${fps}`,
      ];
    case 'fadeIn': {
      const durationMs = Number(effect.params.durationMs ?? 500);
      return [`fade=t=in:st=0:d=${(durationMs / 1000).toFixed(3)}`];
    }
    case 'fadeOut': {
      const durationMs = Number(effect.params.durationMs ?? 500);
      return [`fade=t=out:st=${Math.max(0, clipDurationMs - durationMs) / 1000}:d=${(durationMs / 1000).toFixed(3)}`];
    }
    case 'overlay': {
      const kind = String(effect.params.kind ?? 'grain');
      switch (kind) {
        case 'grain':
          return [`noise=alls=${(amount * 26).toFixed(1)}:allf=t+u`];
        case 'vignette':
          return [`vignette=angle=${((Math.PI / 5) * amount).toFixed(3)}`];
        case 'letterbox': {
          const bar = (amount * 0.12).toFixed(3);
          return [
            `drawbox=x=0:y=0:w=iw:h=ih*${bar}:color=black@1:t=fill`,
            `drawbox=x=0:y=ih*(1-${bar}):w=iw:h=ih*${bar}:color=black@1:t=fill`,
          ];
        }
        case 'lightleak':
          return [`colorbalance=rs=${(0.16 * amount).toFixed(3)}:gs=${(0.05 * amount).toFixed(3)}:bs=0`];
        case 'scanlines':
          return [`noise=alls=${(amount * 8).toFixed(1)}:allf=t`];
        case 'dust':
          return [`noise=alls=${(amount * 18).toFixed(1)}:allf=t+u`];
        default:
          return [];
      }
    }
    default:
      return [];
  }
}

interface ClipEffectLike {
  type: string;
  enabled: boolean;
  params: Record<string, number | string | boolean>;
}

export function buildPlan(options: PlanOptions): RenderPlan {
  const { project, settings, mediaByAsset, fontFile, workDir } = options;
  const warnings: string[] = [];
  const textFiles: string[] = [];

  const { width, height } = resolutionFor(settings, project);
  const fps = fpsFor(settings, project);

  const videoTracks = project.tracks.filter((track) => track.kind === 'video').sort((a, b) => a.order - b.order);
  const primary = videoTracks[0];
  const visualClips = primary
    ? project.clips
        .filter((clip) => clip.trackId === primary.id && (clip.kind === 'video' || clip.kind === 'image'))
        .sort((a, b) => a.startMs - b.startMs)
    : [];

  const otherVideoClips = project.clips.filter(
    (clip) =>
      (clip.kind === 'video' || clip.kind === 'image') &&
      videoTracks.length > 1 &&
      clip.trackId !== primary?.id,
  );
  if (otherVideoClips.length > 0) {
    warnings.push(
      `${otherVideoClips.length} clip(s) on secondary video tracks are not composited into the export — XORVYNE renders one video layer in this version.`,
    );
  }

  const textClips = project.clips.filter((clip) => clip.kind === 'text').sort((a, b) => a.startMs - b.startMs);
  const audioClips = settings.includeAudio
    ? project.clips
        .filter((clip) => {
          if (clip.kind !== 'audio') return false;
          const track = project.tracks.find((item) => item.id === clip.trackId);
          return !track?.muted;
        })
        .sort((a, b) => a.startMs - b.startMs)
    : [];

  const args: string[] = [];
  const inputs: { index: number; kind: 'video' | 'image' | 'audio'; file: string }[] = [];
  const inputIndexByClip = new Map<string, number>();

  const addInput = (kind: 'video' | 'image' | 'audio', file: string, extra: string[] = []): number => {
    const index = inputs.length;
    args.push(...extra, '-i', file);
    inputs.push({ index, kind, file });
    return index;
  };

  // --- visual inputs ------------------------------------------------------
  for (const clip of visualClips) {
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const media = clip.assetId ? mediaByAsset.get(clip.assetId) : undefined;
    if (!asset || !media) {
      warnings.push(`Clip “${clip.name}” has no uploaded media and was skipped.`);
      continue;
    }
    if (asset.kind === 'image') {
      const index = addInput('image', media.path, ['-loop', '1', '-t', (clip.durationMs / 1000).toFixed(3)]);
      inputIndexByClip.set(clip.id, index);
    } else {
      const index = addInput('video', media.path);
      inputIndexByClip.set(clip.id, index);
    }
  }

  // --- audio-only inputs --------------------------------------------------
  for (const clip of audioClips) {
    const media = clip.assetId ? mediaByAsset.get(clip.assetId) : undefined;
    if (!media) {
      warnings.push(`Audio clip “${clip.name}” has no uploaded media and was skipped.`);
      continue;
    }
    const index = addInput('audio', media.path);
    inputIndexByClip.set(clip.id, index);
  }

  // --- build the visual segment list -------------------------------------
  // Each clip with an incoming transition is padded by the transition length.
  // xfade then overlaps that pad with the previous segment, preserving the
  // timeline's total duration and keeping later titles/audio in sync.
  const segments: Segment[] = [];
  const usable = visualClips.filter((clip) => inputIndexByClip.has(clip.id));
  if (usable.length > 0) {
    const first = usable[0];
    if (first.startMs > 0) {
      segments.push({ kind: 'black', durationSec: first.startMs / 1000, startSec: 0 });
    }
    let previousEnd = first.startMs;
    for (const clip of usable) {
      const gap = Math.max(0, (clip.startMs - previousEnd) / 1000);
      if (gap > 0) segments.push({ kind: 'black', durationSec: gap, startSec: previousEnd / 1000 });
      const transition = transitionFor(clip);
      const transitionSec = transition ? Math.min(transition.durationSec, clip.durationMs / 2000) : 0;
      const clipDurationSec = clip.durationMs / 1000;
      segments.push({
        kind: 'clip',
        clip,
        inputIndex: inputIndexByClip.get(clip.id),
        durationSec: clipDurationSec + transitionSec,
        startSec: clip.startMs / 1000,
      });
      previousEnd = clip.startMs + clip.durationMs;
    }
  }

  let totalDurationSec = 0;
  let priorSegmentKind: Segment['kind'] | null = null;
  for (const segment of segments) {
    const transition = segment.kind === 'clip' && priorSegmentKind !== null ? transitionFor(segment.clip!) : null;
    const transitionSec = transition ? Math.min(transition.durationSec, segment.durationSec / 2) : 0;
    totalDurationSec += segment.durationSec - transitionSec;
    priorSegmentKind = segment.kind;
  }

  const filters: string[] = [];

  // Per-clip video filter chains.
  const chainLabels: string[] = [];
  let blackCounter = 0;

  for (const segment of segments) {
    if (segment.kind === 'black') {
      const label = `blk${blackCounter++}`;
      filters.push(
        `color=c=black:s=${width}x${height}:r=${fps}:d=${segment.durationSec.toFixed(3)}[${label}]`,
      );
      chainLabels.push(label);
      continue;
    }
    const clip = segment.clip!;
    const inputIndex = segment.inputIndex!;
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const label = `v${chainLabels.length}`;
    const inSec = (clip.inMs / 1000).toFixed(3);
    const outSec = ((clip.inMs + clip.durationMs * (clip.speed || 1)) / 1000).toFixed(3);
    const base: string[] = [];
    if (asset?.kind === 'image') {
      base.push('trim=duration=' + (clip.durationMs / 1000).toFixed(3), 'setpts=PTS-STARTPTS');
    } else {
      base.push(`trim=start=${inSec}:end=${outSec}`, 'setpts=PTS-STARTPTS');
    }
    base.push(
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
      'setsar=1',
      `fps=${fps}`,
      'format=yuv420p',
    );
    for (const effect of clip.effects) {
      if (!effect.enabled) continue;
      base.push(...effectFilters(effect, width, height, fps, clip.durationMs));
    }
    if (segment.durationSec > (clip.durationMs / 1000) + 0.001) {
      base.push(`tpad=stop_mode=clone:stop_duration=${(segment.durationSec - clip.durationMs / 1000).toFixed(3)}`);
    }
    filters.push(`[${inputIndex}:v]${base.join(',')}[${label}]`);
    chainLabels.push(label);
  }

  // --- chain the segments together ---------------------------------------
  let current: string | null = null;
  let previousKind: Segment['kind'] | null = null;
  let elapsedSec = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const label = chainLabels[index];
    if (current === null) {
      current = label;
      elapsedSec = segment.durationSec;
      previousKind = segment.kind;
      continue;
    }
    const transition = segment.kind === 'clip' ? transitionFor(segment.clip!) : null;
    const transitionSec = transition ? Math.min(transition.durationSec, segment.durationSec / 2) : 0;
    const outputLabel = `c${index}`;
    if (transition && previousKind !== null) {
      const offset = Math.max(0, elapsedSec - transitionSec);
      filters.push(
        `[${current}][${label}]xfade=transition=${transition.type}:duration=${transitionSec.toFixed(3)}:offset=${offset.toFixed(3)}[${outputLabel}]`,
      );
      elapsedSec = offset + segment.durationSec;
    } else {
      filters.push(`[${current}][${label}]concat=n=2:v=1:a=0[${outputLabel}]`);
      elapsedSec += segment.durationSec;
    }
    current = outputLabel;
    previousKind = segment.kind;
  }

  if (current === null) {
    // No visual clips at all — render a plain colour card for the project length.
    const audioLength = project.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
    const seconds = Math.max(1, audioLength / 1000);
    totalDurationSec = Math.max(totalDurationSec, seconds);
    filters.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${seconds.toFixed(3)}[base]`);
    current = 'base';
    warnings.push('The timeline has no video clips — a black canvas was rendered.');
  }

  // --- text overlays ------------------------------------------------------
  let videoLabel = current;
  const renderableText = textClips.filter((clip) => clip.text && clip.text.content.trim());
  if (renderableText.length > 0) {
    const fileName = 'captions.ass';
    const filePath = path.join(workDir, fileName);
    const styleLines: string[] = [];
    const dialogue: string[] = [];
    for (const [index, clip] of renderableText.entries()) {
      const text = clip.text!;
      const fontSize = Math.max(8, Math.round((text.fontSize / 1080) * height));
      const x = Math.round(Math.max(0, Math.min(1, text.x)) * width);
      const y = Math.round(Math.max(0, Math.min(1, text.y)) * height);
      const alignment = text.align === 'left' ? 4 : text.align === 'right' ? 6 : 5;
      const bold = text.fontWeight >= 600 ? -1 : 0;
      const shadow = text.shadow ? 2 : 0;
      const primaryColor = assColor(text.color);
      const backColor = text.background ? assBackground(text.background) : '&H00000000';
      const borderStyle = text.background ? 3 : 1;
      const outline = text.background ? 8 : 0;
      const start = assTime(clip.startMs);
      const end = assTime(clip.startMs + clip.durationMs);
      const cleanText = (text.uppercase ? text.content.toUpperCase() : text.content)
        .replace(/\\/g, '\\\\')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/\r?\n/g, '\\N');
      const styleName = `Text${index}`;
      styleLines.push(
        `Style: ${styleName},DejaVu Sans,${fontSize},${primaryColor},&H00FFFFFF,&H00000000,${backColor},${bold},0,${borderStyle},${outline},${shadow},${alignment},0,0,0,1`,
      );
      const position = `{\\pos(${x},${y})}`;
      dialogue.push(`Dialogue: 0,${start},${end},${styleName},,0,0,0,,${position}${cleanText}`);
    }
    const ass = [
      '[Script Info]',
      'ScriptType: v4.00+',
      `PlayResX: ${width}`,
      `PlayResY: ${height}`,
      'ScaledBorderAndShadow: yes',
      'WrapStyle: 2',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      ...styleLines,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      ...dialogue,
      '',
    ].join('\n');
    fs.writeFileSync(filePath, ass, 'utf8');
    textFiles.push(fileName);
    const fontDir = fontFile ? path.dirname(fontFile) : '';
    const fontOption = fontDir ? `:fontsdir='${escapeFilterPath(fontDir)}'` : '';
    const outputLabel = 'captions';
    filters.push(`[${videoLabel}]subtitles=filename=${fileName}${fontOption}[${outputLabel}]`);
    videoLabel = outputLabel;
  }

  // --- audio mixing -------------------------------------------------------
  const audioLabels: string[] = [];
  const mixSources: { clip: Clip; inputIndex: number }[] = [];

  for (const clip of audioClips) {
    const inputIndex = inputIndexByClip.get(clip.id);
    if (inputIndex === undefined) continue;
    const media = clip.assetId ? mediaByAsset.get(clip.assetId) : undefined;
    if (!media) continue;
    if (!media.hasAudio) {
      warnings.push(`Audio file “${clip.name}” contains no audio stream and was skipped.`);
      continue;
    }
    mixSources.push({ clip, inputIndex });
  }

  if (settings.includeAudio) {
    for (const clip of visualClips) {
      const inputIndex = inputIndexByClip.get(clip.id);
      if (inputIndex === undefined) continue;
      const media = clip.assetId ? mediaByAsset.get(clip.assetId) : undefined;
      const track = project.tracks.find((item) => item.id === clip.trackId);
      if (!media?.hasAudio || track?.muted) continue;
      mixSources.push({ clip, inputIndex });
    }
  }

  mixSources.forEach((source, index) => {
    const { clip, inputIndex } = source;
    const label = `a${index}`;
    const inSec = (clip.inMs / 1000).toFixed(3);
    const outSec = ((clip.inMs + clip.durationMs * (clip.speed || 1)) / 1000).toFixed(3);
    const delay = Math.max(0, Math.round(clip.startMs));
    const volume = clip.volume ?? 1;
    filters.push(
      `[${inputIndex}:a]atrim=start=${inSec}:end=${outSec},asetpts=PTS-STARTPTS,` +
        `adelay=${delay}|${delay},volume=${volume.toFixed(2)},` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[${label}]`,
    );
    audioLabels.push(label);
  });

  if (audioLabels.length > 0) {
    const mixed = audioLabels.map((label) => `[${label}]`).join('');
    const duration = Math.max(1, totalDurationSec);
    filters.push(
      `${mixed}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0,` +
        `apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},` +
        `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`,
    );
  }

  // --- assemble -----------------------------------------------------------
  const outputName = `${sanitiseName(settings.fileName || project.name || 'xorvyne-export')}.${settings.format}`;
  args.push('-filter_complex', filters.join(';'));
  args.push('-map', `[${videoLabel}]`);
  if (audioLabels.length > 0) {
    args.push('-map', '[aout]');
  }

  const crf = Math.round(Math.min(40, Math.max(18, 51 - settings.quality * 32)));
  if (settings.format === 'webm') {
    args.push('-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1');
    if (audioLabels.length > 0) args.push('-c:a', 'libopus', '-b:a', '128k');
  } else {
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    if (audioLabels.length > 0) args.push('-c:a', 'aac', '-b:a', '192k');
  }
  args.push('-r', String(fps));
  args.push('-t', Math.max(1, totalDurationSec).toFixed(3));
  args.push(outputName);

  return {
    args,
    durationMs: Math.round(totalDurationSec * 1000),
    warnings,
    outputName,
    textFiles,
  };
}

export function sanitiseName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/\.{2,}/g, '')
      .replace(/^[.-]+/, '')
      .replace(/-+$/, '')
      .slice(0, 80) || 'xorvyne-export'
  );
}
