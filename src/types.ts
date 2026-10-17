export type Handle = 'gerben' | 'seb';
export type Scope = Handle | 'shared';
export type Theme = 'light' | 'dark';
export type Page = 'home' | 'reminders' | 'tweets' | 'agenda' | 'files' | 'expenses';
export type TaskKind = 'reminder' | 'todo';

export interface Profile {
  id: string;
  handle: Handle;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  accent: string;
  created_at: string;
}

export interface SharedSettings {
  id: string;
  accent: string;
}

export interface Task {
  id: string;
  kind: TaskKind;
  scope: Scope;
  title: string;
  notes: string;
  urgent: boolean;
  important: boolean;
  due_date: string | null; // YYYY-MM-DD
  done: boolean;
  created_by: string;
  created_at: string;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
  created_by: string;
  created_at: string;
}

export interface Expense {
  id: string;
  description: string;
  amount_cents: number;
  currency: string;
  paid_by: string;
  gerben_share_pct: number; // 0-100, het deel dat Gerben draagt
  category: string;
  expense_date: string; // YYYY-MM-DD
  created_by: string;
  created_at: string;
}

export interface Settlement {
  id: string;
  from_id: string;
  to_id: string;
  amount_cents: number;
  currency: string;
  note: string;
  settled_on: string; // YYYY-MM-DD
  created_by: string;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

export interface FileItem {
  id: string;
  name: string;
  folder: string; // '' = hoofdmap, anders bv. 'Design/Logos'
  storage_path: string;
  mime_type: string | null;
  size_bytes: number;
  created_by: string;
  created_at: string;
}