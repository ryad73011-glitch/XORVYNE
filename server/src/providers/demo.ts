import type {
  CommandResponse,
  ImageToVideoPlan,
  TextToVideoPlan,
  VideoAnalysis,
} from '@shared/types.js';
import { parseCommand, SUGGESTIONS, type CommandContext } from '@shared/ai-commands.js';
import { findFfmpeg } from '../config.js';
import fs from 'node:fs';
import { probeMedia } from '../export/ffmpeg.js';
import type {
  CommandParserProvider,
  ImageAnalysisProvider,
  ImageToVideoProvider,
  SpeechToTextProvider,
  TextToVideoProvider,
  TranslationProvider,
  VideoEditProvider,
} from './types.js';

/* -------------------------------------------------------- command parsing */

export const demoCommandParser: CommandParserProvider = {
  id: 'command-parser',
  label: 'Command parser (deterministic, offline)',
  mode: 'demo',
  detail:
    'Commands are parsed by a deterministic local parser — no network call, no API key and no cost. Configure XORVYNE_COMMAND_ENDPOINT to use a live model instead.',
  requiresCredentials: false,
  async parse(request): Promise<CommandResponse> {
    const context: CommandContext = {
      clips: request.project.clips,
      tracks: request.project.tracks,
      assets: request.project.assets,
      settings: request.project.settings,
      selectedClipId: request.project.selectedClipId ?? null,
    };
    const result = parseCommand(request.message, context);
    return {
      reply: result.reply,
      proposal: result.proposal,
      mode: 'demo',
      provider: 'xorvyne-local-parser',
      understood: result.understood,
      suggestions: result.suggestions.length > 0 ? result.suggestions : SUGGESTIONS,
    };
  },
};

/* ---------------------------------------------------------- text to video */

const STYLE_BEATS: Record<string, string[]> = {
  cinematic: [
    'A slow push through a rain-slicked city at blue hour, neon reflecting in puddles.',
    'A silhouette crossing an empty highway, headlights cutting the fog.',
    'Macro details of a wristwatch ticking, shallow depth of field, warm rim light.',
    'A vast desert dune line at dawn, the sun cresting in a wall of gold.',
    'The camera drifts past a cracked window, dust suspended in a shaft of light.',
  ],
  documentary: [
    'An interview subject in a sunlit room, hands moving as they explain.',
    'Archive-style street footage of a market opening at dawn.',
    'A craftsperson at a bench, tools arranged in a deliberate overhead shot.',
    'Wide establishing shot of a coastline before the weather turns.',
  ],
  anime: [
    'A train window reflecting cherry blossom petals, warm colour grade.',
    'A rooftop at golden hour, wind moving the laundry lines.',
    'A quiet street after rain, neon signs mirrored in puddles.',
  ],
  vlog: [
    'A quick handheld walk through a bright market, turning to a stall.',
    'A coffee being poured in close-up, morning light through a window.',
    'A friend laughing on a rooftop, golden hour behind them.',
  ],
  product: [
    'A hero shot on a turntable, single key light, dark gradient backdrop.',
    'Macro detail of the material texture, slow rack focus.',
    'The product in use, hands entering frame, natural light.',
  ],
  noir: [
    'A figure under a streetlight, rain falling through the cone of light.',
    'A cluttered office lit by a single blind, deep shadows.',
    'A car idling in the rain, red tail lights bleeding into the frame.',
  ],
};

export const demoTextToVideo: TextToVideoProvider = {
  id: 'text-to-video',
  label: 'Storyboard planner (demo)',
  mode: 'demo',
  detail:
    'Generates an editable shot list. No footage is generated — configure a video provider to produce real clips.',
  requiresCredentials: true,
  async generate({ prompt, style = 'cinematic', durationMs = 30000 }): Promise<TextToVideoPlan> {
    const beats = STYLE_BEATS[style] ?? STYLE_BEATS.cinematic;
    const total = Math.max(10000, Math.min(180000, durationMs || 30000));
    const shotCount = Math.max(3, Math.min(6, Math.round(total / 6000)));
    const shotDuration = Math.round(total / shotCount);

    const shots = Array.from({ length: shotCount }, (_, index) => {
      const base = beats[index % beats.length];
      return {
        index,
        title: `Shot ${index + 1}`,
        description: `${base} — adapted for “${prompt.slice(0, 80)}”.`,
        durationMs: shotDuration,
        prompt: `${prompt}. ${base} ${style} look.`,
        cameraNote: index % 2 === 0 ? 'Slow push-in, 35mm' : 'Locked-off or slow pan, 50mm',
      };
    });

    return {
      mode: 'demo',
      provider: 'xorvyne-storyboard',
      title: prompt.trim().slice(0, 60) || 'Untitled sequence',
      summary: `${shotCount} shots over ${Math.round(total / 1000)} seconds, planned in a ${style} style.`,
      shots,
      stylePreset: style,
      musicSuggestion: style === 'vlog' ? 'Lo-Fi Chill' : style === 'noir' ? 'Tension Build' : 'Cinematic Pulse',
      footageGenerated: false,
      notes: [
        'Demo mode: the plan becomes a real project with editable title cards — replace them with your own footage.',
        'Connect a video provider to generate actual clips for each shot.',
      ],
    };
  },
};

