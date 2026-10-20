import { config } from '../config.js';
import { demoCommandParser, demoImageToVideo, demoSpeechToText, demoTextToVideo, demoTranslation, demoVideoEdit, demoImageAnalysis } from './demo.js';
import { liveCommandParser, liveTextToVideo } from './live.js';
import type { ProviderRegistry } from './types.js';

/**
 * Resolves the active provider for every capability.
 *
 * A live provider is only selected when both an endpoint and a key are
 * configured, so a half-configured environment can never accidentally make a
 * paid call.
 */
export function resolveProviders(): ProviderRegistry {
  const command = config.providers.commandEndpoint && config.providers.commandApiKey ? liveCommandParser : demoCommandParser;
  const textToVideo = config.providers.videoEndpoint && config.providers.videoApiKey ? liveTextToVideo : demoTextToVideo;

  return {
    command,
    textToVideo,
    imageToVideo: demoImageToVideo,
    videoEdit: demoVideoEdit,
    speechToText: demoSpeechToText,
    translation: demoTranslation,
    imageAnalysis: demoImageAnalysis,
  };
}

export function providerList(registry: ProviderRegistry) {
  return [
    registry.command,
    registry.textToVideo,
    registry.imageToVideo,
    registry.videoEdit,
    registry.speechToText,
    registry.translation,
    registry.imageAnalysis,
  ].map((provider) => ({
    id: provider.id,
    label: provider.label,
    mode: provider.mode,
    detail: provider.detail,
    requiresCredentials: provider.requiresCredentials,
  }));
}
