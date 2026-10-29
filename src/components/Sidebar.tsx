import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays, ChevronDown, FolderOpen, LayoutDashboard, Link2, ListChecks, LogOut,
  MessageSquare, Plus, Trash2, Wallet, type LucideIcon,
} from 'lucide-react';
import { Avatar } from './ui';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import { cx, normalizeUrl, tint } from '../lib/util';
import type { Page, QuickLink } from '../types';

export const NAV: { page: Page; label: string; icon: LucideIcon }[] = [
  { page: 'home', label: 'Home', icon: LayoutDashboard },
  { page: 'reminders', label: 'Reminders & To-Dos', icon: ListChecks },
  { page: 'tweets', label: 'Tweet Feed', icon: MessageSquare },
  { page: 'agenda', label: 'Agenda & Planning', icon: CalendarDays },
  { page: 'files', label: 'File Room', icon: FolderOpen },
  { page: 'expenses', label: 'Expenses', icon: Wallet },
];

function QuickLinks() {
  const { me } = useApp();
  const { rows, insert, remove } = useCollection<QuickLink>('quick_links', me?.id ?? null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const clean = normalizeUrl(url);
    if (!clean) return;
    if (!me) return;
    try {
      await insert({ title: title.trim() || new URL(clean).hostname, url: clean, created_by: me.id });
      setTitle('');
      setUrl('');
      setAdding(false);
    } catch {
      // no-op
    }
  };

  return (
    <div className="mt-4 hidden border-t border-black/5 pt-3 dark:border-white/10 lg:block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
      >
        Quick links
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
          <ChevronDown size={14} />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            className="overflow-hidden"
          >
            <ul className="mt-1 space-y-0.5">
              {rows.length === 0 && !adding && (
                <li className="px-2 py-1.5 text-xs text-slate-400">No links yet. Save GitHub, Figma, staging…</li>
              )}
              {rows.map((l) => (
                <li key={l.id} className="group flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-black/5 dark:hover:bg-white/5">
                  <Link2 size={13} className="shrink-0 text-slate-400" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm">
                    {l.title}
                  </a>
                  <button
                    type="button"
                    aria-label={`Remove ${l.title}`}
                    onClick={() => void remove(l.id)}
                    className="text-slate-400 opacity-0 hover:text-red-500 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({
  page,
  onNavigate,
  onOpenProfile,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  onOpenProfile: () => void;
}) {
  const { me, signOut } = useApp();

  return (
    <aside
      aria-label="Main navigation"
      className="apple-sidebar fixed inset-x-3 bottom-3 z-30 md:inset-y-3 md:left-3 md:w-16 lg:w-64 lg:p-3"
    >
      <div className="mb-3 flex items-center justify-center gap-3 px-1.5 py-1.5 lg:justify-start">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-xl text-base font-bold"
          style={{
            background: 'linear-gradient(135deg, var(--accent-gerben), var(--accent-seb))',
            color: '#0f172a',
          }}
        >
          C
        </div>
        <span className="hidden text-sm font-semibold lg:block">Co-Founder OS</span>
      </div>

      <nav className="apple-bottom-tabbar flex w-full flex-row items-center justify-between gap-2 md:flex-col md:items-stretch md:justify-start">
        {NAV.map(({ page: target, label, icon: Icon }) => {
          const active = target === page;
          return (
            <button
              key={target}
              type="button"
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              title={label}
              onClick={() => onNavigate(target)}
              className={cx(
                'apple-nav-item',
                active && 'is-active',
                !active && 'hover:bg-white/5',
              )}
            >
              <Icon size={18} className="relative shrink-0" />
              <span className="relative hidden truncate lg:inline">{label}</span>
            </button>
          );
        })}
      </nav>

      <QuickLinks />

      <div className="mt-auto space-y-1 border-t border-black/5 pt-3 dark:border-white/10">
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open profile"
          title="Profile"
          className="apple-btn w-full justify-start"
        >
          <Avatar profile={me ?? undefined} size={34} />
          <span className="hidden min-w-0 text-left lg:block">
            <span className="block truncate text-sm font-medium">{me?.display_name ?? 'Profile'}</span>
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">Edit profile & colours</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Sign out"
          title="Sign out"
          className="apple-btn w-full justify-start"
        >
          <LogOut size={17} className="shrink-0" />
          <span className="hidden lg:inline">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
