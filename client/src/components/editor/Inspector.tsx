import { useMemo, useState } from 'react';
import { EFFECT_CATALOG, STYLE_PRESETS, TRANSITION_CATALOG, FONT_CATALOG } from '@shared/catalog.js';
import type { ClipEffect } from '@shared/types.js';
import { useEditor } from '../../state/editorStore.js';
import { useT } from '../../lib/useT.js';
import { Button, Card, Chip, Field, SelectInput, Slider, TextInput } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import { formatDuration } from '../../lib/format.js';
import { toast } from '../../state/toastStore.js';
import { useSettings } from '../../state/settingsStore.js';

export function Inspector() {
  const t = useT();
  const project = useEditor((state) => state.project);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const setClipEffect = useEditor((state) => state.setClipEffect);
  const setClipTransition = useEditor((state) => state.setClipTransition);
  const setClipText = useEditor((state) => state.setClipText);
  const setClipVolume = useEditor((state) => state.setClipVolume);
  const setClipOpacity = useEditor((state) => state.setClipOpacity);
  const setClipSpeed = useEditor((state) => state.setClipSpeed);
  const deleteClip = useEditor((state) => state.deleteClip);
  const updateProjectSettings = useEditor((state) => state.updateProjectSettings);
  const renameProject = useEditor((state) => state.renameProject);
  const [newEffect, setNewEffect] = useState('');
  const defaultTransitionMs = useSettings((state) => state.defaultTransitionMs);

  const clip = useMemo(
    () => project?.clips.find((item) => item.id === selectedClipId) ?? null,
    [project?.clips, selectedClipId],
  );

  if (!project) return null;

  if (!clip) {
    return (
      <div className="inspector">
        <header className="inspector__header">
          <h2>{t('editor.inspector')}</h2>
          <span className="chip">{t('editor.noClipSelected')}</span>
        </header>
        <div className="inspector__body stack">
          <Field label={t('projects.untitled')}>
            <input
              className="input"
              value={project.name}
              onChange={(event) => renameProject(event.target.value)}
            />
          </Field>
          <Field label={t('settings.defaultCanvas')}>
            <div className="row">
              <input
                className="input"
                type="number"
                min={16}
                max={7680}
                value={project.settings.width}
                onChange={(event) =>
                  updateProjectSettings({ width: Number(event.target.value) || project.settings.width })
                }
              />
              <span className="muted">×</span>
              <input
                className="input"
                type="number"
                min={16}
                max={4320}
                value={project.settings.height}
                onChange={(event) =>
                  updateProjectSettings({ height: Number(event.target.value) || project.settings.height })
                }
              />
            </div>
          </Field>
          <Field label={t('settings.defaultFps')}>
            <div className="row">
              {[24, 25, 30, 50, 60].map((fps) => (
                <button
                  key={fps}
                  type="button"
                  className={`chip${project.settings.fps === fps ? ' chip--accent' : ''}`}
                  onClick={() => updateProjectSettings({ fps })}
                >
                  {fps}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t('settings.snap')} hint={t('settings.gridSize')}>
            <div className="row">
              {[100, 250, 500, 1000].map((grid) => (
                <button
                  key={grid}
                  type="button"
                  className={`chip${project.settings.gridMs === grid ? ' chip--accent' : ''}`}
                  onClick={() => updateProjectSettings({ gridMs: grid })}
                >
                  {grid}ms
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>
    );
  }

  const transitionType = clip.transitionIn?.type ?? 'cut';

  return (
    <div className="inspector">
      <header className="inspector__header">
        <h2 className="truncate">{clip.name}</h2>
        <Chip tone="accent">{clip.kind}</Chip>
      </header>

      <div className="inspector__body stack">
        <div className="row row--between text-xs text-mute">
          <span className="mono">{formatDuration(clip.startMs)}</span>
          <span className="mono">{formatDuration(clip.durationMs)}</span>
        </div>

        <Card className="inspector__card">
          <span className="eyebrow">{t('editor.trim')}</span>
          <div className="row">
            <TextInput
              label="Start (ms)"
              type="number"
              value={Math.round(clip.startMs)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) {
                  useEditor.getState().trimSelected(value, value + clip.durationMs);
                }
              }}
            />
            <TextInput
              label="Duration (ms)"
              type="number"
              value={Math.round(clip.durationMs)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value > 0) {
                  useEditor.getState().trimSelected(clip.startMs, clip.startMs + value);
                }
              }}
            />
          </div>
        </Card>

        <Card className="inspector__card">
          <span className="eyebrow">{t('editor.presets')}</span>
          <div className="row">
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="chip chip--accent"
                title={preset.description}
                onClick={() => {
                  useEditor.getState().commit(`Apply ${preset.label}`, (current) => {
                    const clipInProject = current.clips.find((item) => item.id === clip.id);
                    if (!clipInProject) return current;
                    const effects: ClipEffect[] = preset.effects.map((effect) => ({
                      id: `fx_${preset.id}_${effect.type}`,
                      type: effect.type,
                      enabled: true,
                      params: effect.params,
                    }));
                    return {
                      ...current,
                      clips: current.clips.map((item) =>
                        item.id === clip.id ? { ...item, effects } : item,
                      ),
                    };
                  });
                  toast.success(`${preset.label} look applied.`);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </Card>

        <Card className="inspector__card stack">
          <span className="eyebrow">{t('editor.effects')}</span>
          {clip.effects.length === 0 ? <span className="text-xs text-mute">No effects applied.</span> : null}
          {clip.effects.map((effect) => {
            const definition = EFFECT_CATALOG.find((item) => item.type === effect.type);
            return (
              <div key={effect.id} className="effect-row">
                <div className="row row--between">
                  <span className="text-sm">{definition?.label ?? effect.type}</span>
                  <button
                    type="button"
                    className="chip"
                    onClick={() =>
                      setClipEffect(clip.id, { ...effect, enabled: !effect.enabled })
                    }
                  >
                    {effect.enabled ? 'On' : 'Off'}
                  </button>
                </div>
                {definition?.params.map((param) => {
                  if (param.type === 'number') {
                    return (
                      <Slider
                        key={param.key}
                        label={param.label}
                        min={param.min ?? 0}
                        max={param.max ?? 1}
                        step={param.step ?? 0.01}
                        value={Number(effect.params[param.key] ?? param.default)}
                        onChange={(value) =>
                          setClipEffect(clip.id, { ...effect, params: { ...effect.params, [param.key]: value } })
                        }
                      />
                    );
                  }
                  if (param.type === 'select') {
                    return (
                      <Field key={param.key} label={param.label}>
                        <select
                          className="select"
                          value={String(effect.params[param.key] ?? param.default)}
                          onChange={(event) =>
                            setClipEffect(clip.id, {
                              ...effect,
                              params: { ...effect.params, [param.key]: event.target.value },
                            })
                          }
                        >
                          {param.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                    );
                  }
                  return null;
                })}
                <button
                  type="button"
                  className="text-xs text-mute"
                  onClick={() =>
                    useEditor.getState().commit('Remove effect', (current) => ({
                      ...current,
                      clips: current.clips.map((item) =>
                        item.id === clip.id
                          ? { ...item, effects: item.effects.filter((fx) => fx.id !== effect.id) }
                          : item,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            );
          })}
          <div className="row">
            <SelectInput
              label="Add effect"
              value={newEffect}
              onChange={(event) => setNewEffect(event.target.value)}
            >
              <option value="">Select…</option>
              {EFFECT_CATALOG.map((effect) => (
                <option key={effect.type} value={effect.type}>
                  {effect.label}
                </option>
              ))}
            </SelectInput>
          </div>
          {newEffect ? (
            <Button
              size="sm"
              variant="primary"
              icon="plus"
              onClick={() => {
                const definition = EFFECT_CATALOG.find((item) => item.type === newEffect);
                if (!definition) return;
                setClipEffect(clip.id, {
                  id: `fx_${newEffect}_${Date.now().toString(36)}`,
                  type: newEffect,
                  enabled: true,
                  params: Object.fromEntries(definition.params.map((param) => [param.key, param.default])),
                });
                setNewEffect('');
              }}
            >
              Add
            </Button>
          ) : null}
        </Card>

        <Card className="inspector__card stack">
          <span className="eyebrow">{t('editor.transition')}</span>
          <SelectInput
            value={transitionType}
            onChange={(event) => {
              const type = event.target.value;
              if (type === 'cut') setClipTransition(clip.id, undefined);
              else setClipTransition(clip.id, { type, durationMs: clip.transitionIn?.durationMs ?? defaultTransitionMs });
            }}
          >
            {TRANSITION_CATALOG.map((transition) => (
              <option key={transition.type} value={transition.type}>
                {transition.label}
              </option>
            ))}
          </SelectInput>
          {clip.transitionIn ? (
            <Slider
              label="Duration (ms)"
              min={200}
              max={2000}
              step={50}
              value={clip.transitionIn.durationMs}
              onChange={(value) =>
                setClipTransition(clip.id, { ...clip.transitionIn!, durationMs: value })
              }
            />
          ) : null}
        </Card>

        {clip.kind === 'text' && clip.text ? (
          <Card className="inspector__card stack">
            <span className="eyebrow">{t('editor.text')}</span>
            <Field label="Content">
              <textarea
                className="textarea"
                value={clip.text.content}
                onChange={(event) => setClipText(clip.id, { content: event.target.value })}
              />
            </Field>
            <Field label="Font">
              <select
                className="select"
                value={clip.text.fontFamily}
                onChange={(event) => setClipText(clip.id, { fontFamily: event.target.value })}
              >
                {FONT_CATALOG.map((font) => (
                  <option key={font.id} value={font.family}>
                    {font.label}
                  </option>
                ))}
              </select>
            </Field>
            <Slider
              label="Size"
              min={16}
              max={220}
              step={2}
              value={clip.text.fontSize}
              onChange={(value) => setClipText(clip.id, { fontSize: value })}
            />
            <Field label="Colour">
              <input
                className="input"
                type="color"
                value={clip.text.color}
                onChange={(event) => setClipText(clip.id, { color: event.target.value })}
              />
            </Field>
            <div className="row">
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className={`chip${clip.text!.align === align ? ' chip--accent' : ''}`}
                  onClick={() => setClipText(clip.id, { align })}
                >
                  {align}
                </button>
              ))}
            </div>
            <Slider
              label="Position X"
              min={0}
              max={1}
              step={0.01}
              value={clip.text.x}
              onChange={(value) => setClipText(clip.id, { x: value })}
            />
            <Slider
              label="Position Y"
              min={0}
              max={1}
              step={0.01}
              value={clip.text.y}
              onChange={(value) => setClipText(clip.id, { y: value })}
            />
            <button
              type="button"
              className={`chip${clip.text.uppercase ? ' chip--accent' : ''}`}
              onClick={() => setClipText(clip.id, { uppercase: !clip.text!.uppercase })}
            >
              Uppercase
            </button>
          </Card>
        ) : null}

        <Card className="inspector__card stack">
          <span className="eyebrow">{t('editor.transform')}</span>
          <Slider
            label={t('editor.speed')}
            min={0.25}
            max={4}
            step={0.05}
            value={clip.speed}
            format={(value) => `${value.toFixed(2)}×`}
            onChange={(value) => setClipSpeed(clip.id, value)}
          />
          <Slider
            label={t('editor.opacity')}
            min={0}
            max={1}
            step={0.01}
            value={clip.opacity}
            format={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => setClipOpacity(clip.id, value)}
          />
          {clip.kind !== 'text' ? (
            <Slider
              label={t('editor.volume')}
              min={0}
              max={1.5}
              step={0.01}
              value={clip.volume}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => setClipVolume(clip.id, value)}
            />
          ) : null}
        </Card>

        <Button variant="danger" icon="trash" onClick={() => deleteClip(clip.id)}>
          {t('editor.delete')}
        </Button>
        <p className="text-xs text-mute row" style={{ gap: 6 }}>
          <Icon name="info" size={13} /> Every change here can be undone from the timeline toolbar.
        </p>
      </div>
    </div>
  );
}
