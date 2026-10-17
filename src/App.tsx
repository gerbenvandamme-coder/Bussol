import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AppProvider, useApp } from './lib/store';
import { AuthView } from './components/AuthView';
import { NAV, Sidebar } from './components/Sidebar';
import { ProfileDrawer } from './components/ProfileDrawer';
import { Avatar, Button, SlidingTabs, ThemeToggle } from './components/ui';
import { HomePage } from './pages/HomePage';
import { RemindersPage } from './pages/RemindersPage';
import { TweetsPage } from './pages/TweetsPage';
import { AgendaPage } from './pages/AgendaPage';
import { FilesPage } from './pages/FilesPage';
import { ExpensesPage } from './pages/ExpensesPage';
import type { Page } from './types';

function PageView({ page, onNavigate }: { page: Page; onNavigate: (page: Page) => void }) {
  switch (page) {
    case 'home':
      return <HomePage onNavigate={onNavigate} />;
    case 'reminders':
      return <RemindersPage />;
    case 'tweets':
      return <TweetsPage />;
    case 'agenda':
      return <AgendaPage />;
    case 'files':
      return <FilesPage />;
    case 'expenses':
      return <ExpensesPage />;
  }
}

function Shell() {
  const { ready, mode, userId, me, loadError, switchPerspective, signOut } = useApp();
  const [page, setPage] = useState<Page>('home');
  const [profileOpen, setProfileOpen] = useState(false);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
        <motion.div
          className="size-10 rounded-full border-4 border-slate-400/30"
          style={{ borderTopColor: 'var(--accent-shared)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  if (!userId) return <AuthView />;

  // Ingelogd, maar er is geen profiel gevonden (bv. schema.sql nog niet uitgevoerd)
  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="glass-strong w-full max-w-md space-y-4 rounded-3xl p-8">
          <h1 className="text-lg font-semibold">Profile not found</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            You are signed in, but no profile exists for this account.
            {loadError ? ` (${loadError})` : ''} Did you run schema.sql in Supabase before registering?
          </p>
          <Button variant="danger" onClick={() => void signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }

  const current = NAV.find((n) => n.page === page);

  return (
    <div className="min-h-screen">
      <Sidebar page={page} onNavigate={setPage} onOpenProfile={() => setProfileOpen(true)} />

      <main className="min-h-screen pb-10 pl-24 pr-4 pt-4 lg:pl-72">
        <div className="mx-auto max-w-5xl">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{current?.label ?? 'Co-Founder OS'}</h1>
            <div className="flex flex-wrap items-center gap-3">
              {mode === 'local' && (
                <SlidingTabs
                  id="dev-perspective"
                  ariaLabel="Dev perspective"
                  value={me.handle}
                  onChange={(h) => void switchPerspective(h)}
                  options={[
                    { value: 'gerben', label: 'Gerben', color: 'var(--accent-gerben)' },
                    { value: 'seb', label: 'Seb', color: 'var(--accent-seb)' },
                  ]}
                />
              )}
              <ThemeToggle />
              <button
                type="button"
                aria-label="Open profile"
                onClick={() => setProfileOpen(true)}
                className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-me)]"
              >
                <Avatar profile={me} size={36} />
              </button>
            </div>
          </header>

          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              <PageView page={page} onNavigate={setPage} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}