/* --------------------------------------------------------- image to video */

export const demoImageToVideo: ImageToVideoProvider = {
  id: 'image-to-video',
  label: 'Camera-move planner (demo)',
  mode: 'demo',
  detail:
    'Plans camera movement for a still image and applies it as a real Ken Burns clip. No generative video is produced.',
  requiresCredentials: true,
  async generate({ prompt, motion = 'slow push-in' }): Promise<ImageToVideoPlan> {
    const cameraMoves = [
      `${motion} from the centre of frame`,
      'Gentle parallax drift to reveal foreground depth',
      'Soft focus pull from the subject to the background',
      'Slow 4% zoom that eases out over the shot',
    ];
    return {
      mode: 'demo',
      provider: 'xorvyne-camera-plan',
      summary: `A ${motion} over ${prompt.trim().slice(0, 70) || 'the still'}, 4 seconds at 30 fps.`,
      motion,
      durationMs: 4000,
      cameraMoves,
      styleNotes: [
        'Import the image and apply the Ken Burns effect for a real push-in in the preview and in the exported file.',
        'A generative provider can replace the still with actual motion once configured.',
      ],
      footageGenerated: false,
      notes: ['Demo mode — no video is generated from the image.'],
    };
  },
};

/* -------------------------------------------------------- edit existing */

export const demoVideoEdit: VideoEditProvider = {
  id: 'video-edit',
  label: 'Footage analyser (demo)',
  mode: 'demo',
  detail:
    'Reads real metadata from the uploaded file (duration, resolution, frame rate, audio) and proposes an edit plan.',
  requiresCredentials: true,
  async analyse({ prompt, mediaPath }): Promise<VideoAnalysis> {
    const ffmpeg = findFfmpeg();
    const probe = ffmpeg && mediaPath ? await probeMedia(mediaPath, ffmpeg.path) : null;
    const durationMs = probe?.durationMs ?? 0;

    return {
      mode: 'demo',
      provider: 'xorvyne-analyser',
      durationMs,
      width: probe?.width ?? 0,
      height: probe?.height ?? 0,
      fps: probe?.fps ?? 0,
      hasAudio: probe?.hasAudio ?? false,
      sizeBytes: mediaPath && fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0,
      signals: [
        { name: 'Suggested cut length', value: durationMs > 0 ? `${Math.round(Math.min(15, durationMs / 1000))}s` : 'unknown' },
        { name: 'Subtitle density', value: '2 captions per 10 seconds' },
        { name: 'Hook window', value: 'first 3 seconds' },
      ],
      notes: [
        'Demo mode: the analysis is derived from real file metadata, not from a model.',
        prompt ? `Request: ${prompt}` : 'No additional instruction given.',
        'Automatic transcription and translation need a speech-to-text / translation provider (not configured).',
      ],
    };
  },
};

/* ------------------------------------------------------------- speech etc */

export const demoSpeechToText: SpeechToTextProvider = {
  id: 'speech-to-text',
  label: 'Speech-to-text (not configured)',
  mode: 'unavailable',
  detail:
    'No speech-to-text provider is configured. Subtitles are created as editable caption tracks instead of real transcripts.',
  requiresCredentials: true,
  async transcribe() {
    throw new Error('No speech-to-text provider is configured.');
  },
};

export const demoTranslation: TranslationProvider = {
  id: 'translation',
  label: 'Translation (not configured)',
  mode: 'unavailable',
  detail: 'No translation provider is configured — caption tracks are created untranslated.',
  requiresCredentials: true,
  async translate() {
    throw new Error('No translation provider is configured.');
  },
};

export const demoImageAnalysis: ImageAnalysisProvider = {
  id: 'image-analysis',
  label: 'Image analysis (not configured)',
  mode: 'unavailable',
  detail: 'No image analysis provider is configured — image-to-video plans use the prompt you typed.',
  requiresCredentials: true,
  async describe() {
    throw new Error('No image analysis provider is configured.');
  },
};
