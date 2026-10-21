import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EFFECT_CATALOG,
  FONT_CATALOG,
  MUSIC_CATALOG,
  OVERLAY_CATALOG,
  SFX_CATALOG,
  STYLE_PRESETS,
  TEMPLATE_CATALOG,
  TRANSITION_CATALOG,
  type MusicDefinition,
  type SfxDefinition,
  type TemplateDefinition,
} from '@shared/catalog.js';
import { addAsset, addTrack, createAudioClip, createEmptyProject, createTextClip } from '@shared/project-ops.js';
import type { MediaAsset } from '@shared/types.js';
import { Button, Card, Chip, EmptyState, SearchInput } from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { useT } from '../lib/useT.js';
import { useEditor } from '../state/editorStore.js';
import { toast } from '../state/toastStore.js';
import { storeMediaBlob, saveProject } from '../storage/repository.js';
import { renderMusicBlob, renderSfxBlob } from '../lib/audio.js';
import { swatchForKind } from '../storage/db.js';
import { createId } from '@shared/project-ops.js';

type Category = 'effects' | 'transitions' | 'fonts' | 'overlays' | 'sfx' | 'music' | 'templates';

const CATEGORIES: { value: Category; labelKey: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
  { value: 'effects', labelKey: 'assets.effects', icon: 'sliders' },
  { value: 'transitions', labelKey: 'assets.transitions', icon: 'layers' },
  { value: 'fonts', labelKey: 'assets.fonts', icon: 'type' },
  { value: 'overlays', labelKey: 'assets.overlays', icon: 'sparkles' },
  { value: 'sfx', labelKey: 'assets.sfx', icon: 'audio' },
  { value: 'music', labelKey: 'assets.music', icon: 'music' },
  { value: 'templates', labelKey: 'assets.templates', icon: 'grid' },
];

