import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import { Moon, Sun, X, type LucideIcon } from 'lucide-react';
import { useApp } from '../lib/store';
import { cx, tint } from '../lib/util';
import type { Profile } from '../types';

type ButtonProps = HTMLMotionProps<'button'> & {
  variant?: 'primary' | 'ghost' | 'danger';
  iconOnly?: boolean;
};

export function Button({
  variant = 'ghost',
  iconOnly = false,
  className,
  style,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'apple-btn-primary'
      : variant === 'danger'
        ? 'apple-btn-danger'
        : '';

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cx(
        'apple-btn',
        variantClass,
        iconOnly && 'apple-btn-icon',
        className,
      )}
      style={style}
      {...props}
    />
  );
}

interface TabOption<T extends string> {
  value: T;
  label: ReactNode;
  color?: string;
}

export function SlidingTabs<T extends string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: TabOption<T>[];
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="apple-segmented">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(o.value)}
            className={cx('apple-segment-btn', active && 'is-active')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Overlay({
  open,
  onClose,
  title,
  variant = 'modal',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: 'modal' | 'drawer';
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div
          className="apple-sheet-backdrop"
          onClick={onClose}
          aria-hidden="true"
          style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx(
              'apple-sheet',
              variant === 'drawer' && 'apple-drawer',
              'relative z-10 overflow-y-auto p-6',
            )}
            initial={variant === 'drawer' ? { x: '100%' } : { opacity: 0, scale: 0.94, y: 16 }}
            animate={variant === 'drawer' ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={variant === 'drawer' ? { x: '100%' } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="apple-sheet-grabber" aria-hidden="true" />
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="apple-btn apple-btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Avatar({
  profile,
  size = 32,
}: {
  profile?: Pick<Profile, 'handle' | 'display_name' | 'avatar_url'>;
  size?: number;
}) {
  const ring = profile ? `var(--accent-${profile.handle})` : 'var(--accent-shared)';
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.42, boxShadow: `0 0 0 2px ${ring}`, background: tint(ring, 25) }}
    >
      {profile?.avatar_url ? (
        <img src={profile.avatar_url} alt={profile.display_name} className="h-full w-full object-cover" />
      ) : (
        (profile?.display_name.charAt(0).toUpperCase() ?? '?')
      )}
    </span>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="apple-label">
        {label}
      </label>
      {children}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="apple-card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-4 flex size-14 items-center justify-center rounded-2xl"
        style={{ background: tint('var(--accent-me)', 20), color: 'var(--accent-me)' }}
      >
        <Icon size={26} />
      </motion.div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useApp();
  const dark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      onClick={toggleTheme}
      className="apple-btn apple-btn-icon"
    >
      <motion.span
        className="flex h-7 w-7 items-center justify-center rounded-full shadow"
        style={{ background: 'var(--accent-me)', color: 'var(--accent-me-fg)' }}
        animate={{ x: dark ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {dark ? <Moon size={14} /> : <Sun size={14} />}
      </motion.span>
    </button>
  );
}
