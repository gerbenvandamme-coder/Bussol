import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Download, FileText, Folder, FolderOpen, FolderPlus, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { Button, EmptyState, Field, Overlay } from '../components/ui';
import { data, logActivity, newId } from '../lib/data';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import type { FileItem } from '../types';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const iconButton =
  'rounded-lg p-1.5 text-slate-400 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]';

interface SubFolder {
  name: string;
  count: number;
}

/* ------------------------------ Hulpfuncties ------------------------------ */

function normaliseFolder(raw: string): string {
  return raw
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
    .slice(0, 200);
}

/** Opslagsleutels in Supabase Storage accepteren niet elk teken. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const byName = (a: FileItem, b: FileItem) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/* --------------------------------- Formulier -------------------------------- */

function FileForm({
  file,
  folders,
  onSubmit,
  onCancel,
}: {
  file: FileItem;
  folders: string[];
  onSubmit: (name: string, folder: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(file.name);
  const [folder, setFolder] = useState(file.folder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Give it a name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cleanName, normaliseFolder(folder));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Field label="Name" htmlFor="file-name">
        <input
          id="file-name"
          className="field"
          value={name}
          maxLength={255}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Folder (use / for subfolders, empty = main folder)" htmlFor="file-folder">
        <input
          id="file-folder"
          className="field"
          list="file-folder-options"
          value={folder}
          maxLength={200}
          onChange={(e) => setFolder(e.target.value)}
        />
        <datalist id="file-folder-options">
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </Field>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------- Pagina --------------------------------- */

export function FilesPage() {
  const { me, profileById } = useApp();
  const { rows, loading, error: loadError, insert, update, remove } = useCollection<FileItem>('files', me?.id ?? null);
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editing, setEditing] = useState<FileItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const searching = query.trim() !== '';

  const allFolders = useMemo(
    () => [...new Set(rows.map((f) => f.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  const { subfolders, items } = useMemo((): { subfolders: SubFolder[]; items: FileItem[] } => {
    const q = query.trim().toLowerCase();
    if (q) {
      return {
        subfolders: [],
        items: rows
          .filter((f) => f.name.toLowerCase().includes(q) || f.folder.toLowerCase().includes(q))
          .sort(byName),
      };
    }
    const prefix = folder ? `${folder}/` : '';
    const counts = new Map<string, number>();
    const here: FileItem[] = [];
    for (const f of rows) {
      if (f.folder === folder) {
        here.push(f);
      } else if (f.folder.startsWith(prefix)) {
        const next = f.folder.slice(prefix.length).split('/')[0];
        counts.set(next, (counts.get(next) ?? 0) + 1);
      }
    }
    return {
      subfolders: [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      items: here.sort(byName),
    };
  }, [rows, folder, query]);

  if (!me) return null;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const joinPath = (name: string) => (folder ? `${folder}/${name}` : name);
  const segments = folder ? folder.split('/') : [];

  const uploadFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (files.length === 0) return;
    setNotice(null);
    setActionError(null);
    setUploading(true);

    const targetFolder = folder;
    const failures: string[] = [];
    let uploaded = 0;

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        failures.push(`${file.name}: larger than ${formatBytes(MAX_FILE_BYTES)}`);
        continue;
      }
      const path = `${me.id}/${newId()}-${safeName(file.name)}`;
      try {
        await data.uploadFile(path, file);
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
        continue;
      }
      try {
        await insert({
          name: file.name.slice(0, 255),
          folder: targetFolder,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          created_by: me.id,
        });
        uploaded += 1;
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : 'could not save'}`);
        // Geen wees-bestand achterlaten in de opslag
        await data.removeFile(path).catch(() => undefined);
      }
    }

    setUploading(false);
    if (uploaded > 0) {
      setNotice(`Uploaded ${uploaded} file${uploaded === 1 ? '' : 's'}.`);
      await logActivity(
        me.id,
        'file',
        uploaded === 1
          ? `${me.display_name} uploaded "${files[0].name.slice(0, 150)}"`
          : `${me.display_name} uploaded ${uploaded} files`,
      );
    }
    if (failures.length > 0) setActionError(failures.join(' · '));
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    void uploadFiles(picked);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
  };

  const download = (file: FileItem) =>
    void run(async () => {
      const url = await data.getFileUrl(file.storage_path, file.name);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (data.mode === 'local') window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const askDelete = (file: FileItem) => {
    if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return;
    void run(async () => {
      await remove(file.id);
      // Mislukt het opruimen van de opslag, dan is het bestand al onzichtbaar; dat is acceptabel
      await data.removeFile(file.storage_path).catch(() => undefined);
    });
  };

  const saveEdit = async (name: string, newFolderPath: string) => {
    if (!editing) return;
    await update(editing.id, { name: name.slice(0, 255), folder: newFolderPath });
    setEditing(null);
  };

  const submitNewFolder = (e: FormEvent) => {
    e.preventDefault();
    const clean = normaliseFolder(newFolder);
    if (!clean) return;
    setFolder(joinPath(clean));
    setNewFolder('');
    setCreatingFolder(false);
    setNotice('Folder opened. It is saved as soon as you upload a file into it.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            className="field pl-9"
            placeholder="Search files…"
            aria-label="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload files"
            onChange={onPick}
          />
          <Button onClick={() => setCreatingFolder((v) => !v)}>
            <FolderPlus size={16} /> New folder
          </Button>
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload size={16} /> {uploading ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </div>

      {creatingFolder && (
        <form onSubmit={submitNewFolder} className="glass flex flex-wrap items-end gap-2 rounded-2xl p-3">
          <div className="min-w-[12rem] flex-1">
            <Field label="Folder name" htmlFor="new-folder">
              <input
                id="new-folder"
                className="field"
                value={newFolder}
                maxLength={100}
                autoFocus
                onChange={(e) => setNewFolder(e.target.value)}
              />
            </Field>
          </div>
          <Button type="submit" variant="primary">Create</Button>
          <Button onClick={() => setCreatingFolder(false)}>Cancel</Button>
        </form>
      )}

      {!searching && (
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => setFolder('')}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)] dark:hover:bg-white/10"
            aria-current={folder === '' ? 'page' : undefined}
          >
            <FolderOpen size={14} /> All files
          </button>
          {segments.map((segment, index) => {
            const path = segments.slice(0, index + 1).join('/');
            return (
              <span key={path} className="inline-flex items-center gap-1">
                <ChevronRight size={14} className="text-slate-400" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => setFolder(path)}
                  className="rounded-lg px-2 py-1 font-medium hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[var(--accent-me)] dark:hover:bg-white/10"
                  aria-current={path === folder ? 'page' : undefined}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {(loadError || actionError) && (
        <p role="alert" className="break-words rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {actionError ?? loadError}
        </p>
      )}

      <section
        aria-label="Files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`space-y-4 rounded-3xl border-2 border-dashed p-2 transition-colors ${
          dragging ? 'border-[var(--accent-me)] bg-black/5 dark:bg-white/5' : 'border-transparent'
        }`}
      >
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
        ) : subfolders.length === 0 && items.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={searching ? 'No files match your search' : 'This folder is empty'}
            description={
              searching
                ? 'Try another word, or clear the search box.'
                : 'Upload files with the button, or drag them onto this area. The maximum size is 25 MB per file.'
            }
            action={
              searching ? undefined : (
                <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
                  <Upload size={16} /> Upload files
                </Button>
              )
            }
          />
        ) : (
          <>
            {subfolders.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {subfolders.map((s) => (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => setFolder(joinPath(s.name))}
                      className="glass flex w-full items-center gap-3 rounded-2xl p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]"
                    >
                      <Folder size={20} className="shrink-0 text-[var(--accent-shared)]" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                        {s.count} file{s.count === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {items.length > 0 && (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((f) => (
                    <motion.li
                      key={f.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="glass flex items-center gap-3 rounded-2xl p-3"
                    >
                      <FileText size={20} className="shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{f.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatBytes(f.size_bytes)} · {profileById(f.created_by)?.display_name ?? 'Unknown'} ·{' '}
                          {new Date(f.created_at).toLocaleDateString()}
                          {searching && f.folder ? ` · ${f.folder}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          aria-label={`Download "${f.name}"`}
                          onClick={() => download(f)}
                          className={`${iconButton} hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200`}
                        >
                          <Download size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Rename or move "${f.name}"`}
                          onClick={() => setEditing(f)}
                          className={`${iconButton} hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete "${f.name}"`}
                          onClick={() => askDelete(f)}
                          className={`${iconButton} hover:bg-red-500/10 hover:text-red-500`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </>
        )}
      </section>

      <Overlay open={editing !== null} onClose={() => setEditing(null)} title="Rename or move">
        {editing && (
          <FileForm
            key={editing.id}
            file={editing}
            folders={allFolders}
            onSubmit={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Overlay>
    </div>
  );
}