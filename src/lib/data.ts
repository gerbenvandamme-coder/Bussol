import type { SupabaseClient } from '@supabase/supabase-js';
import type { Handle } from '../types';
import { supabase } from './supabase';

export type TableName =
  | 'profiles'
  | 'shared_settings'
  | 'tasks'
  | 'activity'
  | 'quick_links'
  | 'tweets'
  | 'tweet_likes'
  | 'events'
  | 'files'
  | 'expenses'
  | 'settlements'
  | 'financial_audit';

type Row = Record<string, unknown>;

export interface DataService {
  mode: 'local' | 'supabase';
  list<T>(table: TableName): Promise<T[]>;
  insert<T>(table: TableName, row: Record<string, unknown>): Promise<T>;
  update<T>(table: TableName, id: string, patch: Record<string, unknown>): Promise<T>;
  remove(table: TableName, id: string): Promise<void>;
  subscribe(table: TableName, onChange: () => void): () => void;
  /** Bestand opslaan onder het gegeven pad in de File Room. */
  uploadFile(path: string, file: File): Promise<void>;
  /** Tijdelijke link om een bestand te downloaden (Supabase: signed URL, lokaal: object-URL). */
  getFileUrl(path: string, downloadName: string): Promise<string>;
  removeFile(path: string): Promise<void>;
}

export interface AuthService {
  getSessionUserId(): Promise<string | null>;
  onChange(cb: (userId: string | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(
    email: string,
    password: string,
    meta: { handle: Handle; display_name: string },
  ): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  /** Alleen in lokale testmodus: wissel van perspectief. */
  switchTo?(profileId: string): Promise<void>;
}

const FILE_BUCKET = 'file-room';

export function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ============================ Lokale fallback ============================ */

const PREFIX = 'cfos:';
const SESSION_KEY = 'cfos:session'; // sessionStorage → per tabblad een ander perspectief

/** Net als in Supabase: deze tabellen worden automatisch geaudit. */
const AUDITED: ReadonlySet<TableName> = new Set<TableName>(['expenses', 'settlements']);

const listeners = new Map<TableName, Set<() => void>>();
const emit = (table: TableName) => listeners.get(table)?.forEach((fn) => fn());

function read(table: TableName): Row[] {
  try {
    const raw = localStorage.getItem(PREFIX + table);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

function write(table: TableName, rows: Row[]) {
  localStorage.setItem(PREFIX + table, JSON.stringify(rows));
  emit(table);
}

function assertWritable(table: TableName) {
  if (table === 'financial_audit') throw new Error('financial_audit is append-only');
}

function recordAudit(
  table: TableName,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  rowId: string,
  oldData: Row | null,
  newData: Row | null,
) {
  if (!AUDITED.has(table)) return;
  write('financial_audit', [
    ...read('financial_audit'),
    {
      id: newId(),
      table_name: table,
      row_id: rowId,
      action,
      actor_id: sessionStorage.getItem(SESSION_KEY),
      old_data: oldData,
      new_data: newData,
      created_at: new Date().toISOString(),
    },
  ]);
}

function seedLocal() {
  const now = new Date().toISOString();
  if (localStorage.getItem(PREFIX + 'profiles') === null) {
    write('profiles', [
      { id: 'local-gerben', handle: 'gerben', display_name: 'Gerben', bio: '', avatar_url: null, accent: '#38bdf8', created_at: now },
      { id: 'local-seb', handle: 'seb', display_name: 'Seb', bio: '', avatar_url: null, accent: '#f472b6', created_at: now },
    ]);
  }
  if (localStorage.getItem(PREFIX + 'shared_settings') === null) {
    write('shared_settings', [{ id: 'shared', accent: '#a78bfa', created_at: now }]);
  }
}

// Wijzigingen uit een ander tabblad doorgeven aan de luisteraars
window.addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length) as TableName);
});

/* ---- Lokale bestandsopslag (IndexedDB, gedeeld tussen beide tabbladen) ---- */

const IDB_NAME = 'cfos-files';
const IDB_STORE = 'blobs';

function openFileDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local file storage.'));
  });
}

async function withFileStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openFileDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode);
      const request = run(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('Local file storage failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('Local file storage was aborted.'));
    });
  } finally {
    db.close();
  }
}

