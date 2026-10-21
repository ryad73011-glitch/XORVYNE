import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import fs from 'node:fs';
import { config, findFfmpeg } from '../config.js';
import { MediaValidationError, registerUpload } from '../export/media.js';

export const mediaRouter = Router();

const ACCEPTED = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/3gpp',
  'video/ogg',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/bmp',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-m4a',
]);

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!ACCEPTED.has(file.mimetype.toLowerCase())) {
      callback(new Error(`Unsupported media type: ${file.mimetype}`));
      return;
    }
    callback(null, true);
  },
});

mediaRouter.post('/media', (request, response) => {
  upload.single('file')(request, response, async (error: unknown) => {
    if (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.';
      response.status(400).json({ error: message });
      return;
    }
    if (!request.file) {
      response.status(400).json({ error: 'No file was uploaded.' });
      return;
    }
    try {
      const ffmpeg = findFfmpeg();
      const record = await registerUpload(
        request.file.path,
        request.file.originalname,
        request.file.mimetype,
        request.file.size,
        ffmpeg?.path ?? 'ffmpeg',
      );
      response.json({
        token: record.token,
        fileName: record.originalName,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        durationMs: record.durationMs,
        width: record.width,
        height: record.height,
        hasAudio: record.hasAudio,
      });
    } catch (uploadError) {
      try {
        fs.rmSync(request.file.path, { force: true });
      } catch {
        /* ignore */
      }
      response.status(uploadError instanceof MediaValidationError ? 400 : 500).json({
        error: uploadError instanceof Error ? uploadError.message : 'The upload could not be processed.',
      });
    }
  });
});
