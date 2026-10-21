import type {
  CommandRequest,
  CommandResponse,
  ExportJob,
  ExportSettings,
  ImageToVideoPlan,
  ProviderInfo,
  TextToVideoPlan,
  VideoAnalysis,
} from '@shared/types.js';

const API_BASE = '/api';

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      'The XORVYNE server is unreachable. Start it with `npm run dev` (or `npm start`) and try again.',
      0,
      error,
    );
  }
  if (!response.ok) {
    let details: unknown;
    let message = `Request failed (${response.status}).`;
    try {
      details = await response.json();
      const payload = details as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      /* non JSON error body */
    }
    throw new ApiError(message, response.status, details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface ServerStatus {
  ok: boolean;
  version: string;
  ffmpeg: { available: boolean; path: string | null; version: string | null };
  providers: ProviderInfo[];
  time: string;
}

export const api = {
  status: () => request<ServerStatus>('/status'),
  providers: () => request<{ providers: ProviderInfo[] }>('/providers'),
  command: (payload: CommandRequest) =>
    request<CommandResponse>('/ai/command', { method: 'POST', body: JSON.stringify(payload) }),
  textToVideo: (payload: { prompt: string; style?: string; durationMs?: number }) =>
    request<TextToVideoPlan>('/ai/text-to-video', { method: 'POST', body: JSON.stringify(payload) }),
  imageToVideo: (payload: { prompt: string; motion?: string; durationMs?: number }) =>
    request<ImageToVideoPlan>('/ai/image-to-video', { method: 'POST', body: JSON.stringify(payload) }),
  editExisting: (payload: { prompt: string; fileName?: string; uploadToken?: string }) =>
    request<VideoAnalysis>('/ai/edit-existing', { method: 'POST', body: JSON.stringify(payload) }),
  uploadMedia: async (file: Blob, fileName: string, onProgress?: (ratio: number) => void) => {
    const form = new FormData();
    form.append('file', file, fileName);
    return new Promise<{ token: string; fileName: string; mimeType: string; sizeBytes: number; durationMs: number; width: number; height: number; hasAudio: boolean }>(
      (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/media`);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
        };
        xhr.onload = () => {
          try {
            const payload = JSON.parse(xhr.responseText) as { error?: string } & Record<string, unknown>;
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(payload as never);
            } else {
              reject(new ApiError(payload.error ?? `Upload failed (${xhr.status}).`, xhr.status, payload));
            }
          } catch (error) {
            reject(new ApiError('The upload response could not be read.', xhr.status, error));
          }
        };
        xhr.onerror = () => reject(new ApiError('The upload was interrupted.', 0));
        xhr.send(form);
      },
    );
  },
  createExportJob: (payload: {
    project: unknown;
    settings: ExportSettings;
    media: { assetId: string; token: string }[];
  }) => request<ExportJob>('/export/jobs', { method: 'POST', body: JSON.stringify(payload) }),
  exportJob: (id: string) => request<ExportJob>(`/export/jobs/${id}`),
  cancelExportJob: (id: string) => request<ExportJob>(`/export/jobs/${id}/cancel`, { method: 'POST' }),
  downloadUrl: (id: string) => `${API_BASE}/export/jobs/${id}/file`,
};
