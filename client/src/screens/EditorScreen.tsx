import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PreviewPlayer } from '../components/editor/PreviewPlayer.js';
import { TransportBar } from '../components/editor/TransportBar.js';
import { Timeline } from '../components/editor/Timeline.js';
import { Inspector } from '../components/editor/Inspector.js';
import { MediaPanel } from '../components/editor/MediaPanel.js';
import { Button, EmptyState, Segmented } from '../components/ui/primitives.js';
import { useEditor } from '../state/editorStore.js';
import { useT } from '../lib/useT.js';

type Pane = 'timeline' | 'inspector' | 'media';

export function EditorScreen() {
  const t = useT();
  const navigate = useNavigate();
  const project = useEditor((state) => state.project);
  const [pane, setPane] = useState<Pane>('timeline');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (event.code === 'Space') {
        event.preventDefault();
        const state = useEditor.getState();
        state.setPlaying(!state.isPlaying);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) useEditor.getState().redo();
        else useEditor.getState().undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!project) {
    return (
      <div className="page">
        <EmptyState
          icon="film"
          title={t('editor.noProject')}
          text={t('editor.openProject')}
          action={
            <Button variant="primary" icon="folder" onClick={() => navigate('/projects')}>
              {t('nav.projects')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="editor">
      <div className="editor__stage">
        <PreviewPlayer />
        <TransportBar />
      </div>

      <div className="editor__mobile-tabs">
        <Segmented
          ariaLabel="Editor panels"
          value={pane}
          onChange={setPane}
          options={[
            { value: 'timeline', label: t('editor.timeline') },
            { value: 'inspector', label: t('editor.inspector') },
            { value: 'media', label: t('editor.assets') },
          ]}
        />
      </div>

      <div className={`editor__pane editor__pane--timeline${pane === 'timeline' ? ' is-active' : ''}`}>
        <Timeline />
      </div>

      <div className={`editor__pane editor__pane--inspector${pane === 'inspector' ? ' is-active' : ''}`}>
        <Inspector />
      </div>

      <div className={`editor__pane editor__pane--media${pane === 'media' ? ' is-active' : ''}`}>
        <MediaPanel />
      </div>
    </div>
  );
}
