import { useEffect, useState } from 'react';
import { Button, Card, Chip, Slider, Toggle } from '../components/ui/primitives.js';
import { Icon } from '../components/ui/Icon.js';
import { useSettings, type AccentName, type ThemeName } from '../state/settingsStore.js';
import { useEditor } from '../state/editorStore.js';
import { useT } from '../lib/useT.js';
import { LANGUAGES, type LanguageCode } from '../lib/i18n.js';
import { api, type ServerStatus } from '../lib/api.js';
import { estimateUsage, formatBytes } from '../storage/db.js';
import { cleanupStorage } from '../storage/repository.js';
import { toast } from '../state/toastStore.js';

const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'noir', label: 'Noir' },
  { id: 'void', label: 'Void' },
  { id: 'ember', label: 'Ember' },
  { id: 'frost', label: 'Frost' },
];

const ACCENTS: { id: AccentName; label: string; color: string }[] = [
  { id: 'violet', label: 'Electric violet', color: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { id: 'amber', label: 'Amber', color: '#f59e0b' },
  { id: 'rose', label: 'Rose', color: '#f43f5e' },
];

export function SettingsScreen() {
  const t = useT();
  const settings = useSettings();
  const project = useEditor((state) => state.project);
  const updateProjectSettings = useEditor((state) => state.updateProjectSettings);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
    void estimateUsage().then(setUsage);
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <span className="eyebrow">Preferences</span>
        <h1>{t('settings.title')}</h1>
      </header>

      <div className="settings-grid">
        <Card className="stack">
          <span className="eyebrow">{t('settings.appearance')}</span>
          <div className="field">
            <span className="field__label">{t('settings.theme')}</span>
            <div className="row">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`chip${settings.theme === theme.id ? ' chip--accent' : ''}`}
                  onClick={() => settings.setTheme(theme.id)}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">{t('settings.accent')}</span>
            <div className="row">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  className={`chip${settings.accent === accent.id ? ' chip--accent' : ''}`}
                  onClick={() => settings.setAccent(accent.id)}
                >
                  <span className="swatch" style={{ background: accent.color }} />
                  {accent.label}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            checked={settings.reduceMotion}
            onChange={settings.setReduceMotion}
            label={t('settings.motion')}
          />
        </Card>

        <Card className="stack">
          <span className="eyebrow">{t('settings.language')}</span>
          <div className="row">
            {LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                className={`chip${settings.language === language.code ? ' chip--accent' : ''}`}
                onClick={() => settings.setLanguage(language.code as LanguageCode)}
              >
                {language.native}
                {language.dir === 'rtl' ? ' · RTL' : ''}
              </button>
            ))}
          </div>
          <p className="text-xs text-mute">
            Switching to Arabic mirrors the entire layout (right-to-left) and translates the interface.
          </p>
        </Card>

        <Card className="stack">
          <span className="eyebrow">{t('settings.projectPrefs')}</span>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <span className="field__label">{t('settings.defaultCanvas')}</span>
              <div className="row">
                <select
                  className="select"
                  value={`${settings.defaultWidth}x${settings.defaultHeight}`}
                  onChange={(event) => {
                    const [width, height] = event.target.value.split('x').map(Number);
                    settings.setProjectDefaults({ defaultWidth: width, defaultHeight: height });
                  }}
                >
                  <option value="1920x1080">1920×1080 landscape</option>
                  <option value="1080x1920">1080×1920 vertical</option>
                  <option value="1080x1080">1080×1080 square</option>
                  <option value="1280x720">1280×720</option>
                </select>
              </div>
            </div>
          </div>
          <div className="field">
            <span className="field__label">{t('settings.defaultFps')}</span>
            <div className="row">
              {[24, 25, 30, 50, 60].map((fps) => (
                <button
                  key={fps}
                  type="button"
                  className={`chip${settings.defaultFps === fps ? ' chip--accent' : ''}`}
                  onClick={() => settings.setProjectDefaults({ defaultFps: fps })}
                >
                  {fps}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="field__label">{t('settings.gridSize')}</span>
            <div className="row">
              {[100, 250, 500, 1000].map((grid) => (
                <button
                  key={grid}
                  type="button"
                  className={`chip${settings.gridMs === grid ? ' chip--accent' : ''}`}
                  onClick={() => settings.setProjectDefaults({ gridMs: grid })}
                >
                  {grid}ms
                </button>
              ))}
            </div>
          </div>
          <Slider
            label={t('settings.transitionDuration')}
            min={200}
            max={2000}
            step={50}
            value={settings.defaultTransitionMs}
            format={(value) => `${Math.round(value)} ms`}
            onChange={(value) => settings.setProjectDefaults({ defaultTransitionMs: value })}
          />
          <Toggle
            checked={project?.settings.autoSave ?? settings.autoSave}
            onChange={(value) => {
              settings.setProjectDefaults({ autoSave: value });
              if (project) updateProjectSettings({ autoSave: value });
            }}
            label={t('settings.autosave')}
          />
          <Toggle
            checked={project?.settings.snapToGrid ?? settings.snapToGrid}
            onChange={(value) => {
              settings.setProjectDefaults({ snapToGrid: value });
              if (project) updateProjectSettings({ snapToGrid: value });
            }}
            label={t('settings.snap')}
          />
        </Card>

        <Card className="stack">
          <span className="eyebrow">{t('settings.storage')}</span>
          {usage ? (
            <div className="row">
              <Chip>
                {t('settings.usage')}: {formatBytes(usage.usage)}
              </Chip>
              <Chip>
                {t('settings.quota')}: {formatBytes(Math.max(0, usage.quota - usage.usage))}
              </Chip>
            </div>
          ) : (
            <p className="text-sm text-mute">Storage usage is not reported by this browser.</p>
          )}
          <Button
            variant="outline"
            icon="trash"
            onClick={async () => {
              const removed = await cleanupStorage();
              toast.success(`${removed} unused media file${removed === 1 ? '' : 's'} removed.`);
              void estimateUsage().then(setUsage);
            }}
          >
            {t('settings.cleanup')}
          </Button>
        </Card>

        <Card className="stack">
          <span className="eyebrow">Providers</span>
          {status ? (
            <div className="stack">
              {status.providers.map((provider) => (
                <div key={provider.id} className="row row--between provider-row">
                  <span className="text-sm">{provider.label}</span>
                  <Chip tone={provider.mode === 'live' ? 'live' : provider.mode === 'demo' ? 'demo' : 'warning'}>
                    {provider.mode}
                  </Chip>
                </div>
              ))}
              <p className="text-xs text-mute">
                ffmpeg: {status.ffmpeg.available ? status.ffmpeg.version : 'not available on this machine'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-mute">The local server is not reachable.</p>
          )}
        </Card>

        <Card className="stack">
          <span className="eyebrow">{t('settings.about')}</span>
          <div className="row" style={{ gap: 10 }}>
            <span className="brand__mark">XV</span>
            <div>
              <div className="text-sm" style={{ fontWeight: 700, letterSpacing: '0.14em' }}>
                XORVYNE
              </div>
              <div className="text-xs text-mute">{t('app.tagline')}</div>
            </div>
          </div>
          <p className="text-sm text-mute">{t('settings.aboutText')}</p>
          <p className="text-xs text-mute row" style={{ gap: 6, alignItems: 'flex-start' }}>
            <Icon name="lock" size={13} /> {t('settings.securityText')}
          </p>
        </Card>
      </div>
    </div>
  );
}
