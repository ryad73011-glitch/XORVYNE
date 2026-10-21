import type { SVGProps } from 'react';

export type IconName =
  | 'home'
  | 'folder'
  | 'film'
  | 'sparkles'
  | 'grid'
  | 'download'
  | 'settings'
  | 'play'
  | 'pause'
  | 'plus'
  | 'trash'
  | 'pencil'
  | 'undo'
  | 'redo'
  | 'split'
  | 'search'
  | 'menu'
  | 'close'
  | 'check'
  | 'upload'
  | 'image'
  | 'video'
  | 'audio'
  | 'music'
  | 'text'
  | 'chevron'
  | 'zoomIn'
  | 'zoomOut'
  | 'mute'
  | 'lock'
  | 'eye'
  | 'warning'
  | 'info'
  | 'arrowRight'
  | 'wand'
  | 'scissors'
  | 'copy'
  | 'eyeOff'
  | 'unlock'
  | 'layers'
  | 'clock'
  | 'send'
  | 'external'
  | 'sliders'
  | 'type'
  | 'star';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z',
  film: 'M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5',
  sparkles: 'M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 3.5l.6 1.6L7.2 5.7 5.6 6.3 5 7.9 4.4 6.3 2.8 5.7l1.6-.6z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  play: 'M8 5.5v13l11-6.5z',
  pause: 'M9 5v14M15 5v14',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v5M14 11v5',
  pencil: 'M4 20h4L20 8l-4-4L4 16zM14.5 5.5l4 4',
  undo: 'M9 8H5V4M5 8a8 8 0 1 1 0 8',
  redo: 'M15 8h4V4M19 8a8 8 0 1 0 0 8',
  split: 'M12 3v18M7 8 3 12l4 4M17 8l4 4-4 4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 13l4.5 4.5L19 7',
  upload: 'M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 20h16',
  image: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 16l4.5-4.5 4 4L16 12l4 4M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  video: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h9A1.5 1.5 0 0 1 16 6.5v11A1.5 1.5 0 0 1 14.5 19h-9A1.5 1.5 0 0 1 4 17.5zM16 10l4-2.5v9L16 14',
  audio: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  chevron: 'M9 5l7 7-7 7',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  unlock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 5.5-1.7',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M4 4l16 16M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2M6.3 6.6C3.9 8.2 2.5 12 2.5 12S6 18.5 12 18.5c1.5 0 2.8-.4 4-1M10 5.6c.6-.1 1.3-.1 2-.1 6 0 9.5 6.5 9.5 6.5s-.8 1.5-2.3 3',
  warning: 'M12 3.5 21 19H3zM12 10v4M12 16.5v.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.5v.01',
  arrowRight: 'M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5',
  wand: 'M15 4l5 5L9 20H4v-5zM14 5l5 5M6 3v3M4.5 4.5h3M18 15v3M16.5 16.5h3',
  scissors: 'M7 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8.6 11.5 20 4M8.6 12.5 20 20',
  copy: 'M9 9h9v11H9zM6 15H4V4h11v2',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  send: 'M4 12 20 4l-4 16-4.5-6.5z',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  star: 'M12 4l2.4 5 5.6.7-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.7z',
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  const path = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path.split(' M').map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} />
      ))}
    </svg>
  );
}
