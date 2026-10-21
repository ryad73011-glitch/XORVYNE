import type { ClipEffect } from '@shared/types.js';

/**
 * Maps semantic effects onto CSS filters for the live preview.
 * The server maps the same effect definitions onto ffmpeg filters, so the
 * preview and the exported file stay visually consistent.
 */
export function effectsToCssFilter(effects: ClipEffect[]): string {
  const filters: string[] = [];
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const amount = Number(effect.params.amount ?? 0);
    switch (effect.type) {
      case 'brightness':
        filters.push(`brightness(${1 + amount})`);
        break;
      case 'contrast':
        filters.push(`contrast(${1 + amount})`);
        break;
      case 'saturation':
        filters.push(`saturate(${amount})`);
        break;
      case 'grayscale':
        filters.push(`grayscale(${amount})`);
        break;
      case 'sepia':
        filters.push(`sepia(${amount})`);
        break;
      case 'blur':
        filters.push(`blur(${amount}px)`);
        break;
      case 'sharpen':
        filters.push(`contrast(${1 + amount * 0.15}) saturate(${1 + amount * 0.2})`);
        break;
      case 'temperature':
        filters.push(`sepia(${Math.abs(amount) * 0.35}) hue-rotate(${amount < 0 ? 190 : 0}deg) saturate(${1 + Math.abs(amount) * 0.4})`);
        break;
      case 'tint':
        filters.push(`sepia(${Number(effect.params.amount ?? 0.35)}) hue-rotate(${
          effect.params.color === '#22d3ee' ? 150 : effect.params.color === '#f97316' ? 320 : 250
        }deg) saturate(1.3)`);
        break;
      case 'vignette':
        filters.push('brightness(0.92)');
        break;
      case 'grain':
        filters.push('contrast(1.04)');
        break;
      case 'glitch':
        filters.push(`saturate(${1 + amount * 0.6}) hue-rotate(${amount * 12}deg)`);
        break;
      default:
        break;
    }
  }
  return filters.length > 0 ? filters.join(' ') : 'none';
}

/** Overlay styles (letterbox, grain, light leak) for the preview. */
export function overlayStyle(kind: string, amount: number): React.CSSProperties {
  switch (kind) {
    case 'letterbox':
      return {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(to bottom, rgba(0,0,0,${amount}) 0%, rgba(0,0,0,${amount}) 12%, transparent 12%, transparent 88%, rgba(0,0,0,${amount}) 88%, rgba(0,0,0,${amount}) 100%)`,
      };
    case 'vignette':
      return {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(circle at 50% 50%, transparent 45%, rgba(0,0,0,${amount}) 100%)`,
      };
    case 'grain':
      return {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: amount * 0.35,
        backgroundImage:
          'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.12) 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, rgba(255,255,255,0.1) 0 1px, transparent 1px)',
        backgroundSize: '4px 4px',
        mixBlendMode: 'overlay',
      };
    case 'lightleak':
      return {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `radial-gradient(circle at 80% 40%, rgba(255,186,120,${amount * 0.5}) 0%, transparent 55%)`,
        mixBlendMode: 'screen',
      };
    case 'scanlines':
      return {
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(to bottom, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)',
        opacity: amount,
      };
    default:
      return { position: 'absolute', inset: 0, pointerEvents: 'none' };
  }
}
