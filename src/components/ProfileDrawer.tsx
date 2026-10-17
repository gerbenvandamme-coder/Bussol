import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera } from 'lucide-react';
import { Avatar, Button, Field, Overlay } from './ui';
import { useApp } from '../lib/store';
import { fileToAvatar } from '../lib/util';

const PRESETS = ['#38bdf8', '#f472b6', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f97316'];

function ColorField({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: string;
  onChange?: (color: string) => void;
  note?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {onChange ? (
          <>
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={value.toLowerCase() === c}
                onClick={() => onChange(c)}
                className="size-7 rounded-full transition-transform hover:scale-110"
                style={{ background: c, outline: value.toLowerCase() === c ? '2px solid currentColor' : 'none', outlineOffset: 2 }}
              />
            ))}
            <input
              type="color"
              value={value}
              aria-label={`${label} custom colour`}
              onChange={(e) => onChange(e.target.value)}
              className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </>
        ) : (
          <>
            <span className="size-7 rounded-full" style={{ background: value }} />
            <span className="text-xs text-slate-500 dark:text-slate-400">{note}</span>
          </>
        )}
      </div>
    </fieldset>
  );
}

function ProfileForm({ onDone }: { onDone: () => void }) {
  const { me, profiles, sharedAccent, saveProfile, saveSharedAccent, signOut } = useApp();
  const [name, setName] = useState(me?.display_name ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(me?.avatar_url ?? null);
  const [accent, setAccent] = useState(me?.accent ?? '#38bdf8');
  const [shared, setShared] = useState(sharedAccent);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;
  const partner = profiles.find((p) => p.id !== me.id);

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await fileToAvatar(file));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ display_name: name.trim() || me.display_name, bio: bio.trim(), avatar_url: avatar, accent });
      if (shared !== sharedAccent) await saveSharedAccent(shared);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar profile={{ handle: me.handle, display_name: name || me.display_name, avatar_url: avatar }} size={64} />
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white/50 px-3 py-2 text-sm font-medium transition-colors hover:bg-white/80 focus-within:outline-2 focus-within:outline-[var(--accent-me)] dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10">
          <Camera size={16} />
          Change picture
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickFile(e)} />
        </label>
      </div>

      <Field label="Name" htmlFor="pf-name">
        <input id="pf-name" className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Bio" htmlFor="pf-bio">
        <textarea id="pf-bio" className="field" rows={3} maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>

      <ColorField label="Your accent colour" value={accent} onChange={setAccent} />
      {partner && (
        <ColorField label={`${partner.display_name}'s colour`} value={partner.accent} note={`Only ${partner.display_name} can change this.`} />
      )}
      <ColorField label="Shared (Samen) colour" value={shared} onChange={setShared} />

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="danger" onClick={() => void signOut()}>Sign out</Button>
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </div>
    </form>
  );
}

export function ProfileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} title="Profile" variant="drawer">
      <ProfileForm onDone={onClose} />
    </Overlay>
  );
}