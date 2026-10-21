import type { CommandRequest, CommandResponse, EditOperation, ProposedEdit } from '@shared/types.js';
import { config } from '../config.js';
import { parseCommand } from '@shared/ai-commands.js';
import { EFFECT_BY_TYPE, STYLE_PRESETS, TRANSITION_CATALOG } from '@shared/catalog.js';
import { z } from 'zod';
import type { CommandParserProvider, TextToVideoProvider } from './types.js';

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * Live command parser for any OpenAI-compatible chat endpoint.
 *
 * The model is asked to return a JSON proposal. Every returned operation is
 * validated against the real project before it is shown to the user, and the
 * deterministic parser is used as a fallback when the model misbehaves.
 */
export const liveCommandParser: CommandParserProvider = {
  id: 'command-parser',
  label: 'Command parser (live model)',
  mode: 'live',
  detail: `Uses ${config.providers.commandModel} through a configured OpenAI-compatible endpoint.`,
  requiresCredentials: true,

  async parse(request: CommandRequest): Promise<CommandResponse> {
    const endpoint = config.providers.commandEndpoint!;
    const apiKey = config.providers.commandApiKey!;

    const systemPrompt = `You translate video-editing requests into structured edit operations for the XORVYNE editor.
Reply with JSON only, using this shape:
{
  "reply": "one short sentence describing the change",
  "understood": true,
  "proposal": {
    "intent": "trim",
    "summary": "short summary",
    "details": ["detail line"],
    "operations": [ ... ],
    "warnings": []
  }
}
Supported operations: trimClip{clipId,startMs,endMs}, splitClip{clipId,atMs}, deleteClip{clipId},
moveClip{clipId,startMs,trackId?}, setClipSpeed{clipId,speed}, setTransition{clipId,transition{type,durationMs}},
setEffect{clipId,effect{type,params}}, applyPreset{clipId,presetId}, addTextClip{trackId,startMs,durationMs,text},
addAudioClip{trackId,startMs,durationMs,name}, setClipVolume{clipId,volume}, setTrackMuted{trackId,muted},
setProjectResolution{width,height}, setProjectFps{fps}.
Only use clipId and trackId values that exist in the project.`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          model: config.providers.commandModel,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                request: request.message,
                project: {
                  name: request.project.name,
                  settings: request.project.settings,
                  selectedClipId: request.project.selectedClipId ?? null,
                  tracks: request.project.tracks.map((track) => ({ id: track.id, kind: track.kind, name: track.name })),
                  clips: request.project.clips.map((clip) => ({
                    id: clip.id,
                    name: clip.name,
                    kind: clip.kind,
                    trackId: clip.trackId,
                    startMs: clip.startMs,
                    durationMs: clip.durationMs,
                    inMs: clip.inMs,
                    transitionIn: clip.transitionIn ?? null,
                  })),
                },
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Provider responded with ${response.status}`);
      }

      const payload = (await response.json()) as ChatResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('Provider returned an empty response');

      const parsed = JSON.parse(content) as {
        reply?: string;
        understood?: boolean;
        proposal?: ProposedEdit;
      };

      const validOperations = (parsed.proposal?.operations ?? []).filter((operation) =>
        isValidOperation(operation, request),
      );

      if (validOperations.length === 0) {
        // The model produced nothing usable — fall back to the deterministic parser.
        const fallback = parseCommand(request.message, {
          clips: request.project.clips,
          tracks: request.project.tracks,
          assets: request.project.assets,
          settings: request.project.settings,
          selectedClipId: request.project.selectedClipId ?? null,
        });
        return {
          reply: fallback.reply,
          proposal: fallback.proposal,
          mode: 'live',
          provider: 'xorvyne-local-parser-fallback',
          understood: fallback.understood,
          suggestions: fallback.suggestions,
        };
      }

      return {
        reply: parsed.reply ?? 'Here is a proposed change.',
        understood: parsed.understood ?? true,
        proposal: {
          id: `prop_${Date.now().toString(36)}`,
          intent: parsed.proposal?.intent ?? 'edit',
          summary: parsed.proposal?.summary ?? 'Proposed change',
          details: parsed.proposal?.details ?? [],
          operations: validOperations,
          warnings: parsed.proposal?.warnings ?? [],
        },
        mode: 'live',
        provider: config.providers.commandModel,
        suggestions: [],
      };
    } catch {
      const fallback = parseCommand(request.message, {
        clips: request.project.clips,
        tracks: request.project.tracks,
        assets: request.project.assets,
        settings: request.project.settings,
        selectedClipId: request.project.selectedClipId ?? null,
      });
      return {
        reply: `${fallback.reply}`,
        proposal: fallback.proposal,
        mode: 'demo',
        provider: 'xorvyne-local-parser-fallback',
        understood: fallback.understood,
        suggestions: fallback.suggestions,
      };
    }
  },
};

const textOverlaySchema = z.object({
  content: z.string().max(10000),
  fontFamily: z.string().max(200),
  fontSize: z.number().min(8).max(500),
  fontWeight: z.number().min(100).max(900),
  color: z.string().max(20),
  align: z.enum(['left', 'center', 'right']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  uppercase: z.boolean(),
  letterSpacing: z.number().min(-100).max(100),
  shadow: z.boolean(),
  background: z.string().max(100).nullable(),
});

function isValidOperation(operation: EditOperation, request: CommandRequest): boolean {
  const clipIds = new Set(request.project.clips.map((clip) => clip.id));
  const trackIds = new Set(request.project.tracks.map((track) => track.id));
  const validClip = 'clipId' in operation && clipIds.has(operation.clipId);
  switch (operation.op) {
    case 'trimClip':
      return validClip && Number.isFinite(operation.startMs) && Number.isFinite(operation.endMs) && operation.startMs >= 0 && operation.endMs - operation.startMs >= 200 && operation.endMs <= 1_800_000;
    case 'splitClip':
      return validClip && Number.isFinite(operation.atMs) && operation.atMs >= 0 && operation.atMs <= 1_800_000;
    case 'deleteClip':
      return validClip;
    case 'moveClip':
      return validClip && Number.isFinite(operation.startMs) && operation.startMs >= 0 && operation.startMs <= 1_800_000 && (!operation.trackId || trackIds.has(operation.trackId));
    case 'setClipSpeed':
      return validClip && Number.isFinite(operation.speed) && operation.speed >= 0.1 && operation.speed <= 16;
    case 'setTransition':
      return validClip && TRANSITION_CATALOG.some((item) => item.type === operation.transition.type) && Number.isFinite(operation.transition.durationMs) && operation.transition.durationMs >= 0 && operation.transition.durationMs <= 10000;
    case 'setEffect':
      return validClip && Boolean(EFFECT_BY_TYPE[operation.effect.type]) && typeof operation.effect.enabled === 'boolean';
    case 'applyPreset':
      return validClip && STYLE_PRESETS.some((preset) => preset.id === operation.presetId);
    case 'addTextClip':
      return trackIds.has(operation.trackId) && Number.isFinite(operation.startMs) && operation.startMs >= 0 && Number.isFinite(operation.durationMs) && operation.durationMs >= 200 && operation.durationMs <= 1_800_000 && textOverlaySchema.safeParse(operation.text).success;
    case 'addAudioClip':
      return trackIds.has(operation.trackId) && Number.isFinite(operation.startMs) && operation.startMs >= 0 && Number.isFinite(operation.durationMs) && operation.durationMs >= 200 && operation.durationMs <= 1_800_000 && operation.name.length <= 255;
    case 'setClipVolume':
      return validClip && Number.isFinite(operation.volume) && operation.volume >= 0 && operation.volume <= 2;
    case 'setTrackMuted':
      return trackIds.has(operation.trackId) && typeof operation.muted === 'boolean';
    case 'setProjectResolution':
      return Number.isInteger(operation.width) && Number.isInteger(operation.height) && operation.width >= 16 && operation.width <= 7680 && operation.height >= 16 && operation.height <= 4320;
    case 'setProjectFps':
      return [24, 25, 30, 50, 60].includes(operation.fps);
    default:
      return false;
  }
}

/**
 * Generic live text-to-video storyboard adapter.
 *
 * This endpoint contract returns a storyboard only. XORVYNE deliberately
 * keeps footageGenerated=false until a provider returns real media bytes or a
 * validated downloadable asset that is integrated into the project pipeline.
 */
const videoShotSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  durationMs: z.number().int().min(250).max(180000),
  prompt: z.string().max(2000).optional(),
  cameraNote: z.string().max(500).optional(),
}).strict();

const videoPlanSchema = z.object({
  shots: z.array(videoShotSchema).min(1).max(24),
}).strict();

export const liveTextToVideo: TextToVideoProvider = {
  id: 'text-to-video',
  label: 'Video generation provider (storyboard contract)',
  mode: 'live',
  detail: `Uses ${config.providers.videoModel} through a configured endpoint; currently accepts a validated storyboard, not rendered footage.`,
  requiresCredentials: true,
  async generate({ prompt, style, durationMs }) {
    const endpoint = config.providers.videoEndpoint;
    const apiKey = config.providers.videoApiKey;
    if (!endpoint || !apiKey) {
      throw new Error('Text-to-video provider is not configured. Set XORVYNE_VIDEO_ENDPOINT and XORVYNE_VIDEO_API_KEY on the server.');
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(120_000),
        body: JSON.stringify({
          model: config.providers.videoModel,
          prompt,
          style: style ?? 'cinematic',
          durationMs: durationMs ?? 30000,
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('The storyboard provider timed out after 120 seconds.');
      }
      throw new Error('Could not reach the configured storyboard provider.');
    }

    if (!response.ok) {
      // Avoid returning provider response bodies that may contain sensitive details.
      throw new Error(`Storyboard provider responded with HTTP ${response.status}.`);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new Error('Storyboard provider returned invalid JSON.');
    }

    const parsed = videoPlanSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Storyboard provider returned an invalid response: expected 1–24 valid shots.');
    }

    const shots = parsed.data.shots.map((shot, index) => ({
      index,
      title: shot.title,
      description: shot.description,
      durationMs: shot.durationMs,
      prompt: shot.prompt ?? prompt,
      cameraNote: shot.cameraNote ?? '',
    }));

    const totalDuration = shots.reduce((total, shot) => total + shot.durationMs, 0);
    if (totalDuration > 300_000) {
      throw new Error('Storyboard provider returned a plan longer than the 5-minute maximum.');
    }

    return {
      mode: 'live',
      provider: config.providers.videoModel,
      title: prompt.trim().slice(0, 60) || 'Untitled sequence',
      summary: `${shots.length} validated storyboard shots (${Math.round(totalDuration / 1000)} seconds). No rendered footage was returned.`,
      shots,
      stylePreset: style ?? 'cinematic',
      musicSuggestion: 'Cinematic Pulse',
      footageGenerated: false,
      notes: [
        'The configured endpoint returned a storyboard only. No video file or media asset was returned, so XORVYNE has not marked footage as generated.',
        'Real text-to-video generation requires a provider-specific adapter that retrieves and validates rendered media and imports it into the project asset pipeline.',
      ],
    };
  },
};
