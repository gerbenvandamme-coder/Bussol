import { useCallback, useEffect, useState } from 'react';
import { data, type TableName } from './data';

/**
 * Reactieve verzameling uit de dataservice. Ververst automatisch bij wijzigingen
 * (realtime in Supabase, storage-events lokaal). scopeKey = bv. de ingelogde user-id,
 * zodat de data opnieuw wordt geladen na het inloggen.
 */
export function useCollection<T extends { id: string }>(table: TableName, scopeKey: string | null = null) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await data.list<T>(table));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    setLoading(true);
    void refresh();
    return data.subscribe(table, () => {
      void refresh();
    });
  }, [table, refresh, scopeKey]);

  const insert = useCallback(
    async (row: Record<string, unknown>) => {
      const created = await data.insert<T>(table, row);
      await refresh();
      return created;
    },
    [table, refresh],
  );

  const update = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const updated = await data.update<T>(table, id, patch);
      await refresh();
      return updated;
    },
    [table, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await data.remove(table, id);
      await refresh();
    },
    [table, refresh],
  );

  return { rows, loading, error, refresh, insert, update, remove };
}
