import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Chip, EmptyState, ErrorState, Spinner } from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { useAppStore } from '../state/appStore.js';
import { useEditor } from '../state/editorStore.js';
import { loadProject } from '../storage/repository.js';
import { useT } from '../lib/useT.js';
import { formatDuration } from '../lib/format.js';
import { toast } from '../state/toastStore.js';

function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function HomeScreen() {
  const t = useT();
  const navigate = useNavigate();
  const projects = useAppStore((state) => state.projects);
  const status = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);
  const refresh = useAppStore((state) => state.refresh);
  const createProject = useAppStore((state) => state.createProject);
  const openProject = useEditor((state) => state.openProject);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === 'idle') void refresh();
  }, [status, refresh]);

  const stats = useMemo(() => {
    const totalMs = projects.reduce((sum, project) => sum + project.durationMs, 0);
    const clips = projects.reduce((sum, project) => sum + project.clipCount, 0);
    return { projects: projects.length, minutes: Math.round(totalMs / 60000), clips };
  }, [projects]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const id = await createProject();
      const project = await loadProject(id);
      if (project) openProject(project);
      navigate('/editor');
      toast.success('Project created. Import media to start editing.');
    } catch {
      toast.error('The project could not be created. Check that local storage is available.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpen = async (id: string) => {
    const project = await loadProject(id);
    if (!project) {
      toast.error('That project could not be opened.');
      return;
    }
    openProject(project);
    navigate('/editor');
  };

  return (
    <div className="page">
      <section className="hero">
        <span className="eyebrow">XORVYNE Studio</span>
        <h1 className="hero__title">
          Create <span className="text-accent">beyond</span> limits
        </h1>
        <p className="lede">
          A cinematic AI studio for cutting, grading and finishing video — on the web and on Android.
          Everything you import stays on your device until you export.
        </p>
        <div className="row">
          <Button variant="primary" icon="plus" onClick={handleCreate} disabled={creating}>
            {creating ? t('common.loading') : t('home.createProject')}
          </Button>
          <Button variant="outline" icon="film" onClick={() => navigate('/projects')}>
            {t('nav.projects')}
          </Button>
          <Button variant="ghost" icon="sparkles" onClick={() => navigate('/assistant')}>
            {t('nav.assistant')}
          </Button>
        </div>
      </section>

      <section className="stack">
        <div className="row row--between">
          <h2>{t('home.aiWorkflows')}</h2>
          <span className="text-xs text-mute">Demo mode — provider-agnostic</span>
        </div>
        <div className="grid">
          <Card interactive onClick={() => navigate('/assistant?workflow=text-to-video')}>
            <span className="workflow__icon">
              <Icon name="text" size={20} />
            </span>
            <span className="card__title">{t('home.t2v')}</span>
            <span className="text-sm text-mute">{t('home.t2vHint')}</span>
            <Chip tone="demo">Demo</Chip>
          </Card>
          <Card interactive onClick={() => navigate('/assistant?workflow=image-to-video')}>
            <span className="workflow__icon">
              <Icon name="image" size={20} />
            </span>
            <span className="card__title">{t('home.i2v')}</span>
            <span className="text-sm text-mute">{t('home.i2vHint')}</span>
            <Chip tone="demo">Demo</Chip>
          </Card>
          <Card interactive onClick={() => navigate('/assistant?workflow=edit-existing')}>
            <span className="workflow__icon">
              <Icon name="film" size={20} />
            </span>
            <span className="card__title">{t('home.e2v')}</span>
            <span className="text-sm text-mute">{t('home.e2vHint')}</span>
            <Chip tone="demo">Demo</Chip>
          </Card>
        </div>
      </section>

      <section className="stack">
        <h2>{t('home.recent')}</h2>
        {status === 'loading' ? (
          <div className="row" style={{ gap: 12 }}>
            <Spinner /> <span className="text-sm text-mute">{t('common.loading')}</span>
          </div>
        ) : null}
        {status === 'error' ? (
          <ErrorState title={t('common.error')} text={error ?? undefined} onRetry={() => void refresh()} />
        ) : null}
        {status === 'ready' && projects.length === 0 ? (
          <EmptyState
            icon="film"
            title={t('home.noProjects')}
            text={t('home.noProjectsHint')}
            action={
              <Button variant="primary" icon="plus" onClick={handleCreate}>
                {t('home.createProject')}
              </Button>
            }
          />
        ) : null}
        {projects.length > 0 ? (
          <div className="grid">
            {projects.slice(0, 6).map((project) => (
              <Card key={project.id} interactive onClick={() => void handleOpen(project.id)}>
                <div className="row row--between">
                  <span className="card__title truncate">{project.name}</span>
                  <Chip>{project.createdFrom}</Chip>
                </div>
                <div className="card__meta">
                  <span className="row" style={{ gap: 6 }}>
                    <Icon name="clock" size={13} /> {formatDuration(project.durationMs)}
                  </span>
                  <span>
                    {project.clipCount} {t('projects.clips')}
                  </span>
                  <span>{formatRelative(project.updatedAt)}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : null}
      </section>

      <section className="stack">
        <h2>{t('home.stats')}</h2>
        <div className="stat-row">
          <Card>
            <span className="stat__value">{stats.projects}</span>
            <span className="stat__label">{t('home.statProjects')}</span>
          </Card>
          <Card>
            <span className="stat__value">{stats.minutes}</span>
            <span className="stat__label">{t('home.statDuration')}</span>
          </Card>
          <Card>
            <span className="stat__value">{stats.clips}</span>
            <span className="stat__label">{t('home.statClips')}</span>
          </Card>
        </div>
      </section>

      <p className="text-xs text-mute" style={{ paddingBottom: 8 }}>
        Tip: open a project, import media, then ask the assistant “Trim the first three seconds.” — every change is
        proposed before it touches your timeline.
      </p>
    </div>
  );
}
