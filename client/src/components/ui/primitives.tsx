import * as React from 'react';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { Icon, type IconName } from './Icon.js';
import { useToasts } from '../../state/toastStore.js';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'outline' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  block,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    'btn',
    variant !== 'default' ? `btn--${variant}` : '',
    size === 'sm' ? 'btn--sm' : '',
    block ? 'btn--block' : '',
    !children ? 'btn--icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  size?: number;
  variant?: ButtonVariant;
  small?: boolean;
}

export function IconButton({ icon, label, size = 17, variant = 'ghost', small, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={['btn', `btn--${variant}`, small ? 'btn--sm' : 'btn--icon', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Chip({
  children,
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'warning' | 'success' | 'danger' | 'demo' | 'live';
  className?: string;
}) {
  return <span className={['chip', tone !== 'default' ? `chip--${tone}` : '', className].filter(Boolean).join(' ')}>{children}</span>;
}

export function Card({
  children,
  className = '',
  interactive,
  onClick,
  accent,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
  accent?: boolean;
}) {
  const classes = ['card', interactive ? 'card--interactive' : '', accent ? 'card--accent' : '', className]
    .filter(Boolean)
    .join(' ');
  if (onClick) {
    return (
      <div className={classes} onClick={onClick} role="button" tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return <div className={classes}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="field">
      {label ? (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : null}
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function TextInput({ label, hint, id, className = '', ...rest }: TextInputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <Field label={label} hint={hint} htmlFor={inputId}>
      <input id={inputId} className={['input', className].filter(Boolean).join(' ')} {...rest} />
    </Field>
  );
}

export interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  children: ReactNode;
}

export function SelectInput({ label, hint, id, className = '', children, ...rest }: SelectInputProps) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <Field label={label} hint={hint} htmlFor={selectId}>
      <select id={selectId} className={['select', className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
    </Field>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="text-sm text-dim">{label}</span>
    </label>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  format?: (value: number) => string;
}) {
  const ratio = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      {label ? (
        <div className="row row--between">
          <span className="field__label">{label}</span>
          <span className="text-xs mono text-mute">{format ? format(value) : value.toFixed(2)}</span>
        </div>
      ) : null}
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${ratio}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={['segmented__item', option.value === value ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          className={['tab', tab.value === value ? 'is-active' : ''].filter(Boolean).join(' ')}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <span className="search__icon">
        <Icon name="search" size={16} />
      </span>
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress__bar" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function EmptyState({
  icon = 'layers',
  title,
  text,
  action,
}: {
  icon?: IconName;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state__icon">
        <Icon name={icon} size={22} />
      </span>
      <span className="state__title">{title}</span>
      {text ? <span className="state__text">{text}</span> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) {
  return (
    <div className="state state--error">
      <span className="state__icon" style={{ color: 'var(--danger)' }}>
        <Icon name="warning" size={22} />
      </span>
      <span className="state__title">{title}</span>
      {text ? <span className="state__text">{text}</span> : null}
      {onRetry ? (
        <Button variant="outline" icon="undo" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__header">
          <h2 className="sheet__title">{title}</h2>
          <IconButton icon="close" label="Close" onClick={onClose} />
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((state) => state.toasts);
  const dismiss = useToasts((state) => state.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast--${item.kind}`} onClick={() => dismiss(item.id)}>
          <span className="toast__dot" />
          <span className="flex-1">{item.message}</span>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {text ? <p>{text}</p> : null}
    </Modal>
  );
}

/** Imperative prompt used for renaming projects / clips. */
interface PromptState {
  open: boolean;
  title: string;
  label: string;
  value: string;
  confirmLabel: string;
}

export function usePrompt(): {
  prompt: (options: { title: string; label?: string; initialValue?: string; confirmLabel?: string }) => Promise<string | null>;
  dialog: ReactNode;
} {
  const [state, setState] = React.useState<PromptState>({
    open: false,
    title: '',
    label: '',
    value: '',
    confirmLabel: 'Save',
  });
  const resolver = useRef<((value: string | null) => void) | null>(null);

  const prompt = (options: { title: string; label?: string; initialValue?: string; confirmLabel?: string }) => {
    setState({
      open: true,
      title: options.title,
      label: options.label ?? '',
      value: options.initialValue ?? '',
      confirmLabel: options.confirmLabel ?? 'Save',
    });
    return new Promise<string | null>((resolve) => {
      resolver.current = resolve;
    });
  };

  const close = (value: string | null) => {
    setState((current) => ({ ...current, open: false }));
    resolver.current?.(value);
    resolver.current = null;
  };

  const dialog = (
    <Modal
      open={state.open}
      title={state.title}
      onClose={() => close(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => close(state.value.trim() || null)}>
            {state.confirmLabel}
          </Button>
        </>
      }
    >
      <TextInput
        label={state.label}
        value={state.value}
        autoFocus
        onChange={(event) => setState((current) => ({ ...current, value: event.target.value }))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') close(state.value.trim() || null);
        }}
      />
    </Modal>
  );

  return { prompt, dialog };
}
