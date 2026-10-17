import type { Task } from '../types';
import { daysUntil, formatDay } from './util';

export type Quadrant = 'do-first' | 'schedule' | 'quick' | 'backlog';

export const QUADRANTS: Record<Quadrant, { label: string; hint: string; tone: string }> = {
  'do-first': { label: 'Do First', hint: 'Urgent · Important', tone: '#ef4444' },
  schedule: { label: 'Schedule', hint: 'Not urgent · Important', tone: '#d97706' },
  quick: { label: 'Quick / Delegate', hint: 'Urgent · Not important', tone: '#3b82f6' },
  backlog: { label: 'Backlog', hint: 'Not urgent · Not important', tone: '#64748b' },
};

export function quadrantOf(t: Pick<Task, 'urgent' | 'important'>): Quadrant {
  if (t.urgent && t.important) return 'do-first';
  if (!t.urgent && t.important) return 'schedule';
  if (t.urgent) return 'quick';
  return 'backlog';
}

const ORDER: Record<Quadrant, number> = { 'do-first': 0, schedule: 1, quick: 2, backlog: 3 };

export function sortTasks<T extends Pick<Task, 'done' | 'urgent' | 'important' | 'due_date' | 'created_at'>>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const q = ORDER[quadrantOf(a)] - ORDER[quadrantOf(b)];
    if (q !== 0) return q;
    if (a.due_date !== b.due_date) {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

export function dueInfo(due: string | null, done: boolean): { label: string; tone: string } | null {
  if (!due) return null;
  if (done) return { label: `Due ${formatDay(due)}`, tone: '#64748b' };
  const days = daysUntil(due);
  if (days < 0) return { label: `Overdue · ${formatDay(due)}`, tone: '#ef4444' };
  if (days === 0) return { label: 'Due today', tone: '#d97706' };
  if (days <= 2) return { label: `Due ${formatDay(due)}`, tone: '#d97706' };
  return { label: `Due ${formatDay(due)}`, tone: '#64748b' };
}