import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  SearchInput,
  Spinner,
  usePrompt,
} from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { useAppStore } from '../state/appStore.js';
import { useEditor } from '../state/editorStore.js';
import { useT } from '../lib/useT.js';
import { loadProject } from '../storage/repository.js';
import { formatDuration } from '../lib/format.js';
import { toast } from '../state/toastStore.js';

export function ProjectsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const projects = useAppStore((state) => state.projects);
  const status = useAppStore((state) => state.status);
  const error = useAppStore((state) => state.error);
  const refresh = useAppStore((state) => state.refresh);
  const createProject = useAppStore((state) => state.createProject);
  const renameProject = useAppStore((state) => state.renameProject);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const openProject = useEditor((state) => state.openProject);

  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { prompt, dialog } = usePrompt();

  useEffect(() => {
    if (status === 'idle') void refresh();
  }, [status, refresh]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(needle));
  }, [projects, query]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const id = await createProject();
      const project = await loadProject(id);
      if (project) openProject(project);
      toast.success('New project created.');
      navigate('/editor');
    } catch {
      toast.error('The project could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = async (id: string) => {
    try {
      const project = await loadProject(id);
      if (!project) {
        toast.error('That project could not be opened.');
        return;
      }
      openProject(project);
      navigate('/editor');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The project could not be opened.');
    }
  };

  const handleRename = async (id: string, currentName: string) => {
    const name = await prompt({
      title: t('common.rename'),
      label: t('projects.untitled'),
      initialValue: currentName,
      confirmLabel: t('common.save'),
    });
    if (!name) return;
    await renameProject(id, name);
    toast.success('Project renamed.');
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete;
    setPendingDelete(null);
    if (useEditor.getState().project?.id === id) useEditor.getState().closeProject();
    await deleteProject(id);
    toast.success('Project deleted.');
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <span className="eyebrow">Library</span>
            <h1>{t('projects.title')}</h1>
          </div>
          <Button variant="primary" icon="plus" onClick={handleCreate} disabled={busy}>
            {t('projects.new')}
          </Button>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={t('projects.search')} />
      </header>

      {status === 'loading' ? (
        <div className="row" style={{ gap: 12 }}>
          <Spinner /> <span className="text-sm text-mute">{t('common.loading')}</span>
        </div>
      ) : null}

      {status === 'error' ? (
        <ErrorState title={t('common.error')} text={error ?? undefined} onRetry={() => void refresh()} />
      ) : null}

      {status === 'ready' && filtered.length === 0 ? (
        <EmptyState
          icon="folder"
          title={projects.length === 0 ? t('home.noProjects') : t('projects.empty')}
          text={projects.length === 0 ? t('home.noProjectsHint') : t('projects.emptyHint')}
          action={
            <Button variant="primary" icon="plus" onClick={handleCreate}>
              {t('projects.new')}
            </Button>
          }
        />
      ) : null}

      {filtered.length > 0 ? (
        <div className="grid grid--wide">
          {filtered.map((project) => (
            <Card key={project.id} className="project-card">
              <div className="project-card__thumb" aria-hidden="true">
                <Icon name="film" size={26} />
                <span className="project-card__duration mono">{formatDuration(project.durationMs)}</span>
              </div>
              <div className="row row--between">
                <span className="card__title truncate">{project.name}</span>
                <Chip>{project.createdFrom}</Chip>
              </div>
              <div className="card__meta">
                <span>
                  {project.clipCount} {t('projects.clips')}
                </span>
                <span>
                  {project.trackCount} tracks
                </span>
              </div>
              <div className="row">
                <Button variant="primary" size="sm" icon="arrowRight" onClick={() => void handleOpen(project.id)}>
                  {t('common.open')}
                </Button>
                <Button variant="ghost" size="sm" icon="pencil" onClick={() => void handleRename(project.id, project.name)}>
                  {t('common.rename')}
                </Button>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => setPendingDelete(project.id)}>
                  {t('common.delete')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t('projects.deleteConfirm')}
        text={t('projects.deleteHint')}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />
      {dialog}
    </div>
  );
}
