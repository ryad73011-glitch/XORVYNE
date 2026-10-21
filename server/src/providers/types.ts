import type {
  CommandRequest,
  CommandResponse,
  ImageToVideoPlan,
  ProviderMode,
  TextToVideoPlan,
  VideoAnalysis,
} from '@shared/types.js';

/**
 * Provider-independent AI interfaces.
 *
 * Every capability the studio needs is expressed as a small interface so a
 * real vendor can be plugged in without touching the editor or the API
 * surface. When no provider is configured the demo implementation is used and
 * the response is clearly labelled as demo mode.
 */
export interface ProviderBase {
  id: string;
  label: string;
  mode: ProviderMode;
  detail: string;
  requiresCredentials: boolean;
}

export interface CommandParserProvider extends ProviderBase {
  parse(request: CommandRequest): Promise<CommandResponse>;
}

export interface TextToVideoProvider extends ProviderBase {
  generate(input: { prompt: string; style?: string; durationMs?: number }): Promise<TextToVideoPlan>;
}

export interface ImageToVideoProvider extends ProviderBase {
  generate(input: { prompt: string; motion?: string; durationMs?: number; imagePath?: string }): Promise<ImageToVideoPlan>;
}

export interface VideoEditProvider extends ProviderBase {
  analyse(input: { prompt: string; mediaPath?: string; fileName?: string }): Promise<VideoAnalysis>;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SpeechToTextProvider extends ProviderBase {
  transcribe(input: { mediaPath: string; language?: string }): Promise<{ language: string; segments: TranscriptSegment[] }>;
}

export interface TranslationProvider extends ProviderBase {
  translate(input: { text: string; target: string; source?: string }): Promise<string>;
}

export interface ImageAnalysisProvider extends ProviderBase {
  describe(input: { imagePath: string }): Promise<{ description: string; labels: string[] }>;
}

export interface ProviderRegistry {
  command: CommandParserProvider;
  textToVideo: TextToVideoProvider;
  imageToVideo: ImageToVideoProvider;
  videoEdit: VideoEditProvider;
  speechToText: SpeechToTextProvider;
  translation: TranslationProvider;
  imageAnalysis: ImageAnalysisProvider;
}
