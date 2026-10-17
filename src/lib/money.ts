import type { Expense, Settlement } from '../types';

export const CURRENCY = 'EUR';

// De kolom amount_cents is een 32-bit integer in Postgres
const MAX_CENTS = 2_000_000_000;

const formatter = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: CURRENCY });

/** "12,50" of "12.50" → 1250. Geeft null bij ongeldige of niet-positieve invoer. */
export function parseAmount(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  const cents = Math.round(Number(normalised) * 100);
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

export function toAmountInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatMoney(cents: number): string {
  return formatter.format(cents / 100);
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → leesbare lokale datum. */
export function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Het deel van Gerben in centen. Het deel van de ander is amount - dit bedrag, zodat er nooit een cent verloren gaat. */
export function gerbenShareCents(amountCents: number, gerbenPct: number): number {
  return Math.round((amountCents * gerbenPct) / 100);
}

/**
 * Saldo vanuit Gerbens oogpunt, in centen.
 * Positief = Seb moet Gerben geld geven, negatief = Gerben moet Seb geld geven.
 */
export function gerbenBalance(expenses: Expense[], settlements: Settlement[], gerbenId: string): number {
  let net = 0;
  for (const e of expenses) {
    if (e.paid_by === gerbenId) net += e.amount_cents;
    net -= gerbenShareCents(e.amount_cents, e.gerben_share_pct);
  }
  for (const s of settlements) {
    if (s.from_id === gerbenId) net += s.amount_cents;
    else if (s.to_id === gerbenId) net -= s.amount_cents;
  }
  return net;
}
