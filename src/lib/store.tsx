import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, data } from './data';
import { useCollection } from './useCollection';
import { readableOn } from './util';
import type { Handle, Profile, Scope, SharedSettings, Theme } from '../types';

const THEME_KEY = 'cfos:theme';
const DEFAULT_SHARED = '#a78bfa';

type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'bio' | 'avatar_url' | 'accent'>>;

interface AppContextValue {
  mode: 'local' | 'supabase';
  ready: boolean;
  loadError: string | null;
  userId: string | null;
  me: Profile | null;
  profiles: Profile[];
  sharedAccent: string;
  theme: Theme;
  toggleTheme: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, handle: Handle, displayName: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  switchPerspective: (handle: Handle) => Promise<void>;
  saveProfile: (patch: ProfilePatch) => Promise<void>;
  saveSharedAccent: (color: string) => Promise<void>;
  profileById: (id: string) => Profile | undefined;
  scopeLabel: (scope: Scope) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const profilesC = useCollection<Profile>('profiles', userId);
  const sharedC = useCollection<SharedSettings>('shared_settings', userId);
  const { update: updateProfile } = profilesC;
  const { update: updateShared } = sharedC;

  useEffect(() => {
    let alive = true;
    void auth.getSessionUserId().then((id) => {
      if (alive) {
        setUserId(id);
        setAuthReady(true);
      }
    });
    const off = auth.onChange((id) => {
      if (alive) setUserId(id);
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const profiles = profilesC.rows;
  const me = useMemo(() => profiles.find((p) => p.id === userId) ?? null, [profiles, userId]);
  const sharedAccent = sharedC.rows[0]?.accent ?? DEFAULT_SHARED;

  // Accentkleuren synchroniseren als CSS-variabelen
  useEffect(() => {
    const root = document.documentElement.style;
    for (const p of profiles) root.setProperty(`--accent-${p.handle}`, p.accent);
    root.setProperty('--accent-shared', sharedAccent);
    if (me) {
      root.setProperty('--accent-me', me.accent);
      root.setProperty('--accent-me-fg', readableOn(me.accent));
    } else {
      root.removeProperty('--accent-me');
      root.setProperty('--accent-me-fg', readableOn(sharedAccent));
    }
  }, [profiles, sharedAccent, me]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  const signIn = useCallback((email: string, password: string) => auth.signIn(email, password), []);
  const signUp = useCallback(
    (email: string, password: string, handle: Handle, displayName: string) =>
      auth.signUp(email, password, { handle, display_name: displayName }),
    [],
  );
  const signOut = useCallback(() => auth.signOut(), []);

  const switchPerspective = useCallback(
    async (handle: Handle) => {
      const target = profiles.find((p) => p.handle === handle);
      if (target && auth.switchTo) await auth.switchTo(target.id);
    },
    [profiles],
  );

  const saveProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (userId) await updateProfile(userId, patch);
    },
    [userId, updateProfile],
  );

  const saveSharedAccent = useCallback(
    async (color: string) => {
      await updateShared('shared', { accent: color });
    },
    [updateShared],
  );

  const profileById = useCallback((id: string) => profiles.find((p) => p.id === id), [profiles]);

  const scopeLabel = useCallback(
    (scope: Scope) => {
      if (scope === 'shared') return 'Shared';
      return profiles.find((p) => p.handle === scope)?.display_name ?? (scope === 'gerben' ? 'Gerben' : 'Seb');
    },
    [profiles],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      mode: data.mode,
      ready: authReady && !profilesC.loading,
      loadError: profilesC.error,
      userId,
      me,
      profiles,
      sharedAccent,
      theme,
      toggleTheme,
      signIn,
      signUp,
      signOut,
      switchPerspective,
      saveProfile,
      saveSharedAccent,
      profileById,
      scopeLabel,
    }),
    [
      authReady, profilesC.loading, profilesC.error, userId, me, profiles, sharedAccent, theme,
      toggleTheme, signIn, signUp, signOut, switchPerspective, saveProfile, saveSharedAccent, profileById, scopeLabel,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}