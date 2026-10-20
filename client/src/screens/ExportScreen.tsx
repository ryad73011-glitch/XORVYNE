import { useEffect, useState } from 'react';
import type { ExportJob, ExportSettings } from '@shared/types.js';
import { Button, Card, Chip, EmptyState, ProgressBar, SelectInput, Slider, TextInput } from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { useEditor } from '../state/editorStore.js';
import { useT } from '../lib/useT.js';
import { api, type ServerStatus } from '../lib/api.js';
import { runExport, type ExportProgress } from '../lib/exporter.js';
import { toast } from '../state/toastStore.js';
import { formatBytes } from '../storage/db.js';
import { formatDuration } from '../lib/format.js';

export function ExportScreen() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const [settings, setSettings] = useState<ExportSettings>({
    format: 'mp4',
    resolution: 'source',
    fps: 'source',
    quality: 0.6,
    includeAudio: true,
    fileName: 'xorvyne-export',
  });
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    if (project && settings.fileName === 'xorvyne-export') {
      setSettings((current) => ({
        ...current,
        fileName: project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'xorvyne-export',
      }));
    }
  }, [project, settings.fileName]);

  const start = async () => {
    if (!project) return;
    setRunning(true);
    setJob(null);
    try {
      const result = await runExport(project, settings, (value) => {
        setProgress(value);
        if (value.job) setJob(value.job);
      });
      if (result.status === 'complete') {
        toast.success('Export finished — your file is ready to download.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The export failed.');
    } finally {
      setRunning(false);
    }
  };

  if (!project) {
    return (
      <div className="page">
        <EmptyState
          icon="download"
          title={t('export.noProject')}
          text="Open a project and export it from this device."
        />
      </div>
    );
  }

  const durationMs = project.clips.reduce((max, clip) => Math.max(max, clip.startMs + clip.durationMs), 0);
  const phase = progress?.phase ?? 'idle';

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <span className="eyebrow">Delivery</span>
            <h1>{t('export.title')}</h1>
          </div>
          {status ? (
            status.ffmpeg.available ? (
              <Chip tone="live">{t('export.realRender')}</Chip>
            ) : (
              <Chip tone="warning">{t('export.unavailable')}</Chip>
            )
          ) : null}
        </div>
        <p className="lede">
          {status?.ffmpeg.available
            ? `A real ${status.ffmpeg.version?.split(' ')[0] ?? 'ffmpeg'} encoder renders the timeline on this machine — the file you download is a genuine video.`
            : 'No encoder is available on the server, so the export cannot produce a real file yet.'}
        </p>
      </header>

      <div className="export-layout">
        <Card className="stack">
          <span className="eyebrow">Settings</span>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <SelectInput
              label={t('export.format')}
              value={settings.format}
              onChange={(event) => setSettings({ ...settings, format: event.target.value as ExportSettings['format'] })}
            >
              <option value="mp4">MP4 (H.264 + AAC)</option>
              <option value="webm">WebM (VP9 + Opus)</option>
            </SelectInput>
            <SelectInput
              label={t('export.resolution')}
              value={settings.resolution}
              onChange={(event) =>
                setSettings({ ...settings, resolution: event.target.value as ExportSettings['resolution'] })
              }
            >
              <option value="source">Source ({project.settings.width}×{project.settings.height})</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="vertical">Vertical 1080×1920</option>
            </SelectInput>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <SelectInput
              label={t('export.frameRate')}
              value={settings.fps}
              onChange={(event) => setSettings({ ...settings, fps: event.target.value as ExportSettings['fps'] })}
            >
              <option value="source">Source ({project.settings.fps} fps)</option>
              <option value="24">24 fps</option>
              <option value="30">30 fps</option>
              <option value="60">60 fps</option>
            </SelectInput>
            <TextInput
              label={t('export.fileName')}
              value={settings.fileName}
              onChange={(event) => setSettings({ ...settings, fileName: event.target.value })}
            />
          </div>
          <Slider
            label={t('export.quality')}
            min={0}
            max={1}
            step={0.05}
            value={settings.quality}
            format={(value) =>
              value < 0.35 ? t('export.qualityDraft') : value < 0.75 ? t('export.qualityStandard') : t('export.qualityHigh')
            }
            onChange={(value) => setSettings({ ...settings, quality: value })}
          />
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.includeAudio}
              onChange={(event) => setSettings({ ...settings, includeAudio: event.target.checked })}
            />
            <span className="switch__track">
              <span className="switch__thumb" />
            </span>
            <span className="text-sm text-dim">Include audio track</span>
          </label>

          <Button variant="primary" icon="download" onClick={() => void start()} disabled={running}>
            {running ? t('export.rendering') : t('export.start')}
          </Button>
          <p className="text-xs text-mute">{t('export.uploadNote')}</p>
        </Card>

        <Card className="stack">
          <span className="eyebrow">Status</span>
          {phase === 'idle' ? (
            <div className="stack">
              <div className="row">
                <Chip>{formatDuration(durationMs)}</Chip>
                <Chip>{project.clips.length} clips</Chip>
                <Chip>{project.assets.length} assets</Chip>
              </div>
              <p className="text-sm text-mute">
                Nothing is exported yet. Start an export to see live progress and download the finished file.
              </p>
            </div>
          ) : (
            <div className="stack">
              <div className="row row--between">
                <span className="text-sm">{progress?.message}</span>
                <span className="mono text-xs text-mute">{Math.round((progress?.progress ?? 0) * 100)}%</span>
              </div>
              <ProgressBar value={progress?.progress ?? 0} />
              {job?.status === 'complete' ? (
                <div className="stack">
                  <div className="row">
                    <Chip tone="success">{t('export.complete')}</Chip>
                    {job.realRender ? <Chip tone="live">Real render</Chip> : null}
                    {job.fileSizeBytes ? <Chip>{formatBytes(job.fileSizeBytes)}</Chip> : null}
                  </div>
                  <a className="btn btn--primary" href={api.downloadUrl(job.id)} download={job.fileName}>
                    <Icon name="download" size={16} /> {t('export.download')} {job.fileName}
                  </a>
                </div>
              ) : null}
              {job?.status === 'failed' ? (
                <div className="stack">
                  <Chip tone="danger">{t('export.failed')}</Chip>
                  <p className="text-sm text-mute">{job.errorMessage}</p>
                </div>
              ) : null}
              {job?.logTail?.length ? (
                <details className="stack">
                  <summary className="text-xs text-mute">Encoder log</summary>
                  <pre className="log">{job.logTail.join('\n')}</pre>
                </details>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