export function AssetsScreen() {
  const t = useT();
  const navigate = useNavigate();
  const project = useEditor((state) => state.project);
  const selectedClipId = useEditor((state) => state.selectedClipId);
  const commit = useEditor((state) => state.commit);
  const addTextToTimeline = useEditor((state) => state.addTextToTimeline);
  const openProject = useEditor((state) => state.openProject);

  const [category, setCategory] = useState<Category>('effects');
  const [query, setQuery] = useState('');

  const needle = query.trim().toLowerCase();

  const requireProject = () => {
    if (!project) {
      toast.warning('Open a project first — assets are added to the current timeline.');
      return false;
    }
    return true;
  };

  const applyEffectToSelection = (type: string, params: Record<string, number | string | boolean>) => {
    if (!requireProject()) return;
    if (!selectedClipId) {
      toast.warning('Select a clip in the editor to apply this effect.');
      return;
    }
    commit('Apply effect', (current) => ({
      ...current,
      clips: current.clips.map((clip) =>
        clip.id === selectedClipId
          ? {
              ...clip,
              effects: [
                ...clip.effects.filter((effect) => effect.type !== type),
                { id: `fx_${type}_${Date.now().toString(36)}`, type, enabled: true, params },
              ],
            }
          : clip,
      ),
    }));
    toast.success('Effect applied to the selected clip.');
  };

  const applyTransitionToSelection = (type: string) => {
    if (!requireProject()) return;
    if (!selectedClipId) {
      toast.warning('Select a clip in the editor to change its transition.');
      return;
    }
    commit('Change transition', (current) => ({
      ...current,
      clips: current.clips.map((clip) =>
        clip.id === selectedClipId
          ? { ...clip, transitionIn: type === 'cut' ? undefined : { type, durationMs: 700 } }
          : clip,
      ),
    }));
    toast.success('Transition updated.');
  };

  const addGeneratedAudio = async (definition: SfxDefinition | MusicDefinition, kind: 'sfx' | 'music') => {
    if (!requireProject()) return;
    try {
      const blob = kind === 'sfx' ? renderSfxBlob(definition as SfxDefinition) : renderMusicBlob(definition as MusicDefinition);
      const storageKey = await storeMediaBlob(blob, `${definition.id}.wav`, 'audio/wav');
      const asset: MediaAsset = {
        id: createId('asset'),
        name: `${definition.label} (demo)`,
        kind: 'audio',
        mimeType: 'audio/wav',
        sizeBytes: blob.size,
        durationMs: kind === 'sfx' ? (definition as SfxDefinition).recipe.durationMs : 16000,
        width: 0,
        height: 0,
        hasAudio: true,
        status: 'ready',
        swatch: swatchForKind('audio'),
        source: { type: 'local', storageKey },
        createdAt: Date.now(),
      };
      commit('Add demo audio', (current) => addAsset(current, asset));
      const clipId = useEditor.getState().addAssetToTimeline(asset, 0);
      if (!clipId) throw new Error('The audio asset could not be placed on a track.');
      toast.success(`${definition.label} generated and placed on the audio track.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The audio could not be generated.');
    }
  };

  const useTemplate = (template: TemplateDefinition) => {
    const base = createEmptyProject(template.label, {
      width: template.build.width,
      height: template.build.height,
      fps: template.build.fps,
    });
    const trackIds = new Map<string, string>();
    let next = base;
    for (const track of template.build.tracks) {
      const result = addTrack(next, track.kind, track.name);
      next = result.project;
      trackIds.set(track.name, result.track.id);
    }
    for (const clip of template.build.clips) {
      const trackId = trackIds.get(clip.track);
      if (!trackId) continue;
      if (clip.kind === 'text') {
        next = {
          ...next,
          clips: [
            ...next.clips,
            createTextClip({
              trackId,
              startMs: clip.startMs,
              durationMs: clip.durationMs,
              text: { content: clip.text ?? clip.name, fontSize: 56, y: 0.5 },
              name: clip.name,
            }),
          ],
        };
      } else if (clip.kind === 'audio') {
        next = {
          ...next,
          clips: [
            ...next.clips,
            createAudioClip({
              trackId,
              startMs: clip.startMs,
              durationMs: clip.durationMs,
              name: clip.name,
            }),
          ],
        };
      } else {
        next = {
          ...next,
          clips: [
            ...next.clips,
            {
              id: createId('clip'),
              trackId,
              kind: 'video',
              name: clip.name,
              startMs: clip.startMs,
              durationMs: clip.durationMs,
              inMs: 0,
              outMs: clip.durationMs,
              speed: 1,
              opacity: 1,
              volume: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
              effects: [],
              swatch: template.swatch,
            },
          ],
        };
      }
    }
    next = { ...next, meta: { createdFrom: 'template', templateId: template.id } };
    void saveProject(next);
    openProject(next);
    navigate('/editor');
    toast.success(`${template.label} template applied.`);
  };

  const results = useMemo(() => {
    switch (category) {
      case 'effects':
        return EFFECT_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.type,
          title: item.label,
          description: item.description,
          meta: item.category,
        }));
      case 'transitions':
        return TRANSITION_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.type,
          title: item.label,
          description: item.description,
          meta: item.group,
        }));
      case 'fonts':
        return FONT_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.id,
          title: item.label,
          description: item.family,
          meta: item.category,
        }));
      case 'overlays':
        return OVERLAY_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.id,
          title: item.label,
          description: item.description,
          meta: item.category,
        }));
      case 'sfx':
        return SFX_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.id,
          title: item.label,
          description: item.description,
          meta: item.category,
        }));
      case 'music':
        return MUSIC_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.id,
          title: item.label,
          description: item.description,
          meta: item.mood,
        }));
      case 'templates':
        return TEMPLATE_CATALOG.filter((item) => item.label.toLowerCase().includes(needle)).map((item) => ({
          id: item.id,
          title: item.label,
          description: item.description,
          meta: item.category,
        }));
      default:
        return [];
    }
  }, [category, needle]);

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <span className="eyebrow">Library</span>
            <h1>{t('assets.title')}</h1>
          </div>
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder={t('assets.search')} />
        <div className="row">
          {CATEGORIES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`chip${category === item.value ? ' chip--accent' : ''}`}
              onClick={() => setCategory(item.value)}
            >
              <Icon name={item.icon} size={13} /> {t(item.labelKey)}
            </button>
          ))}
        </div>
      </header>

      {category === 'effects' ? (
        <section className="stack">
          <div className="row">
            <span className="eyebrow">Look presets</span>
            {STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="chip chip--accent"
                title={preset.description}
                onClick={() => {
                  if (!requireProject()) return;
                  if (!selectedClipId) {
                    toast.warning('Select a clip in the editor to apply a preset.');
                    return;
                  }
                  commit('Apply preset', (current) => ({
                    ...current,
                    clips: current.clips.map((clip) =>
                      clip.id === selectedClipId
                        ? {
                            ...clip,
                            effects: preset.effects.map((effect) => ({
                              id: `fx_${preset.id}_${effect.type}`,
                              type: effect.type,
                              enabled: true,
                              params: effect.params,
                            })),
                          }
                        : clip,
                    ),
                  }));
                  toast.success(`${preset.label} applied.`);
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {results.length === 0 ? (
        <EmptyState icon="search" title={t('assets.empty')} text="Try a different search term." />
      ) : (
        <div className="grid">
          {results.map((item) => (
            <Card key={item.id} className="asset-card">
              <div className="row row--between">
                <span className="card__title">{item.title}</span>
                <Chip>{item.meta}</Chip>
              </div>
              <p className="text-sm text-mute clamp-2">{item.description}</p>
              {category === 'effects' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => {
                    const definition = EFFECT_CATALOG.find((effect) => effect.type === item.id);
                    applyEffectToSelection(
                      item.id,
                      Object.fromEntries(definition?.params.map((param) => [param.key, param.default]) ?? []),
                    );
                  }}
                >
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'transitions' ? (
                <Button size="sm" variant="primary" icon="plus" onClick={() => applyTransitionToSelection(item.id)}>
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'fonts' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => {
                    if (!requireProject()) return;
                    const font = FONT_CATALOG.find((item2) => item2.id === item.id);
                    addTextToTimeline(0, 4000, {
                      content: font?.label ?? 'Title',
                      fontFamily: font?.family,
                      fontSize: 64,
                    });
                    toast.success('Text clip added with this font.');
                  }}
                >
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'overlays' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => applyEffectToSelection('overlay', { kind: item.id, amount: 0.35 })}
                >
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'sfx' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => void addGeneratedAudio(SFX_CATALOG.find((item2) => item2.id === item.id)!, 'sfx')}
                >
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'music' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => void addGeneratedAudio(MUSIC_CATALOG.find((item2) => item2.id === item.id)!, 'music')}
                >
                  {t('assets.addToTimeline')}
                </Button>
              ) : null}
              {category === 'templates' ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon="plus"
                  onClick={() => useTemplate(TEMPLATE_CATALOG.find((item2) => item2.id === item.id)!)}
                >
                  {t('assets.useTemplate')}
                </Button>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {category === 'sfx' || category === 'music' ? (
        <p className="text-xs text-mute">{t('assets.demoAudio')} — synthesised locally as real WAV files; no third-party samples are used.</p>
      ) : null}
    </div>
  );
}
