import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../ui/Icon.js';
import { Button, IconButton } from '../ui/primitives.js';
import { useT } from '../../lib/useT.js';
import { useEditor } from '../../state/editorStore.js';
import { useAppStore } from '../../state/appStore.js';
import { useSettings } from '../../state/settingsStore.js';
import { api, type ServerStatus } from '../../lib/api.js';

interface NavEntry {
  to: string;
  icon: IconName;
  labelKey: string;
}

const PRIMARY_NAV: NavEntry[] = [
  { to: '/', icon: 'home', labelKey: 'nav.home' },
  { to: '/projects', icon: 'folder', labelKey: 'nav.projects' },
  { to: '/editor', icon: 'film', labelKey: 'nav.editor' },
  { to: '/assistant', icon: 'sparkles', labelKey: 'nav.assistant' },
  { to: '/assets', icon: 'grid', labelKey: 'nav.assets' },
  { to: '/export', icon: 'download', labelKey: 'nav.export' },
  { to: '/settings', icon: 'settings', labelKey: 'nav.settings' },
];

const MOBILE_TABS: NavEntry[] = [
  { to: '/', icon: 'home', labelKey: 'nav.home' },
  { to: '/projects', icon: 'folder', labelKey: 'nav.projects' },
  { to: '/editor', icon: 'film', labelKey: 'nav.editor' },
  { to: '/assistant', icon: 'sparkles', labelKey: 'nav.assistant' },
];

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark">XV</span>
      <span className="flex-1" style={{ minWidth: 0 }}>
        <span className="brand__name">XORVYNE</span>
        <span className="brand__tag" style={{ display: 'block' }}>
          CREATE BEYOND LIMITS
        </span>
      </span>
    </div>
  );
}

export function AppShell() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const project = useEditor((state) => state.project);
  const dirty = useEditor((state) => state.dirty);
  const save = useEditor((state) => state.save);
  const autoSave = project?.settings.autoSave ?? true;
  const projects = useAppStore((state) => state.projects);
  const setTheme = useSettings((state) => state.setTheme);
  const theme = useSettings((state) => state.theme);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    api
      .status()
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentTitle =
    PRIMARY_NAV.find((entry) => (entry.to === '/' ? location.pathname === '/' : location.pathname.startsWith(entry.to)))?.labelKey ??
    'nav.home';

  const nav = (
    <nav className="nav">
      {PRIMARY_NAV.map((entry) => (
        <NavLink
          key={entry.to}
          to={entry.to}
          end={entry.to === '/'}
          className={({ isActive }) => `nav__item${isActive ? ' is-active' : ''}`}
        >
          <span className="nav__icon">
            <Icon name={entry.icon} size={18} />
          </span>
          <span className="nav__label">{t(entry.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        {nav}
        <div className="sidebar__footer">
          <div className="row" style={{ gap: 8 }}>
            <span
              className="swatch"
              style={{ background: status?.ffmpeg.available ? 'var(--success)' : 'var(--warning)' }}
            />
            <span>
              {status?.ffmpeg.available ? 'Real MP4 export ready' : status ? 'Encoder unavailable' : 'Checking local server'}
            </span>
          </div>
          <div>
            {projects.length} project{projects.length === 1 ? '' : 's'} · v{status?.version ?? '0.1.0'}
          </div>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="topbar">
          <div className="topbar__brand">
            <IconButton
              icon="menu"
              label={t('nav.menu')}
              className="mobile-only"
              onClick={() => setDrawerOpen(true)}
            />
            <span className="topbar__title truncate">{t(currentTitle)}</span>
            {project ? <span className="chip truncate" style={{ maxWidth: 160 }}>{project.name}</span> : null}
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__actions">
            <span className="topbar__status">
              {project ? (
                dirty && autoSave ? (
                  <>
                    <Icon name="clock" size={14} /> {t('common.saving')}
                  </>
                ) : dirty ? (
                  <>
                    <Icon name="warning" size={14} /> {t('editor.autosaveOff')}
                  </>
                ) : (
                  <>
                    <Icon name="check" size={14} /> {t('editor.savedLocally')}
                  </>
                )
              ) : null}
            </span>
            {project && dirty && !autoSave ? (
              <IconButton icon="check" label={t('common.save')} onClick={() => void save()} />
            ) : null}
            <IconButton
              icon="settings"
              label={t('nav.settings')}
              className="desktop-only"
              onClick={() => navigate('/settings')}
            />
          </div>
        </header>

        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar">
        {MOBILE_TABS.map((entry) => (
          <NavLink
            key={entry.to}
            to={entry.to}
            end={entry.to === '/'}
            className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}
          >
            <Icon name={entry.icon} size={20} />
            <span>{t(entry.labelKey)}</span>
          </NavLink>
        ))}
        <button type="button" className="tabbar__item" onClick={() => setDrawerOpen(true)}>
          <Icon name="menu" size={20} />
          <span>More</span>
        </button>
      </nav>

      {drawerOpen ? (
        <>
          <div className="drawer__backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer" role="dialog" aria-modal="true">
            <div className="row row--between">
              <Brand />
              <IconButton icon="close" label={t('common.close')} onClick={() => setDrawerOpen(false)} />
            </div>
            {nav}
            <div className="stack" style={{ marginTop: 'auto' }}>
              <span className="eyebrow">{t('settings.appearance')}</span>
              <div className="row">
                {(['noir', 'ember', 'frost', 'void'] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`chip${theme === name ? ' chip--accent' : ''}`}
                    onClick={() => setTheme(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <Button variant="ghost" icon="external" onClick={() => setDrawerOpen(false)}>
                {t('common.close')}
              </Button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
