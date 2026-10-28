-- FastLab v3: registrazione solo su invito, profili e ruolo amministratore.
--
-- Un trigger su auth.users rifiuta la registrazione se l'email non ha un invito non
-- ancora usato (dalla migration 0005 serve anche il codice dell'invito). GoTrue v2.197
-- risponde HTTP 500 con {"code":"P0001","message":"INVITO_MANCANTE"}; versioni piu'
-- vecchie rispondono "Database error saving new user". L'admin gestisce gli
-- inviti; non vede i dati degli altri (le sue righe di esperimenti passano dalle stesse
-- policy di tutti). Il primo admin si imposta a mano: update profili set admin = true.

create table profili (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  admin boolean not null default false
);

create table inviti (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  creato_il timestamptz not null default now(),
  usato_il timestamptz
);

create unique index inviti_email_unica on inviti (lower(email));

create function is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.admin from public.profili p where p.id = (select auth.uid())),
    false)
$$;

revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

alter table profili enable row level security;
alter table inviti enable row level security;

-- Ognuno legge solo il proprio profilo; nessuna policy di scrittura (admin si imposta a mano).
create policy profili_select on profili
  for select to authenticated using (id = (select auth.uid()));

create policy inviti_admin on inviti
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on table profili, inviti from anon;
revoke insert, update, delete, truncate, references, trigger on table profili from authenticated;
revoke truncate, references, trigger on table inviti from authenticated;

-- Prima dell'insert in auth.users: serve un invito non usato per la stessa email.
-- Un utente senza email (telefono, anonimo) non ha invito e viene rifiutato.
create function verifica_invito() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.inviti i
     where lower(i.email) = lower(new.email)
       and i.usato_il is null
  ) then
    raise exception 'INVITO_MANCANTE';
  end if;
  return new;
end
$$;

-- Dopo l'insert: crea il profilo e segna l'invito come usato.
create function registra_utente() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profili (id, email) values (new.id, new.email);
  update public.inviti set usato_il = now()
   where lower(email) = lower(new.email)
     and usato_il is null;
  return new;
end
$$;

revoke execute on function verifica_invito() from public, anon, authenticated;
revoke execute on function registra_utente() from public, anon, authenticated;

create trigger verifica_invito
  before insert on auth.users
  for each row execute function public.verifica_invito();

create trigger registra_utente
  after insert on auth.users
  for each row execute function public.registra_utente();

-- Utenti gia' registrati prima di questa migration: ricevono il profilo.
insert into profili (id, email)
select u.id, u.email from auth.users u
 where u.email is not null
on conflict (id) do nothing;
