import { useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightLeft, History, Pencil, Plus, Receipt, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Overlay, SlidingTabs } from '../components/ui';
import { logActivity } from '../lib/data';
import {
  CURRENCY,
  formatDay,
  formatMoney,
  gerbenBalance,
  gerbenShareCents,
  parseAmount,
  todayIso,
  toAmountInput,
} from '../lib/money';
import { useApp } from '../lib/store';
import { useCollection } from '../lib/useCollection';
import type { AuditEntry, Expense, Profile, Settlement } from '../types';

type Tab = 'expenses' | 'settlements' | 'audit';

interface ExpenseValues {
  description: string;
  amount_cents: number;
  currency: string;
  paid_by: string;
  gerben_share_pct: number;
  category: string;
  expense_date: string;
}

interface SettlementValues {
  from_id: string;
  to_id: string;
  amount_cents: number;
  currency: string;
  note: string;
  settled_on: string;
}

const AUDIT_LIMIT = 200;

const iconButton =
  'rounded-lg p-1.5 text-slate-400 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent-me)]';

/* ------------------------------ Formulier: uitgave ------------------------------ */

function ExpenseForm({
  initial,
  gerben,
  seb,
  meId,
  onSubmit,
  onCancel,
}: {
  initial: Expense | null;
  gerben: Profile;
  seb: Profile;
  meId: string;
  onSubmit: (values: ExpenseValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial ? toAmountInput(initial.amount_cents) : '');
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? meId);
  const [pct, setPct] = useState(initial?.gerben_share_pct ?? 50);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [date, setDate] = useState(initial?.expense_date ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cents = parseAmount(amount);
  const gerbenPart = cents === null ? null : gerbenShareCents(cents, pct);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanDescription = description.trim();
    if (!cleanDescription) {
      setError('Give it a description.');
      return;
    }
    if (cents === null) {
      setError('Enter a valid amount, for example 12,50.');
      return;
    }
    if (!date) {
      setError('Pick a date.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        description: cleanDescription,
        amount_cents: cents,
        currency: CURRENCY,
        paid_by: paidBy,
        gerben_share_pct: pct,
        category: category.trim(),
        expense_date: date,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <Field label="Description" htmlFor="exp-description">
        <input
          id="exp-description"
          className="field"
          value={description}
          maxLength={200}
          autoFocus
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount (${CURRENCY})`} htmlFor="exp-amount">
          <input
            id="exp-amount"
            className="field"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="exp-date">
          <input id="exp-date" className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Paid by</p>
        <SlidingTabs
          id="exp-paid-by"
          ariaLabel="Paid by"
          value={paidBy}
          onChange={setPaidBy}
          options={[
            { value: gerben.id, label: gerben.display_name, color: 'var(--accent-gerben)' },
            { value: seb.id, label: seb.display_name, color: 'var(--accent-seb)' },
          ]}
        />
      </div>

      <Field label={`${gerben.display_name}'s share: ${pct}% · ${seb.display_name}: ${100 - pct}%`} htmlFor="exp-split">
        <input
          id="exp-split"
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          className="w-full"
        />
      </Field>
      {cents !== null && gerbenPart !== null && (
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {gerben.display_name} {formatMoney(gerbenPart)} · {seb.display_name} {formatMoney(cents - gerbenPart)}
        </p>
      )}

      <Field label="Category (optional)" htmlFor="exp-category">
        <input
          id="exp-category"
          className="field"
          value={category}
          maxLength={60}
          onChange={(e) => setCategory(e.target.value)}
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

/* ----------------------------- Formulier: verrekening ----------------------------- */

function SettlementForm({
  gerben,
  seb,
  defaultPayerId,
  defaultAmount,
  onSubmit,
  onCancel,
}: {
  gerben: Profile;
  seb: Profile;
  defaultPayerId: string;
  defaultAmount: string;
  onSubmit: (values: SettlementValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [payerId, setPayerId] = useState(defaultPayerId);
  const [amount, setAmount] = useState(defaultAmount);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cents = parseAmount(amount);
    if (cents === null) {
      setError('Enter a valid amount, for example 12,50.');
      return;
    }
    if (!date) {
      setError('Pick a date.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        from_id: payerId,
        to_id: payerId === gerben.id ? seb.id : gerben.id,
        amount_cents: cents,
        currency: CURRENCY,
        note: note.trim(),
        settled_on: date,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Who paid whom?</p>
        <SlidingTabs
          id="settle-direction"
          ariaLabel="Direction of payment"
          value={payerId}
          onChange={setPayerId}
          options={[
            { value: gerben.id, label: `${gerben.display_name} → ${seb.display_name}`, color: 'var(--accent-gerben)' },
            { value: seb.id, label: `${seb.display_name} → ${gerben.display_name}`, color: 'var(--accent-seb)' },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount (${CURRENCY})`} htmlFor="settle-amount">
          <input
            id="settle-amount"
            className="field"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            autoFocus
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Date" htmlFor="settle-date">
          <input id="settle-date" className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Note (optional)" htmlFor="settle-note">
        <input
          id="settle-note"
          className="field"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Record payment'}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------- Audittrail ---------------------------------- */

function changedFields(entry: AuditEntry): string[] {
  const before = entry.old_data;
  const after = entry.new_data;
  if (entry.action !== 'UPDATE' || !before || !after) return [];
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function describeAudit(entry: AuditEntry, actorName: string): string {
  const snapshot = entry.new_data ?? entry.old_data ?? {};
  const kind = entry.table_name === 'expenses' ? 'expense' : 'payment';
  const label =
    entry.table_name === 'expenses' && typeof snapshot.description === 'string' ? ` "${snapshot.description}"` : '';
  const amount = typeof snapshot.amount_cents === 'number' ? ` (${formatMoney(snapshot.amount_cents)})` : '';
  const verb = entry.action === 'INSERT' ? 'added' : entry.action === 'UPDATE' ? 'changed' : 'deleted';
  return `${actorName} ${verb} ${kind}${label}${amount}`;
}

/* ---------------------------------- Pagina --------------------------------- */

export function ExpensesPage() {
  const { me, profiles, profileById } = useApp();
  const expenses = useCollection<Expense>('expenses', me?.id ?? null);
  const settlements = useCollection<Settlement>('settlements', me?.id ?? null);
  const audit = useCollection<AuditEntry>('financial_audit', me?.id ?? null);
  const [tab, setTab] = useState<Tab>('expenses');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const gerben = profiles.find((p) => p.handle === 'gerben');
  const seb = profiles.find((p) => p.handle === 'seb');

  const balance = useMemo(
    () => (gerben ? gerbenBalance(expenses.rows, settlements.rows, gerben.id) : 0),
    [expenses.rows, settlements.rows, gerben],
  );

  const sortedExpenses = useMemo(
    () =>
      [...expenses.rows].sort(
        (a, b) => b.expense_date.localeCompare(a.expense_date) || b.created_at.localeCompare(a.created_at),
      ),
    [expenses.rows],
  );

  const sortedSettlements = useMemo(
    () =>
      [...settlements.rows].sort(
        (a, b) => b.settled_on.localeCompare(a.settled_on) || b.created_at.localeCompare(a.created_at),
      ),
    [settlements.rows],
  );

  if (!me) return null;

  if (!gerben || !seb) {
    return (
      <EmptyState
        icon={Receipt}
        title="Both co-founders need an account"
        description="Expenses are split between Gerben and Seb, so both profiles must exist first."
      />
    );
  }

  const other = me.handle === 'gerben' ? seb : gerben;
  const myBalance = me.handle === 'gerben' ? balance : -balance;
  const loadError = expenses.error ?? settlements.error ?? audit.error;

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  const openExpenseForm = (expense: Expense | null) => {
    setEditing(expense);
    setExpenseOpen(true);
  };

  const saveExpense = async (values: ExpenseValues) => {
    if (editing) {
      await expenses.update(editing.id, { ...values });
    } else {
      await expenses.insert({ ...values, created_by: me.id });
      await logActivity(
        me.id,
        'expense',
        `${me.display_name} added expense "${values.description.slice(0, 150)}" (${formatMoney(values.amount_cents)})`,
      );
    }
    setExpenseOpen(false);
  };

  const saveSettlement = async (values: SettlementValues) => {
    await settlements.insert({ ...values, created_by: me.id });
    await logActivity(
      me.id,
      'settlement',
      `${me.display_name} recorded a payment of ${formatMoney(values.amount_cents)}`,
    );
    setSettleOpen(false);
  };

  const deleteExpense = (expense: Expense) => {
    if (window.confirm(`Delete "${expense.description}"? The deletion stays visible in the audit trail.`)) {
      void run(() => expenses.remove(expense.id));
    }
  };

  const deleteSettlement = (settlement: Settlement) => {
    if (window.confirm('Delete this payment? The deletion stays visible in the audit trail.')) {
      void run(() => settlements.remove(settlement.id));
    }
  };

  const balanceText =
    myBalance > 0
      ? `${other.display_name} owes you`
      : myBalance < 0
        ? `You owe ${other.display_name}`
        : 'All square';
  const balanceTone =
    myBalance > 0
      ? 'text-emerald-600 dark:text-emerald-300'
      : myBalance < 0
        ? 'text-red-600 dark:text-red-300'
        : 'text-slate-500 dark:text-slate-400';

  // Wie moet betalen? Wie een negatief saldo heeft (ik schuld iets) betaalt zelf
  const suggestedPayerId = myBalance < 0 ? me.id : other.id;
  const suggestedAmount = myBalance === 0 ? '' : toAmountInput(Math.abs(myBalance));

  const loading = expenses.loading || settlements.loading;

  return (
    <div className="space-y-5">
      <section aria-label="Balance" className="glass flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Balance</p>
          <p className={`text-2xl font-semibold ${balanceTone}`} aria-live="polite">
            {balanceText}
            {myBalance !== 0 && <span> {formatMoney(Math.abs(myBalance))}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setSettleOpen(true)}>
            <ArrowRightLeft size={16} /> Record payment
          </Button>
          <Button variant="primary" onClick={() => openExpenseForm(null)}>
            <Plus size={16} /> New expense
          </Button>
        </div>
      </section>

      <SlidingTabs
        id="exp-tab"
        ariaLabel="Section"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'expenses', label: 'Expenses' },
          { value: 'settlements', label: 'Payments' },
          { value: 'audit', label: 'Audit trail' },
        ]}
      />

      {(loadError || actionError) && (
        <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
          {actionError ?? loadError}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400" role="status">Loading…</p>
      ) : tab === 'expenses' ? (
        sortedExpenses.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No expenses yet"
            description="Add a shared cost, choose who paid and how it is split. The balance updates automatically."
            action={
              <Button variant="primary" onClick={() => openExpenseForm(null)}>
                <Plus size={16} /> Add the first expense
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {sortedExpenses.map((e) => {
                const payer = profileById(e.paid_by);
                const gerbenPart = gerbenShareCents(e.amount_cents, e.gerben_share_pct);
                return (
                  <motion.li
                    key={e.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="glass flex items-start gap-3 rounded-2xl p-3"
                  >
                    <span
                      className="mt-1 h-10 w-1 shrink-0 rounded-full"
                      style={{ background: payer ? `var(--accent-${payer.handle})` : 'var(--accent-shared)' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{e.description}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Paid by {payer?.display_name ?? 'unknown'} · {formatDay(e.expense_date)}
                        {e.category ? ` · ${e.category}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {gerben.display_name} {formatMoney(gerbenPart)} · {seb.display_name}{' '}
                        {formatMoney(e.amount_cents - gerbenPart)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatMoney(e.amount_cents)}</p>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Edit "${e.description}"`}
                        onClick={() => openExpenseForm(e)}
                        className={`${iconButton} hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete "${e.description}"`}
                        onClick={() => deleteExpense(e)}
                        className={`${iconButton} hover:bg-red-500/10 hover:text-red-500`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )
      ) : tab === 'settlements' ? (
        sortedSettlements.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title="No payments yet"
            description="When one of you pays the other back, record it here so the balance goes down."
          />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {sortedSettlements.map((s) => (
                <motion.li
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="glass flex items-start gap-3 rounded-2xl p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {profileById(s.from_id)?.display_name ?? 'Unknown'} paid{' '}
                      {profileById(s.to_id)?.display_name ?? 'unknown'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDay(s.settled_on)}
                      {s.note ? ` · ${s.note}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{formatMoney(s.amount_cents)}</p>
                  <button
                    type="button"
                    aria-label="Delete payment"
                    onClick={() => deleteSettlement(s)}
                    className={`${iconButton} hover:bg-red-500/10 hover:text-red-500`}
                  >
                    <Trash2 size={15} />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )
      ) : audit.rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing recorded yet"
          description="Every added, changed or deleted expense and payment is logged here and cannot be altered."
        />
      ) : (
        <ul className="space-y-2">
          {audit.rows.slice(0, AUDIT_LIMIT).map((a) => {
            const actor = a.actor_id ? (profileById(a.actor_id)?.display_name ?? 'Someone') : 'System';
            const fields = changedFields(a);
            return (
              <li key={a.id} className="glass rounded-2xl p-3">
                <p className="break-words text-sm">{describeAudit(a, actor)}</p>
                {fields.length > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Changed: {fields.join(', ')}</p>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">{new Date(a.created_at).toLocaleString()}</p>
              </li>
            );
          })}
        </ul>
      )}

      <Overlay
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title={editing ? 'Edit expense' : 'New expense'}
      >
        <ExpenseForm
          key={editing?.id ?? 'new'}
          initial={editing}
          gerben={gerben}
          seb={seb}
          meId={me.id}
          onSubmit={saveExpense}
          onCancel={() => setExpenseOpen(false)}
        />
      </Overlay>

      <Overlay open={settleOpen} onClose={() => setSettleOpen(false)} title="Record payment">
        <SettlementForm
          key={`${suggestedPayerId}-${suggestedAmount}`}
          gerben={gerben}
          seb={seb}
          defaultPayerId={suggestedPayerId}
          defaultAmount={suggestedAmount}
          onSubmit={saveSettlement}
          onCancel={() => setSettleOpen(false)}
        />
      </Overlay>
    </div>
  );
}