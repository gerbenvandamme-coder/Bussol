import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Activity as ActivityIcon, AlertTriangle, CalendarClock, Flame, ListChecks } from 'lucide-react';
import { Avatar, Button, EmptyState } from '../components/ui';
import { QUADRANTS, dueInfo, quadrantOf, sortTasks } from '../lib/priority';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import { daysUntil, tint } from '../lib/util';
import type { Page, Task } from '../types';

interface ActivityItem {
  id: string;
  actor_id: string;
  type: string;
  summary: string;
  link: string | null;
  created_at: string;
}

const FOCUS_LIMIT = 5;
const ACTIVITY_LIMIT = 8;
const DUE_SOON_DAYS = 2;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Flame;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass flex items-center gap-3 rounded-2xl p-4"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: tint(tone, 18), color: tone }}
      >
        <Icon size={20} />
      </span>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </motion.div>
  );
}

export function HomePage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { me, profileById } = useApp();
  const tasks = useCollection<Task>('tasks', me?.id ?? null);
  const activity = useCollection<ActivityItem>('activity', me?.id ?? null);
  const myHandle = me?.handle;

  const open = useMemo(
    () =>
      myHandle
        ? tasks.rows.filter((t) => !t.done && (t.scope === 'shared' || t.scope === myHandle))
        : [],
    [tasks.rows, myHandle],
  );

  const stats = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    let doFirst = 0;
    for (const t of open) {
      if (quadrantOf(t) === 'do-first') doFirst += 1;
      if (t.due_date) {
        const days = daysUntil(t.due_date);
        if (days < 0) overdue += 1;
        else if (days <= DUE_SOON_DAYS) soon += 1;
      }
    }
    return { overdue, soon, doFirst };
  }, [open]);

  const focus = useMemo(() => sortTasks(open).slice(0, FOCUS_LIMIT), [open]);
  const feed = activity.rows.slice(0, ACTIVITY_LIMIT);

  if (!me) return null;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold">
          {greeting()}, {me.display_name}.
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {open.length === 0
            ? 'You have no open items. Enjoy the calm, or add something new.'
            : `You have ${open.length} open ${open.length === 1 ? 'item' : 'items'}.`}
        </p>
      </section>

      <section aria-label="Overview" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={ListChecks} label="Open items" value={open.length} tone="#3b82f6" />
        <Stat icon={Flame} label="Do first" value={stats.doFirst} tone={QUADRANTS['do-first'].tone} />
        <Stat icon={AlertTriangle} label="Overdue" value={stats.overdue} tone="#ef4444" />
        <Stat icon={CalendarClock} label="Due within 2 days" value={stats.soon} tone="#d97706" />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-label="Focus" className="space-y-3 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Focus now
            </h2>
            <Button onClick={() => onNavigate('reminders')}>Open all</Button>
          </div>

          {tasks.loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
          ) : focus.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nothing to focus on"
              description="Add a to-do or reminder and the most important ones show up here."
              action={<Button variant="primary" onClick={() => onNavigate('reminders')}>Go to Reminders</Button>}
            />
          ) : (
            <ul className="space-y-2">
              {focus.map((t) => {
                const q = QUADRANTS[quadrantOf(t)];
                const due = dueInfo(t.due_date, t.done);
                return (
                  <li key={t.id} className="glass flex items-center gap-3 rounded-2xl p-3">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: q.tone }}
                      title={q.label}
                      aria-label={q.label}
                      role="img"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                    {due && (
                      <span className="shrink-0 text-xs font-medium" style={{ color: due.tone }}>
                        {due.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Activity" className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recent activity
          </h2>
          {feed.length === 0 ? (
            <div className="glass rounded-2xl p-6 text-center">
              <ActivityIcon size={20} className="mx-auto mb-2 text-slate-400" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Shared actions from you and your co-founder appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {feed.map((a) => (
                <li key={a.id} className="glass flex items-start gap-3 rounded-2xl p-3">
                  <Avatar profile={profileById(a.actor_id)} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm">{a.summary}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{timeAgo(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}