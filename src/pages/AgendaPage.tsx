import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button, EmptyState, Field, Overlay, SlidingTabs } from '../components/ui';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import { cx } from '../lib/util';
import type { Handle, Scope } from '../types';

interface CalEvent {
  id: string;
  title: string;
  description: string;
  scope: Scope;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  ics_uid: string | null;
  created_by: string;
  created_at: string;
}

interface EventValues {
  title: string;
  description: string;
  scope: Scope;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

interface ParsedIcsEvent {
  uid: string | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

type View = 'upcoming' | 'past';
type ScopeFilter = 'all' | 'mine' | 'shared';

const MAX_ICS_BYTES = 1_000_000;
const MAX_ICS_EVENTS = 500;
const DAY_MS = 86_400_000;

/* ------------------------------ Datumhulpjes ------------------------------ */

const pad = (n: number) => String(n).padStart(2, '0');

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateTime(d: Date): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function timeLabel(e: CalEvent): string {
  if (e.all_day) return 'All day';
  const fmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const start = new Date(e.starts_at).toLocaleTimeString(undefined, fmt);
  if (!e.ends_at) return start;
  return `${start} – ${new Date(e.ends_at).toLocaleTimeString(undefined, fmt)}`;
}

function isUpcoming(e: CalEvent, now: Date): boolean {
  const start = new Date(e.starts_at);
  if (e.all_day) {
    const end = e.ends_at ? new Date(e.ends_at) : start;
    return new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime() > now.getTime();
  }
  return (e.ends_at ? new Date(e.ends_at) : start).getTime() >= now.getTime();
}

/* ------------------------------- .ics import ------------------------------ */

function parseIcsDate(raw: string): { date: Date; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(raw.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const allDay = m[4] === undefined;
  let date: Date;
  if (allDay) {
    date = new Date(year, month, day);
  } else {
    const [h, min, s] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
    date = m[7] ? new Date(Date.UTC(year, month, day, h, min, s)) : new Date(year, month, day, h, min, s);
  }
  return Number.isNaN(date.getTime()) ? null : { date, allDay };
}

function unescapeIcs(value: string): string {
  return value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

/** Eenvoudige parser voor VEVENT-blokken. Tijdzone-parameters (TZID) worden als lokale tijd gelezen. */
function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const result: ParsedIcsEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const start = current.DTSTART ? parseIcsDate(current.DTSTART) : null;
        if (start) {
          const endParsed = current.DTEND ? parseIcsDate(current.DTEND) : null;
          // Bij hele dagen is DTEND exclusief in .ics
          let end = endParsed ? new Date(endParsed.date.getTime() - (start.allDay ? DAY_MS : 0)) : null;
          if (end && end.getTime() < start.date.getTime()) end = null;
          result.push({
            uid: current.UID ? current.UID.slice(0, 255) : null,
            title: (unescapeIcs(current.SUMMARY ?? '').trim() || 'Untitled').slice(0, 200),
            description: unescapeIcs(current.DESCRIPTION ?? '').slice(0, 4000),
            starts_at: start.date.toISOString(),
            ends_at: end ? end.toISOString() : null,
            all_day: start.allDay,
          });
        }
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    if (!(name in current)) current[name] = line.slice(colon + 1);
  }
  return result;
}

/* --------------------------------- Formulier -------------------------------- */

function EventForm({
  initial,
  myHandle,
  onSubmit,
  onCancel,
}: {
  initial: CalEvent | null;
  myHandle: Handle;
  onSubmit: (values: EventValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [scope, setScope] = useState<Scope>(initial?.scope ?? 'shared');
  const [allDay, setAllDay] = useState(initial?.all_day ?? false);
  const [start, setStart] = useState(() => {
    if (!initial) return localDateTime(new Date());
    const d = new Date(initial.starts_at);
    return initial.all_day ? localDate(d) : localDateTime(d);
  });
  const [end, setEnd] = useState(() => {
    if (!initial?.ends_at) return '';
    const d = new Date(initial.ends_at);
    return initial.all_day ? localDate(d) : localDateTime(d);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleAllDay = (value: boolean) => {
    setAllDay(value);
    setStart((s) => (value ? s.slice(0, 10) : s ? `${s.slice(0, 10)}T09:00` : ''));
    setEnd((s) => (value ? s.slice(0, 10) : s ? `${s.slice(0, 10)}T10:00` : ''));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Give it a title.');
      return;
    }
    const parse = (v: string) => new Date(allDay ? `${v}T00:00` : v);
    const startDate = start ? parse(start) : null;
    const endDate = end ? parse(end) : null;
    if (!startDate || Number.isNaN(startDate.getTime())) {
      setError('Pick a valid start.');
      return;
    }
    if (endDate && (Number.isNaN(endDate.getTime()) || endDate.getTime() < startDate.getTime())) {
      setError('The end cannot be before the start.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: cleanTitle,
        description: description.trim(),
        scope,
        starts_at: startDate.toISOString(),
        ends_at: endDate ? endDate.toISOString() : null,
        all_day: allDay,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const inputType = allDay ? 'date' : 'datetime-local';

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <SlidingTabs
        id="event-scope"
        ariaLabel="Visibility"
        value={scope}
        onChange={setScope}
        options={[
          { value: myHandle, label: 'Personal', color: `var(--accent-${myHandle})` },
          { value: 'shared', label: 'Shared', color: 'var(--accent-shared)' },
        ]}
      />

      <Field label="Title" htmlFor="event-title">
        <input
          id="event-title"
          className="field"
          value={title}
          maxLength={200}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
        All day
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Start" htmlFor="event-start">
          <input
            id="event-start"
            className="field"
            type={inputType}
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="End (optional)" htmlFor="event-end">
          <input
            id="event-end"
            className="field"
            type={inputType}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="event-description">
        <textarea
          id="event-description"
          className="field"
          rows={3}
          maxLength={4000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------- Pagina --------------------------------- */

export function AgendaPage() {
  const { me, scopeLabel } = useApp();
  const { rows, loading, error: loadError, insert, update, remove } = useCollection<CalEvent>('events', me?.id ?? null);
  const [view, setView] = useState<View>('upcoming');
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const myHandle = me?.handle;

  const groups = useMemo(() => {
    if (!myHandle) return [];
    const now = new Date();
    const visible = rows
      .filter((e) => e.scope === 'shared' || e.scope === myHandle)
      .filter((e) => filter === 'all' || (filter === 'mine' ? e.scope === myHandle : e.scope === 'shared'))
      .filter((e) => isUpcoming(e, now) === (view === 'upcoming'));

    const direction = view === 'upcoming' ? 1 : -1;
    visible.sort((a, b) => direction * (new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()));

    const map = new Map<string, { key: string; label: string; items: CalEvent[] }>();
    for (const e of visible) {
      const key = localDate(new Date(e.starts_at));
      const group = map.get(key) ?? { key, label: dayLabel(e.starts_at), items: [] };
      group.items.push(e);
      map.set(key, group);
    }
    return [...map.values()];
  }, [rows, myHandle, filter, view]);

  if (!me) return null;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const openForm = (event: CalEvent | null) => {
    setEditing(event);
    setFormOpen(true);
  };

  const save = async (values: EventValues) => {
    if (editing) {
      await update(editing.id, { ...values });
    } else {
      await insert({ ...values, ics_uid: null, created_by: me.id });
    }
    setFormOpen(false);
  };

  const askDelete = (event: CalEvent) => {
    if (window.confirm(`Delete "${event.title}"?`)) void run(() => remove(event.id));
  };

  const importIcs = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    setActionError(null);
    if (file.size > MAX_ICS_BYTES) {
      setActionError('That file is too large (max 1 MB).');
      return;
    }
    setImporting(true);
    try {
      const parsed = parseIcs(await file.text()).slice(0, MAX_ICS_EVENTS);
      if (parsed.length === 0) {
        setActionError('No events found in that .ics file.');
        return;
      }
      const known = new Set(rows.filter((r) => r.created_by === me.id && r.ics_uid).map((r) => r.ics_uid));
      let added = 0;
      let skipped = 0;
      for (const p of parsed) {
        if (p.uid && known.has(p.uid)) {
          skipped += 1;
          continue;
        }
        await insert({
          title: p.title,
          description: p.description,
          scope: me.handle,
          starts_at: p.starts_at,
          ends_at: p.ends_at,
          all_day: p.all_day,
          ics_uid: p.uid,
          created_by: me.id,
        });
        if (p.uid) known.add(p.uid);
        added += 1;
      }
      setNotice(`Imported ${added} event${added === 1 ? '' : 's'} as personal${skipped ? `, skipped ${skipped} already imported` : ''}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SlidingTabs
            id="agenda-view"
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
            ]}
          />
          <SlidingTabs
            id="agenda-filter"
            ariaLabel="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'mine', label: 'Mine', color: 'var(--accent-me)' },
              { value: 'shared', label: 'Shared', color: 'var(--accent-shared)' },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".ics,text/calendar"
            className="sr-only"
            tabIndex={-1}
            aria-label="Import .ics file"
            onChange={(e) => void importIcs(e)}
          />
          <Button onClick={() => fileInput.current?.click()} disabled={importing}>
            <Upload size={16} /> {importing ? 'Importing…' : 'Import .ics'}
          </Button>
          <Button variant="primary" onClick={() => openForm(null)}>
            <Plus size={16} /> New
          </Button>
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {(loadError || actionError) && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {actionError ?? loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={view === 'upcoming' ? 'Nothing planned' : 'No past events'}
          description="Add a meeting, deadline or milestone, or import an .ics file from your calendar app."
          action={
            <Button variant="primary" onClick={() => openForm(null)}>
              <Plus size={16} /> Add an event
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {g.label}
              </h2>
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {g.items.map((e) => (
                    <motion.li
                      key={e.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className={cx('glass flex items-start gap-3 rounded-2xl p-3', view === 'past' && 'opacity-70')}
                    >
                      <span
                        className="mt-1 h-10 w-1 shrink-0 rounded-full"
                        style={{ background: `var(--accent-${e.scope})` }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{e.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {timeLabel(e)} · {scopeLabel(e.scope)}
                        </p>
                        {e.description && (
                          <p className="mt-1 line-clamp-2 whitespace-pre-line break-words text-xs text-slate-500 dark:text-slate-400">
                            {e.description}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Edit "${e.title}"`}
                          onClick={() => openForm(e)}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-black/5 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)] dark:hover:bg-white/10 dark:hover:text-slate-200"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete "${e.title}"`}
                          onClick={() => askDelete(e)}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
        </div>
      )}

      <Overlay open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Edit event' : 'New event'}>
        <EventForm
          key={editing?.id ?? 'new'}
          initial={editing}
          myHandle={me.handle}
          onSubmit={save}
          onCancel={() => setFormOpen(false)}
        />
      </Overlay>
    </div>
  );
}