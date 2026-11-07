-- Meu Financeiro: estrutura inicial segura para backup e documentos na nuvem.
-- Execute no SQL Editor do projeto Supabase controlado pelo proprietário.
-- Nunca coloque service_role no aplicativo.

create table if not exists public.user_backups (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  schema_version integer not null default 2 check (schema_version > 0),
  updated_at timestamptz not null default now()
);
alter table public.user_backups enable row level security;

drop policy if exists "Users can read their own backup" on public.user_backups;
create policy "Users can read their own backup" on public.user_backups for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own backup" on public.user_backups;
create policy "Users can create their own backup" on public.user_backups for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own backup" on public.user_backups;
create policy "Users can update their own backup" on public.user_backups for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own backup" on public.user_backups;
create policy "Users can delete their own backup" on public.user_backups for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.user_documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  category text not null default 'Outros',
  description text not null default '',
  updated_at timestamptz not null default now(),
  constraint user_documents_path_belongs_to_user check (split_part(object_path, '/', 1) = user_id::text)
);
alter table public.user_documents enable row level security;

drop policy if exists "Users can read their own document metadata" on public.user_documents;
create policy "Users can read their own document metadata" on public.user_documents for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can create their own document metadata" on public.user_documents;
create policy "Users can create their own document metadata" on public.user_documents for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update their own document metadata" on public.user_documents;
create policy "Users can update their own document metadata" on public.user_documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own document metadata" on public.user_documents;
create policy "Users can delete their own document metadata" on public.user_documents for delete to authenticated using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-documents', 'private-documents', false, 26214400, array[
'application/pdf','text/csv','application/vnd.ms-excel',
'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.oasis.opendocument.text','application/vnd.oasis.opendocument.spreadsheet',
'image/jpeg','image/png','image/webp','text/plain'
])
on conflict (id) do update set public = false, file_size_limit = 26214400, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own private documents" on storage.objects;
create policy "Users can read their own private documents" on storage.objects for select to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can upload their own private documents" on storage.objects;
create policy "Users can upload their own private documents" on storage.objects for insert to authenticated
with check (bucket_id = 'private-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can update their own private documents" on storage.objects;
create policy "Users can update their own private documents" on storage.objects for update to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'private-documents' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Users can delete their own private documents" on storage.objects;
create policy "Users can delete their own private documents" on storage.objects for delete to authenticated
using (bucket_id = 'private-documents' and (storage.foldername(name))[1] = auth.uid()::text);
