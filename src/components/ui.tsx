import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion, type HTMLMotionProps } from 'framer-motion';
import { Moon, Sun, X, type LucideIcon } from 'lucide-react';
import { useApp } from '../lib/store';
import { cx, tint } from '../lib/util';
import type { Profile } from '../types';

/* ------------------------------- Button -------------------------------- */

type ButtonProps = HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost' | 'danger' };

export function Button({ variant = 'ghost', className, style, ...props }: ButtonProps) {
  const look =
    variant === 'primary' ? { background: 'var(--accent-me)', color: 'var(--accent-me-fg)', ...style } : style;
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-me)] disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'shadow-md',
        variant === 'ghost' && 'border border-black/10 bg-white/50 hover:bg-white/80 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10',
        variant === 'danger' && 'border border-red-500/30 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300',
        className,
      )}
      style={look}
      {...props}
    />
  );
}

/* ---------------------------- Sliding tabs ----------------------------- */

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
    <div role="tablist" aria-label={ariaLabel} className="glass relative inline-flex rounded-full p-1">
      {options.map((o) => {
        const active = o.value === value;
        const color = o.color ?? 'var(--accent-me)';
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative z-10 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]',
              active ? 'text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {active && (
              <motion.span
                layoutId={`pill-${id}`}
                className="absolute inset-0 -z-10 rounded-full"
                style={{ background: tint(color, 30), boxShadow: `inset 0 0 0 1px ${tint(color, 60)}` }}
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------- Modal / drawer overlay ---------------------- */

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

  const drawer = variant === 'drawer';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className={cx('fixed inset-0 z-50 flex', drawer ? 'justify-end' : 'items-center justify-center p-4')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cx(
              'glass-strong relative z-10 overflow-y-auto p-6',
              drawer ? 'h-full w-full max-w-md rounded-l-3xl' : 'max-h-[90vh] w-full max-w-lg rounded-3xl',
            )}
            initial={drawer ? { x: '100%' } : { opacity: 0, scale: 0.94, y: 16 }}
            animate={drawer ? { x: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={drawer ? { x: '100%' } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------- Overig -------------------------------- */

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
      <label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
    <div className="glass flex flex-col items-center rounded-3xl px-6 py-14 text-center">
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
      className="glass relative h-9 w-[4.25rem] rounded-full p-1"
    >
      <motion.span
        className="flex h-7 w-7 items-center justify-center rounded-full shadow"
        style={{ background: 'var(--accent-me)', color: 'var(--accent-me-fg)' }}
        animate={{ x: dark ? 32 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        {dark ? <Moon size={14} /> : <Sun size={14} />}
      </motion.span>
    </button>
  );
}