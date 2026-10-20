import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@shared/project-ops.js';
import { useEditor } from '@client/state/editorStore.js';
import { loadProject, removeProject } from '@client/storage/repository.js';

const close = () => useEditor.getState().closeProject();
afterEach(close);

describe('editor state and history', () => {
  it('applies text operations and supports undo/redo without losing project structure', async () => {
    const project = createEmptyProject('Editing', { autoSave: false });
    useEditor.getState().openProject(project);

    const clipId = useEditor.getState().addTextToTimeline(1000, 3000, { content: 'A title' });
    expect(clipId).toBeTruthy();
    expect(useEditor.getState().project?.clips).toHaveLength(1);
    expect(useEditor.getState().project?.clips[0].text?.content).toBe('A title');

    useEditor.getState().undo();
    expect(useEditor.getState().project?.clips).toHaveLength(0);
    expect(useEditor.getState().canRedo()).toBe(true);

    await useEditor.getState().save();
    const reopened = await loadProject(project.id);
    expect(reopened?.historyIndex).toBe(0);
    expect(reopened?.history).toHaveLength(1);
    useEditor.getState().openProject(reopened!);
    expect(useEditor.getState().canRedo()).toBe(true);

    useEditor.getState().redo();
    expect(useEditor.getState().project?.clips).toHaveLength(1);
    expect(useEditor.getState().project?.clips[0].startMs).toBe(1000);
    expect(useEditor.getState().canUndo()).toBe(true);
    await removeProject(project.id);
  });

  it('keeps history entries when a new edit branches from an undone state', async () => {
    const project = createEmptyProject('Branch', { autoSave: false });
    useEditor.getState().openProject(project);
    useEditor.getState().addTextToTimeline(0, 1000, { content: 'First' });
    useEditor.getState().undo();
    useEditor.getState().addTextToTimeline(0, 2000, { content: 'Second' });
    expect(useEditor.getState().project?.clips.map((clip) => clip.text?.content)).toEqual(['Second']);
    expect(useEditor.getState().canRedo()).toBe(false);
    await removeProject(project.id);
  });
});
