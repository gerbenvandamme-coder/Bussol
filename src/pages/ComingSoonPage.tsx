import { FolderOpen, Wallet, type LucideIcon } from 'lucide-react';
import { EmptyState } from '../components/ui';
import type { Page } from '../types';

type SoonPage = Exclude<Page, 'home' | 'reminders' | 'tweets' | 'agenda'>;

const COPY: Record<SoonPage, { icon: LucideIcon; title: string; description: string }> = {
  files: {
    icon: FolderOpen,
    title: 'File Room is coming next',
    description: 'One place for documents, designs and assets, with folders and fast search.',
  },
  expenses: {
    icon: Wallet,
    title: 'Expenses is coming next',
    description: 'Track shared costs, see who owes whom, and keep an unalterable audit trail.',
  },
};

export function ComingSoonPage({ page }: { page: SoonPage }) {
  const { icon, title, description } = COPY[page];
  return <EmptyState icon={icon} title={title} description={description} />;
}