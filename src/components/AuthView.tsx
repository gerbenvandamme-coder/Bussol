import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Button, Avatar, Field, SlidingTabs, ThemeToggle } from './ui';
import { useApp } from '../lib/store';
import type { Handle } from '../types';

const HANDLES: Handle[] = ['gerben', 'seb'];

export function AuthView() {
  const { mode, profiles, loadError, signIn, signUp, switchPerspective } = useApp();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState<Handle>('gerben');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (tab === 'login') {
        await signIn(email.trim(), password);
      } else {
        const result = await signUp(email.trim(), password, handle, handle === 'gerben' ? 'Gerben' : 'Seb');
        if (result.needsConfirmation) setInfo('Account created. Check your inbox to confirm your email, then log in.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex size-11 items-center justify-center rounded-2xl text-lg font-bold"
            style={{
              background: 'linear-gradient(135deg, var(--accent-gerben), var(--accent-seb))',
              color: '#0f172a',
            }}
          >
            C
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Co-Founder OS</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Gerben & Seb · private workspace</p>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            Could not load data: {loadError}. Did you run schema.sql in Supabase?
          </p>
        )}

        {mode === 'local' ? (
          <div>
            <p className="mb-1 text-sm font-medium">Dev perspective</p>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Local test mode: data is stored in this browser. Pick who you want to test as. Open a second tab as the
              other founder to see both sides.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {HANDLES.map((h) => {
                const profile = profiles.find((p) => p.handle === h);
                return (
                  <Button
                    key={h}
                    variant="ghost"
                    className="flex-col !py-4"
                    style={{ boxShadow: `inset 0 0 0 1.5px var(--accent-${h})` }}
                    onClick={() => void switchPerspective(h)}
                  >
                    <Avatar profile={profile} size={40} />
                    Continue as {h === 'gerben' ? 'Gerben' : 'Seb'}
                  </Button>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="space-y-4">
            <SlidingTabs
              id="auth"
              ariaLabel="Login or register"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'login', label: 'Log in' },
                { value: 'register', label: 'Register' },
              ]}
            />
            <Field label="Email" htmlFor="auth-email">
              <input id="auth-email" className="field" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password" htmlFor="auth-password">
              <input
                id="auth-password"
                className="field"
                type="password"
                required
                minLength={8}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {tab === 'register' && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">I am</span>
                <div>
                  <SlidingTabs
                    id="auth-handle"
                    ariaLabel="Which founder are you"
                    value={handle}
                    onChange={setHandle}
                    options={[
                      { value: 'gerben', label: 'Gerben', color: 'var(--accent-gerben)' },
                      { value: 'seb', label: 'Seb', color: 'var(--accent-seb)' },
                    ]}
                  />
                </div>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
            {info && <p role="status" className="text-sm text-emerald-600 dark:text-emerald-300">{info}</p>}
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'One moment…' : tab === 'login' ? 'Log in' : 'Create account'}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}