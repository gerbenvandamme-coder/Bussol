-- =====================================================================
-- Co-Founder OS · Supabase schema
-- Voer één keer uit in een nieuw project (SQL Editor).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Profielen (1 rij per account, automatisch aangemaakt bij registratie)
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       text not null unique check (handle in ('gerben', 'seb')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  bio          text not null default '' check (char_length(bio) <= 280),
  avatar_url   text,
  accent       text not null default '#38bdf8' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  created_at   timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  h text := new.raw_user_meta_data ->> 'handle';
begin
  if h is null or h not in ('gerben', 'seb') then
    raise exception 'Invalid handle: register as gerben or seb';
  end if;

  insert into public.profiles (id, handle, display_name, accent)
  values (
    new.id,
    h,
    case h when 'gerben' then 'Gerben' else 'Seb' end,
    case h when 'gerben' then '#38bdf8' else '#f472b6' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. Hulpfuncties voor Row Level Security
-- ---------------------------------------------------------------------
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.my_handle()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select handle from public.profiles where id = auth.uid();
$$;

-- Mag de ingelogde gebruiker items met deze scope zien? ('shared' of eigen handle)
create or replace function public.can_see_scope(s text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member() and (s = 'shared' or s = public.my_handle());
$$;

-- ---------------------------------------------------------------------
-- 3. Gedeelde instellingen (kleur van "Samen")
-- ---------------------------------------------------------------------
create table public.shared_settings (
  id         text primary key default 'shared' check (id = 'shared'),
  accent     text not null default '#a78bfa' check (accent ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

insert into public.shared_settings (id, accent) values ('shared', '#a78bfa');

-- ---------------------------------------------------------------------
-- 4. Reminders & to-do's
-- ---------------------------------------------------------------------
create table public.tasks (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'todo' check (kind in ('reminder', 'todo')),
  scope      text not null check (scope in ('gerben', 'seb', 'shared')),
  title      text not null check (char_length(title) between 1 and 200),
  notes      text not null default '' check (char_length(notes) <= 2000),
  urgent     boolean not null default false,
  important  boolean not null default false,
  due_date   date,
  done       boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index tasks_scope_idx on public.tasks (scope, done);

-- ---------------------------------------------------------------------
-- 5. Quick links en activiteitenfeed
-- ---------------------------------------------------------------------
create table public.quick_links (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  url        text not null check (url ~* '^https?://'),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.activity (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type       text not null,
  summary    text not null check (char_length(summary) <= 300),
  link       text,
  created_at timestamptz not null default now()
);
create index activity_created_idx on public.activity (created_at desc);

-- ---------------------------------------------------------------------
-- 6. Tweet Feed (volgende fase)
-- ---------------------------------------------------------------------
create table public.tweets (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  parent_id  uuid references public.tweets (id) on delete cascade,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tweet_likes (
  id         uuid primary key default gen_random_uuid(),
  tweet_id   uuid not null references public.tweets (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (tweet_id, user_id)
);

-- ---------------------------------------------------------------------
-- 7. Agenda (volgende fase)
-- ---------------------------------------------------------------------
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  scope       text not null default 'shared' check (scope in ('gerben', 'seb', 'shared')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  ics_uid     text,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
-- Voorkomt dubbele events bij het opnieuw importeren van dezelfde .ics
create unique index events_ics_uid_idx on public.events (created_by, ics_uid) where ics_uid is not null;

-- ---------------------------------------------------------------------
-- 8. File Room (volgende fase): metadata + privé storage-bucket
-- ---------------------------------------------------------------------
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 255),
  folder       text not null default '',
  storage_path text not null unique,
  mime_type    text,
  size_bytes   bigint not null default 0 check (size_bytes >= 0),
  created_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('file-room', 'file-room', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 9. Expenses (volgende fase) met onwijzigbare audittrail
-- ---------------------------------------------------------------------
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  description      text not null check (char_length(description) between 1 and 200),
  amount_cents     integer not null check (amount_cents > 0),
  currency         text not null default 'EUR' check (char_length(currency) = 3),
  paid_by          uuid not null references public.profiles (id),
  gerben_share_pct smallint not null default 50 check (gerben_share_pct between 0 and 100),
  category         text not null default '',
  expense_date     date not null default current_date,
  created_by       uuid not null default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now()
);

-- Onderlinge terugbetalingen (Tricount-stijl)
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  from_id      uuid not null references public.profiles (id),
  to_id        uuid not null references public.profiles (id),
  amount_cents integer not null check (amount_cents > 0),
  currency     text not null default 'EUR' check (char_length(currency) = 3),
  note         text not null default '',
  settled_on   date not null default current_date,
  created_by   uuid not null default auth.uid() references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (from_id <> to_id)
);

create table public.financial_audit (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  row_id     uuid not null,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id   uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.audit_financial_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.financial_audit (table_name, row_id, action, actor_id, old_data, new_data)
    values (tg_table_name, old.id, tg_op, auth.uid(), to_jsonb(old), null);
  elsif tg_op = 'UPDATE' then
    insert into public.financial_audit (table_name, row_id, action, actor_id, old_data, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
  else
    insert into public.financial_audit (table_name, row_id, action, actor_id, old_data, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), null, to_jsonb(new));
  end if;
  return null;
end;
$$;

create trigger expenses_audit
  after insert or update or delete on public.expenses
  for each row execute function public.audit_financial_change();

create trigger settlements_audit
  after insert or update or delete on public.settlements
  for each row execute function public.audit_financial_change();

-- De audittrail is append-only: wijzigen, verwijderen of legen wordt geweigerd
create or replace function public.block_audit_changes()
returns trigger
language plpgsql
as $$
begin
  raise exception 'financial_audit is append-only';
end;
$$;

create trigger financial_audit_no_change
  before update or delete on public.financial_audit
  for each row execute function public.block_audit_changes();

create trigger financial_audit_no_truncate
  before truncate on public.financial_audit
  for each statement execute function public.block_audit_changes();

revoke insert, update, delete, truncate on public.financial_audit from anon, authenticated;

-- ---------------------------------------------------------------------
-- 10. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.shared_settings  enable row level security;
alter table public.tasks            enable row level security;
alter table public.quick_links      enable row level security;
alter table public.activity         enable row level security;
alter table public.tweets           enable row level security;
alter table public.tweet_likes      enable row level security;
alter table public.events           enable row level security;
alter table public.files            enable row level security;
alter table public.expenses         enable row level security;
alter table public.settlements      enable row level security;
alter table public.financial_audit  enable row level security;

-- Profielen: elk lid ziet beide profielen, bewerkt enkel het eigen profiel
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_member());
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Handle en id blijven onwijzigbaar: enkel deze kolommen mogen aangepast worden
revoke update on public.profiles from authenticated;
grant update (display_name, bio, avatar_url, accent) on public.profiles to authenticated;

-- Gedeelde instellingen
create policy shared_settings_select on public.shared_settings
  for select to authenticated using (public.is_member());
create policy shared_settings_update on public.shared_settings
  for update to authenticated using (public.is_member()) with check (public.is_member());

-- Taken: gedeeld of eigen persoonlijke taken
create policy tasks_select on public.tasks
  for select to authenticated using (public.can_see_scope(scope));
create policy tasks_insert on public.tasks
  for insert to authenticated with check (created_by = auth.uid() and public.can_see_scope(scope));
create policy tasks_update on public.tasks
  for update to authenticated using (public.can_see_scope(scope)) with check (public.can_see_scope(scope));
create policy tasks_delete on public.tasks
  for delete to authenticated using (public.can_see_scope(scope));

-- Quick links
create policy quick_links_select on public.quick_links
  for select to authenticated using (public.is_member());
create policy quick_links_insert on public.quick_links
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy quick_links_delete on public.quick_links
  for delete to authenticated using (public.is_member());

-- Activiteit
create policy activity_select on public.activity
  for select to authenticated using (public.is_member());
create policy activity_insert on public.activity
  for insert to authenticated with check (public.is_member() and actor_id = auth.uid());

-- Tweets
create policy tweets_select on public.tweets
  for select to authenticated using (public.is_member());
create policy tweets_insert on public.tweets
  for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy tweets_update on public.tweets
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy tweets_delete on public.tweets
  for delete to authenticated using (author_id = auth.uid());

create policy tweet_likes_select on public.tweet_likes
  for select to authenticated using (public.is_member());
create policy tweet_likes_insert on public.tweet_likes
  for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy tweet_likes_delete on public.tweet_likes
  for delete to authenticated using (user_id = auth.uid());

-- Agenda
create policy events_select on public.events
  for select to authenticated using (public.can_see_scope(scope));
create policy events_insert on public.events
  for insert to authenticated with check (created_by = auth.uid() and public.can_see_scope(scope));
create policy events_update on public.events
  for update to authenticated using (public.can_see_scope(scope)) with check (public.can_see_scope(scope));
create policy events_delete on public.events
  for delete to authenticated using (public.can_see_scope(scope));

-- Bestanden (metadata)
create policy files_select on public.files
  for select to authenticated using (public.is_member());
create policy files_insert on public.files
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy files_update on public.files
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy files_delete on public.files
  for delete to authenticated using (public.is_member());

-- Bestanden (opslag in de privé-bucket)
create policy file_room_select on storage.objects
  for select to authenticated using (bucket_id = 'file-room' and public.is_member());
create policy file_room_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'file-room' and public.is_member());
create policy file_room_update on storage.objects
  for update to authenticated using (bucket_id = 'file-room' and public.is_member());
create policy file_room_delete on storage.objects
  for delete to authenticated using (bucket_id = 'file-room' and public.is_member());

-- Uitgaven en verrekeningen (elke wijziging komt in de audittrail)
create policy expenses_select on public.expenses
  for select to authenticated using (public.is_member());
create policy expenses_insert on public.expenses
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy expenses_update on public.expenses
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy expenses_delete on public.expenses
  for delete to authenticated using (public.is_member());

create policy settlements_select on public.settlements
  for select to authenticated using (public.is_member());
create policy settlements_insert on public.settlements
  for insert to authenticated with check (public.is_member() and created_by = auth.uid());
create policy settlements_update on public.settlements
  for update to authenticated using (public.is_member()) with check (public.is_member());
create policy settlements_delete on public.settlements
  for delete to authenticated using (public.is_member());

-- Audittrail: enkel lezen (schrijven gebeurt via de triggers)
create policy financial_audit_select on public.financial_audit
  for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------
-- 11. Realtime (live updates tussen jullie twee)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles,
  public.shared_settings,
  public.tasks,
  public.quick_links,
  public.activity,
  public.tweets,
  public.tweet_likes,
  public.events,
  public.files,
  public.expenses,
  public.settlements;