const localData: DataService = {
  mode: 'local',
  async list<T>(table: TableName) {
    const rows = [...read(table)].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return rows as unknown as T[];
  },
  async insert<T>(table: TableName, row: Record<string, unknown>) {
    assertWritable(table);
    const created = { ...row, id: newId(), created_at: new Date().toISOString() };
    write(table, [...read(table), created]);
    recordAudit(table, 'INSERT', created.id, null, created);
    return created as unknown as T;
  },
  async update<T>(table: TableName, id: string, patch: Record<string, unknown>) {
    assertWritable(table);
    const rows = read(table);
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) throw new Error('Item not found.');
    const before = rows[index];
    const next = { ...before, ...patch, id };
    rows[index] = next;
    write(table, rows);
    recordAudit(table, 'UPDATE', id, before, next);
    return next as unknown as T;
  },
  async remove(table: TableName, id: string) {
    assertWritable(table);
    const rows = read(table);
    const before = rows.find((r) => r.id === id);
    if (!before) return;
    write(table, rows.filter((r) => r.id !== id));
    recordAudit(table, 'DELETE', id, before, null);
  },
  subscribe(table: TableName, onChange: () => void) {
    const set = listeners.get(table) ?? new Set<() => void>();
    listeners.set(table, set);
    set.add(onChange);
    return () => {
      set.delete(onChange);
    };
  },
  async uploadFile(path, file) {
    await withFileStore('readwrite', (store) => store.put(file, path));
  },
  async getFileUrl(path) {
    const blob = await withFileStore<Blob | undefined>('readonly', (store) => store.get(path));
    if (!blob) throw new Error('File not found in local storage.');
    return URL.createObjectURL(blob);
  },
  async removeFile(path) {
    await withFileStore('readwrite', (store) => store.delete(path));
  },
};

const authListeners = new Set<(id: string | null) => void>();

const localAuth: AuthService = {
  async getSessionUserId() {
    const id = sessionStorage.getItem(SESSION_KEY);
    return id && read('profiles').some((p) => p.id === id) ? id : null;
  },
  onChange(cb) {
    authListeners.add(cb);
    return () => {
      authListeners.delete(cb);
    };
  },
  async signIn() {
    throw new Error('Local test mode: use the dev perspective buttons instead.');
  },
  async signUp() {
    throw new Error('Local test mode: use the dev perspective buttons instead.');
  },
  async signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    authListeners.forEach((fn) => fn(null));
  },
  async switchTo(profileId) {
    sessionStorage.setItem(SESSION_KEY, profileId);
    authListeners.forEach((fn) => fn(profileId));
  },
};

/* ================================ Supabase =============================== */

let channelCounter = 0;

function makeSupabaseData(sb: SupabaseClient): DataService {
  return {
    mode: 'supabase',
    async list<T>(table: TableName) {
      const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
    async insert<T>(table: TableName, row: Record<string, unknown>) {
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) throw new Error(error.message);
      return data as T;
    },
    async update<T>(table: TableName, id: string, patch: Record<string, unknown>) {
      const { data, error } = await sb.from(table).update(patch).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return data as T;
    },
    async remove(table: TableName, id: string) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    subscribe(table: TableName, onChange: () => void) {
      channelCounter += 1;
      const channel = sb
        .channel(`rt-${table}-${channelCounter}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
        .subscribe();
      return () => {
        void sb.removeChannel(channel);
      };
    },
    async uploadFile(path, file) {
      const { error } = await sb.storage
        .from(FILE_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw new Error(error.message);
    },
    async getFileUrl(path, downloadName) {
      const { data, error } = await sb.storage.from(FILE_BUCKET).createSignedUrl(path, 60, { download: downloadName });
      if (error || !data) throw new Error(error?.message ?? 'Could not create a download link.');
      return data.signedUrl;
    },
    async removeFile(path) {
      const { error } = await sb.storage.from(FILE_BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    },
  };
}

function makeSupabaseAuth(sb: SupabaseClient): AuthService {
  return {
    async getSessionUserId() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },
    onChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session?.user.id ?? null));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
    },
    async signUp(email, password, meta) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta } });
      if (error) throw new Error(error.message);
      return { needsConfirmation: !data.session };
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}

if (!supabase) seedLocal();

export const data: DataService = supabase ? makeSupabaseData(supabase) : localData;
export const auth: AuthService = supabase ? makeSupabaseAuth(supabase) : localAuth;

/** Activiteitenfeed (best effort): een mislukte log mag nooit een actie blokkeren. */
export async function logActivity(actorId: string, type: string, summary: string, link: string | null = null) {
  try {
    await data.insert('activity', { actor_id: actorId, type, summary: summary.slice(0, 300), link });
  } catch {
    // bewust genegeerd
  }
}