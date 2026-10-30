-- FastLab v3: schema completo per un progetto Supabase NUOVO e vuoto.
-- Generato da scripts/sql-unico.sh unendo supabase/migrations/*.sql: non modificarlo a mano.
-- Incollalo tutto nell'editor SQL del Dashboard e premi Run. Su un progetto che ha già le tabelle fallisce.

begin;

-- ===== 20261028000001_schema.sql =====
-- FastLab v3: schema degli esperimenti configurabili.
--
-- Ogni tabella figlia porta esperimento_id; i riferimenti tra tabelle figlie sono FK
-- composte (id, esperimento_id), cosi' il database impedisce di mescolare righe di
-- esperimenti diversi. Le FK composte usano il default `no action`: la cancellazione a
-- cascata di un esperimento resta possibile perche' il controllo avviene a fine statement.

create table esperimenti (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  data_inizio date,
  note text not null default '',
  stato text not null default 'in_corso' check (stato in ('in_corso', 'concluso')),
  creato_da uuid not null default auth.uid() references auth.users (id),
  creato_il timestamptz not null default now()
);

create table fattori (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  nome text not null,
  ordine int not null,
  unique (id, esperimento_id)
);

create table livelli (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  fattore_id uuid not null,
  nome text not null,
  ordine int not null,
  unique (id, esperimento_id),
  foreign key (fattore_id, esperimento_id) references fattori (id, esperimento_id) on delete cascade
);

create table trattamenti (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  etichetta text not null,
  ordine int not null,
  unique (id, esperimento_id),
  unique (esperimento_id, etichetta)
);

create table trattamento_livelli (
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  trattamento_id uuid not null,
  livello_id uuid not null,
  primary key (trattamento_id, livello_id),
  foreign key (trattamento_id, esperimento_id) references trattamenti (id, esperimento_id) on delete cascade,
  foreign key (livello_id, esperimento_id) references livelli (id, esperimento_id) on delete cascade
);

create table piante (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  trattamento_id uuid not null,
  etichetta text not null,
  blocco text,
  ordine int not null,
  unique (id, esperimento_id),
  foreign key (trattamento_id, esperimento_id) references trattamenti (id, esperimento_id)
);

-- Le etichette delle piante sono uniche per esperimento, senza badare a spazi e maiuscole.
create unique index piante_etichetta_unica on piante (esperimento_id, lower(btrim(etichetta)));

create table parametri (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  nome text not null,
  unita text,
  tipo text not null check (tipo in ('numero', 'testo', 'sino', 'lista')),
  ordine int not null,
  archiviato boolean not null default false,
  progressivo boolean not null default false,
  ricorda_tra_piante boolean not null default false,
  n_letture int not null default 1 check (n_letture between 1 and 20),
  valore_min numeric,
  valore_max numeric,
  sotto_campi jsonb not null default '[]',
  unique (id, esperimento_id)
);

create table passate (
  id uuid primary key default gen_random_uuid(),
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  nome text not null,
  icona text,
  ordine int not null,
  unique (id, esperimento_id)
);

create table passata_parametri (
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  passata_id uuid not null,
  parametro_id uuid not null,
  obbligatorio boolean not null default false,
  ordine int not null,
  primary key (passata_id, parametro_id),
  foreign key (passata_id, esperimento_id) references passate (id, esperimento_id) on delete cascade,
  foreign key (parametro_id, esperimento_id) references parametri (id, esperimento_id) on delete cascade
);

-- `id` e' generato dal client (offline-first), quindi nessun default.
create table misure (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  pianta_id uuid not null,
  passata_id uuid not null,
  data_rilievo date not null,
  ora time(0) not null,
  valori jsonb not null default '{}',
  creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  foreign key (pianta_id, esperimento_id) references piante (id, esperimento_id),
  foreign key (passata_id, esperimento_id) references passate (id, esperimento_id)
);

create index misure_esperimento_data_idx on misure (esperimento_id, data_rilievo);
create index misure_pianta_idx on misure (pianta_id);

-- aggiornato_il segue ogni modifica di una misura.
create function imposta_aggiornato_il() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aggiornato_il := now();
  return new;
end
$$;

create trigger misure_aggiornato_il
  before update on misure
  for each row execute function imposta_aggiornato_il();

-- Un parametro che compare in almeno una misura non si elimina e non cambia tipo
-- (si puo' archiviare). La chiave in `misure.valori` e' l'id del parametro.
-- security definer: la guardia deve vedere tutte le misure, a prescindere dalle policy RLS
-- di chi esegue.
create function guardia_parametri() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Riscrivere lo stesso tipo non e' un cambio di tipo.
  if tg_op = 'UPDATE' and new.tipo = old.tipo then
    return new;
  end if;

  -- Eliminando un esperimento, il database elimina a cascata i suoi parametri quando
  -- la riga dell'esperimento e' gia' sparita (e le misure vanno via con lei, ma non
  -- necessariamente prima dei parametri): in quel caso non c'e' nulla da proteggere.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.esperimenti where id = old.esperimento_id) then
    return old;
  end if;

  if exists (
    select 1 from public.misure
    where esperimento_id = old.esperimento_id and valori ? old.id::text
  ) then
    raise exception 'PARAMETRO_CON_DATI';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger guardia_parametri
  before delete or update of tipo on parametri
  for each row execute function guardia_parametri();

-- ===== 20261028000002_rls.sql =====
-- FastLab v3: accesso per membro dell'esperimento (Row Level Security).
--
-- Ogni esperimento ha i suoi membri; per ora solo il proprietario, ma la tabella
-- predispone la condivisione. Ogni tabella figlia si filtra con is_membro(esperimento_id):
-- chi non e' membro non legge, non scrive e non tocca nulla di quell'esperimento.
-- anon non ha alcun privilegio sulle tabelle.

create table membri_esperimento (
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  utente_id uuid not null references auth.users (id),
  ruolo text not null default 'proprietario' check (ruolo in ('proprietario', 'collaboratore')),
  primary key (esperimento_id, utente_id)
);

create index membri_esperimento_utente_idx on membri_esperimento (utente_id);

-- security definer: le policy la chiamano per ogni riga e membri_esperimento ha a sua
-- volta RLS; il risultato dipende solo dall'utente corrente.
create function is_membro(p uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membri_esperimento m
     where m.esperimento_id = p
       and m.utente_id = (select auth.uid())
  )
$$;

revoke execute on function is_membro(uuid) from public, anon;
grant execute on function is_membro(uuid) to authenticated;

-- Chi crea l'esperimento ne diventa proprietario. Si usa creato_da: sotto RLS la policy
-- di insert impone creato_da = auth.uid(), e cosi' funziona anche da service role.
create function aggiungi_proprietario() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.membri_esperimento (esperimento_id, utente_id, ruolo)
  values (new.id, new.creato_da, 'proprietario');
  return new;
end
$$;

revoke execute on function aggiungi_proprietario() from public, anon, authenticated;
revoke execute on function guardia_parametri() from public, anon, authenticated;

create trigger esperimenti_proprietario
  after insert on esperimenti
  for each row execute function aggiungi_proprietario();

-- RLS su tutte le tabelle
alter table esperimenti enable row level security;
alter table membri_esperimento enable row level security;
alter table fattori enable row level security;
alter table livelli enable row level security;
alter table trattamenti enable row level security;
alter table trattamento_livelli enable row level security;
alter table piante enable row level security;
alter table parametri enable row level security;
alter table passate enable row level security;
alter table passata_parametri enable row level security;
alter table misure enable row level security;

create policy esperimenti_select on esperimenti
  for select to authenticated using (public.is_membro(id));
create policy esperimenti_insert on esperimenti
  for insert to authenticated with check (creato_da = (select auth.uid()));
create policy esperimenti_update on esperimenti
  for update to authenticated using (public.is_membro(id)) with check (public.is_membro(id));
create policy esperimenti_delete on esperimenti
  for delete to authenticated using (public.is_membro(id));

create policy membri_esperimento_select on membri_esperimento
  for select to authenticated using (utente_id = (select auth.uid()));

create policy fattori_membro on fattori
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy livelli_membro on livelli
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy trattamenti_membro on trattamenti
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy trattamento_livelli_membro on trattamento_livelli
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy piante_membro on piante
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy parametri_membro on parametri
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy passate_membro on passate
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy passata_parametri_membro on passata_parametri
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy misure_membro on misure
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));

-- Privilegi: Supabase concede tutto ad anon e authenticated per default. anon non serve;
-- truncate, references e trigger non passano da RLS e il client non li usa.
revoke all on table
  esperimenti, membri_esperimento, fattori, livelli, trattamenti, trattamento_livelli,
  piante, parametri, passate, passata_parametri, misure
  from anon;
revoke truncate, references, trigger on table
  esperimenti, membri_esperimento, fattori, livelli, trattamenti, trattamento_livelli,
  piante, parametri, passate, passata_parametri, misure
  from authenticated;
-- I membri si aggiungono solo dal trigger (in futuro da una RPC di condivisione).
revoke insert, update, delete on table membri_esperimento from authenticated;

-- ===== 20261028000003_inviti.sql =====
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

-- ===== 20261028000004_rpc.sql =====
-- FastLab v3: RPC. Tutte security invoker, quindi passano dalle policy RLS di chi chiama;
-- eseguibili solo da authenticated.

-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- passate[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla.
create function crea_esperimento(bozza jsonb) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (bozza -> 'esperimento' ->> 'id')::uuid;
begin
  -- creato_da prende il default auth.uid(); il trigger aggiunge il proprietario ai membri,
  -- cosi' gli insert successivi passano da is_membro. values inserisce sempre una riga:
  -- una bozza senza esperimento fallisce sul not null invece di non creare nulla.
  insert into public.esperimenti (id, nome, data_inizio, note, stato)
  values (v_id,
          bozza -> 'esperimento' ->> 'nome',
          (bozza -> 'esperimento' ->> 'data_inizio')::date,
          coalesce(bozza -> 'esperimento' ->> 'note', ''),
          coalesce(bozza -> 'esperimento' ->> 'stato', 'in_corso'));

  insert into public.fattori (id, esperimento_id, nome, ordine)
  select f.id, v_id, f.nome, f.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, nome text, ordine int);

  insert into public.livelli (id, esperimento_id, fattore_id, nome, ordine)
  select l.id, v_id, f.id, l.nome, l.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, livelli jsonb),
         jsonb_to_recordset(coalesce(f.livelli, '[]')) as l (id uuid, nome text, ordine int);

  insert into public.trattamenti (id, esperimento_id, etichetta, ordine)
  select t.id, v_id, t.etichetta, t.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, etichetta text, ordine int);

  insert into public.trattamento_livelli (esperimento_id, trattamento_id, livello_id)
  select v_id, t.id, tl.livello_id::uuid
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, livello_ids jsonb),
         jsonb_array_elements_text(coalesce(t.livello_ids, '[]')) as tl (livello_id);

  insert into public.piante (id, esperimento_id, trattamento_id, etichetta, blocco, ordine)
  select p.id, v_id, p.trattamento_id, p.etichetta, p.blocco, p.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'piante', '[]'))
         as p (id uuid, trattamento_id uuid, etichetta text, blocco text, ordine int);

  insert into public.parametri (id, esperimento_id, nome, unita, tipo, ordine, archiviato, progressivo,
                                ricorda_tra_piante, n_letture, valore_min, valore_max, sotto_campi)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false), coalesce(p.ricorda_tra_piante, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]')
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               ricorda_tra_piante boolean, n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb);

  insert into public.passate (id, esperimento_id, nome, icona, ordine)
  select pa.id, v_id, pa.nome, pa.icona, pa.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'passate', '[]')) as pa (id uuid, nome text, icona text, ordine int);

  insert into public.passata_parametri (esperimento_id, passata_id, parametro_id, obbligatorio, ordine)
  select v_id, pa.id, pp.parametro_id, coalesce(pp.obbligatorio, false), pp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'passate', '[]')) as pa (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(pa.parametri, '[]'))
         as pp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

-- Elenco degli esperimenti visibili, dal piu' recente. ultima_data e' l'ultima data di
-- rilievo; piante_ultima_data conta le piante distinte con almeno una misura in quella data.
create function riepilogo_esperimenti()
returns table (id uuid, nome text, stato text, data_inizio date, n_piante int, n_trattamenti int,
               ultima_data date, piante_ultima_data int)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.nome, e.stato, e.data_inizio,
         (select count(*)::int from public.piante p where p.esperimento_id = e.id),
         (select count(*)::int from public.trattamenti t where t.esperimento_id = e.id),
         u.ultima_data,
         (select count(distinct m.pianta_id)::int from public.misure m
           where m.esperimento_id = e.id and m.data_rilievo = u.ultima_data)
    from public.esperimenti e
   cross join lateral (
     select max(m.data_rilievo) as ultima_data from public.misure m where m.esperimento_id = e.id
   ) u
   order by e.creato_il desc, e.id
$$;

-- Parametri dell'esperimento che compaiono come chiave in almeno una misura: sono quelli
-- che non si possono eliminare (stesso controllo di guardia_parametri).
create function parametri_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.parametri p
   where p.esperimento_id = p_esperimento
     and exists (
       select 1 from public.misure m
        where m.esperimento_id = p.esperimento_id
          and m.valori ? p.id::text
     )
$$;

-- Piante dell'esperimento con almeno una misura.
create function piante_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct m.pianta_id from public.misure m where m.esperimento_id = p_esperimento
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
revoke execute on function riepilogo_esperimenti() from public, anon;
revoke execute on function parametri_con_dati(uuid) from public, anon;
revoke execute on function piante_con_dati(uuid) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;
grant execute on function riepilogo_esperimenti() to authenticated;
grant execute on function parametri_con_dati(uuid) to authenticated;
grant execute on function piante_con_dati(uuid) to authenticated;

-- ===== 20261028000005_invito_codice.sql =====
-- FastLab v3: codice invito obbligatorio e irrigidimenti.
--
-- La conferma via email e' spenta (lo SMTP predefinito di Supabase non scrive a indirizzi
-- fuori dal team), quindi un invito legato alla sola email potrebbe essere usato da chiunque
-- conosca un'email invitata. Ogni invito ha ora un codice casuale che l'admin passa al
-- collega; alla registrazione il client lo manda in options.data.codice_invito (finisce in
-- auth.users.raw_user_meta_data) e il trigger lo confronta senza badare a spazi e maiuscole.

-- Codice di 8 caratteri da un alfabeto senza simboli ambigui (niente 0/O e 1/I). I simboli
-- sono 32, quindi un byte casuale modulo 32 e' uniforme: 32^8 = 2^40 combinazioni.
create function genera_codice_invito() returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(b.bytes, i) % 32 + 1, 1), '' order by i)
    from extensions.gen_random_bytes(8) as b (bytes),
         generate_series(0, 7) as i
$$;

-- authenticated serve: e' il default di inviti.codice, valutato con i privilegi di chi
-- inserisce (l'admin).
revoke execute on function genera_codice_invito() from public, anon;
grant execute on function genera_codice_invito() to authenticated;

-- Email salvate gia' normalizzate (minuscole, senza spazi ai lati).
update inviti set email = lower(btrim(email)) where email <> lower(btrim(email));
alter table inviti
  add constraint inviti_email_normalizzata check (email = lower(btrim(email)));

alter table inviti
  add column codice text not null default public.genera_codice_invito()
    constraint inviti_codice_formato check (codice ~ '^[A-Z0-9]{8,}$');
create unique index inviti_codice_unico on inviti (codice);

-- Email e codice devono appartenere allo stesso invito non usato. Qualunque cosa manchi,
-- l'errore e' lo stesso: non si rivela se l'email e' invitata.
create or replace function verifica_invito() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.inviti i
     where lower(i.email) = lower(new.email)
       and i.usato_il is null
       and i.codice = upper(btrim(new.raw_user_meta_data ->> 'codice_invito'))
  ) then
    raise exception 'INVITO_MANCANTE';
  end if;
  return new;
end
$$;

revoke execute on function verifica_invito() from public, anon, authenticated;

-- creato_da non si cambia dopo l'insert. Un revoke sulla sola colonna non avrebbe effetto
-- finche' resta il privilegio update sull'intera tabella: si toglie quello e si concede
-- l'update sulle altre colonne, comprese id ed esperimento_id perche' l'upsert di
-- PostgREST mette nel SET tutte le colonne del payload (che quindi non deve contenere
-- creato_da). Una colonna aggiunta in futuro va aggiunta anche qui.
revoke update on table esperimenti, misure from authenticated;
grant update (id, nome, data_inizio, note, stato, creato_il) on table esperimenti to authenticated;
grant update (id, esperimento_id, pianta_id, passata_id, data_rilievo, ora, valori, creato_il, aggiornato_il)
  on table misure to authenticated;

-- ===== 20261029000006_guardie_piante.sql =====
-- FastLab v3: guardie su piante e su esperimento_id.
--
-- 1. Una pianta con misure non cambia trattamento: le sue misure finirebbero sotto un altro
--    trattamento (nei grafici e nell'export). Etichetta, blocco e ordine restano modificabili,
--    e riscrivere lo stesso trattamento (l'app manda sempre tutta la riga) non e' un cambio.
-- 2. Nessuna riga di dominio cambia esperimento: un upsert con l'id di una riga di un altro
--    esperimento, di cui l'utente e' membro, la sposterebbe (le policy guardano solo
--    l'appartenenza, prima e dopo).

-- security definer: la guardia deve vedere tutte le misure della pianta, a prescindere dalle
-- policy RLS di chi esegue (come guardia_parametri).
create function guardia_piante() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.misure
    where esperimento_id = old.esperimento_id and pianta_id = old.id
  ) then
    raise exception 'PIANTA_CON_DATI';
  end if;
  return new;
end
$$;

create trigger guardia_piante
  before update of trattamento_id on piante
  for each row
  when (new.trattamento_id is distinct from old.trattamento_id)
  execute function guardia_piante();

create function guardia_esperimento_id() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ESPERIMENTO_NON_MODIFICABILE';
end
$$;

-- Tutte le tabelle con esperimento_id (membri_esperimento non ha UPDATE per i client, ma la
-- guardia vale anche li': nessuna riga passa da un esperimento all'altro).
create trigger guardia_esperimento_id before update of esperimento_id on fattori
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on livelli
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on trattamenti
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on trattamento_livelli
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on piante
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on parametri
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on passate
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on passata_parametri
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on misure
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on membri_esperimento
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

revoke execute on function guardia_piante() from public, anon, authenticated;
revoke execute on function guardia_esperimento_id() from public, anon, authenticated;

-- ===== 20261029000007_strumenti.sql =====
-- FastLab v3, Piano A: le passate diventano strumenti.
--
-- Il concetto resta lo stesso (un gruppo di parametri misurati insieme), cambiano nome e
-- regole:
-- 1. passate -> strumenti, passata_parametri -> strumento_parametri, passata_id ->
--    strumento_id. Si rinominano anche vincoli, indici e policy, cosi' nessun messaggio
--    d'errore e nessun nome nel database cita piu' le passate.
-- 2. strumenti.tipo ('strumento' | 'fenologico'): al massimo una tabella fenologica per
--    esperimento. strumenti.archiviato: uno strumento con misure non si elimina, si archivia.
-- 3. Un parametro appartiene a un solo strumento.
--
-- Trigger (guardia_esperimento_id), policy, RLS e privilegi seguono la tabella e la colonna
-- rinominate; la funzione crea_esperimento invece cita le tabelle per nome e va riscritta.

-- ===== 1. Rinomine =====
alter table passate rename to strumenti;
alter table passata_parametri rename to strumento_parametri;
alter table strumento_parametri rename column passata_id to strumento_id;
alter table misure rename column passata_id to strumento_id;

-- Rinominare un vincolo primary key o unique rinomina anche il suo indice.
alter table strumenti rename constraint passate_pkey to strumenti_pkey;
alter table strumenti rename constraint passate_id_esperimento_id_key to strumenti_id_esperimento_id_key;
alter table strumenti rename constraint passate_esperimento_id_fkey to strumenti_esperimento_id_fkey;
-- L'indice della chiave primaria conserva il nome della colonna di quando e' stato creato
-- (passata_id) anche dopo la rinomina: la chiave si ricrea. Nessuna FK punta a questa tabella.
alter table strumento_parametri
  drop constraint passata_parametri_pkey,
  add constraint strumento_parametri_pkey primary key (strumento_id, parametro_id);
alter table strumento_parametri
  rename constraint passata_parametri_esperimento_id_fkey to strumento_parametri_esperimento_id_fkey;
alter table strumento_parametri
  rename constraint passata_parametri_passata_id_esperimento_id_fkey to strumento_parametri_strumento_id_esperimento_id_fkey;
alter table strumento_parametri
  rename constraint passata_parametri_parametro_id_esperimento_id_fkey to strumento_parametri_parametro_id_esperimento_id_fkey;
alter table misure rename constraint misure_passata_id_esperimento_id_fkey to misure_strumento_id_esperimento_id_fkey;

alter policy passate_membro on strumenti rename to strumenti_membro;
alter policy passata_parametri_membro on strumento_parametri rename to strumento_parametri_membro;

-- Il grant per colonna su misure (20261028000005) segue la colonna rinominata; lo si
-- riscrive comunque per intero, cosi' l'elenco valido e' leggibile qui: tutte le colonne
-- tranne creato_da. Una colonna aggiunta in futuro va aggiunta anche qui.
revoke update on table misure from authenticated;
grant update (id, esperimento_id, pianta_id, strumento_id, data_rilievo, ora, valori, creato_il, aggiornato_il)
  on table misure to authenticated;

-- ===== 2. Tipo e archiviato =====
alter table strumenti
  add column tipo text not null default 'strumento' check (tipo in ('strumento', 'fenologico')),
  add column archiviato boolean not null default false;

create unique index strumenti_un_fenologico on strumenti (esperimento_id) where tipo = 'fenologico';

-- ===== 3. Un parametro in un solo strumento =====
-- Nel Piano 1 un parametro poteva stare in piu' passate (il modello Hydrochar metteva Altezza
-- sia in "Altezza" sia in "Fenologici"). Non si sceglie qui quale collegamento togliere:
-- se ci sono doppioni la migration si ferma con un messaggio chiaro. Fermandosi si annulla per intero:
-- la tabella da correggere ha ancora il nome del Piano 1.
do $$
begin
  if exists (select 1 from public.strumento_parametri group by parametro_id having count(*) > 1) then
    raise exception 'PARAMETRO_IN_PIU_STRUMENTI: togliere i doppioni da passata_parametri (o ricreare il database con npx supabase db reset)';
  end if;
end
$$;

create unique index strumento_parametri_un_solo_strumento on strumento_parametri (parametro_id);

-- ===== RPC =====
-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- strumenti[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla. tipo e archiviato degli strumenti prendono i
-- default se la bozza non li porta.
create or replace function crea_esperimento(bozza jsonb) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (bozza -> 'esperimento' ->> 'id')::uuid;
begin
  -- creato_da prende il default auth.uid(); il trigger aggiunge il proprietario ai membri,
  -- cosi' gli insert successivi passano da is_membro. values inserisce sempre una riga:
  -- una bozza senza esperimento fallisce sul not null invece di non creare nulla.
  insert into public.esperimenti (id, nome, data_inizio, note, stato)
  values (v_id,
          bozza -> 'esperimento' ->> 'nome',
          (bozza -> 'esperimento' ->> 'data_inizio')::date,
          coalesce(bozza -> 'esperimento' ->> 'note', ''),
          coalesce(bozza -> 'esperimento' ->> 'stato', 'in_corso'));

  insert into public.fattori (id, esperimento_id, nome, ordine)
  select f.id, v_id, f.nome, f.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, nome text, ordine int);

  insert into public.livelli (id, esperimento_id, fattore_id, nome, ordine)
  select l.id, v_id, f.id, l.nome, l.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, livelli jsonb),
         jsonb_to_recordset(coalesce(f.livelli, '[]')) as l (id uuid, nome text, ordine int);

  insert into public.trattamenti (id, esperimento_id, etichetta, ordine)
  select t.id, v_id, t.etichetta, t.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, etichetta text, ordine int);

  insert into public.trattamento_livelli (esperimento_id, trattamento_id, livello_id)
  select v_id, t.id, tl.livello_id::uuid
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, livello_ids jsonb),
         jsonb_array_elements_text(coalesce(t.livello_ids, '[]')) as tl (livello_id);

  insert into public.piante (id, esperimento_id, trattamento_id, etichetta, blocco, ordine)
  select p.id, v_id, p.trattamento_id, p.etichetta, p.blocco, p.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'piante', '[]'))
         as p (id uuid, trattamento_id uuid, etichetta text, blocco text, ordine int);

  insert into public.parametri (id, esperimento_id, nome, unita, tipo, ordine, archiviato, progressivo,
                                ricorda_tra_piante, n_letture, valore_min, valore_max, sotto_campi)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false), coalesce(p.ricorda_tra_piante, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]')
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               ricorda_tra_piante boolean, n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb);

  insert into public.strumenti (id, esperimento_id, nome, icona, ordine, tipo, archiviato)
  select s.id, v_id, s.nome, s.icona, s.ordine, coalesce(s.tipo, 'strumento'), coalesce(s.archiviato, false)
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]'))
         as s (id uuid, nome text, icona text, ordine int, tipo text, archiviato boolean);

  insert into public.strumento_parametri (esperimento_id, strumento_id, parametro_id, obbligatorio, ordine)
  select v_id, s.id, sp.parametro_id, coalesce(sp.obbligatorio, false), sp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]')) as s (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(s.parametri, '[]'))
         as sp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;

-- ===== 20261029000008_mantieni.sql =====
-- Via "ricorda tra piante": il valore uguale tra una pianta e l'altra non e' piu' una proprieta' del parametro
-- ma una scelta di chi rileva, "Mantieni questo parametro uguale anche nelle prossime misure", che vive nel
-- dispositivo (store di campo) e non nel database. La colonna non serve piu'. Una bozza che la porta ancora
-- (un client vecchio) funziona lo stesso: jsonb_to_recordset ignora le chiavi che non elenca.
alter table parametri drop column ricorda_tra_piante;

-- crea_esperimento come nella migration 0007, senza il campo dei parametri.
-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- strumenti[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla. tipo e archiviato degli strumenti prendono i
-- default se la bozza non li porta.
create or replace function crea_esperimento(bozza jsonb) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (bozza -> 'esperimento' ->> 'id')::uuid;
begin
  -- creato_da prende il default auth.uid(); il trigger aggiunge il proprietario ai membri,
  -- cosi' gli insert successivi passano da is_membro. values inserisce sempre una riga:
  -- una bozza senza esperimento fallisce sul not null invece di non creare nulla.
  insert into public.esperimenti (id, nome, data_inizio, note, stato)
  values (v_id,
          bozza -> 'esperimento' ->> 'nome',
          (bozza -> 'esperimento' ->> 'data_inizio')::date,
          coalesce(bozza -> 'esperimento' ->> 'note', ''),
          coalesce(bozza -> 'esperimento' ->> 'stato', 'in_corso'));

  insert into public.fattori (id, esperimento_id, nome, ordine)
  select f.id, v_id, f.nome, f.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, nome text, ordine int);

  insert into public.livelli (id, esperimento_id, fattore_id, nome, ordine)
  select l.id, v_id, f.id, l.nome, l.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, livelli jsonb),
         jsonb_to_recordset(coalesce(f.livelli, '[]')) as l (id uuid, nome text, ordine int);

  insert into public.trattamenti (id, esperimento_id, etichetta, ordine)
  select t.id, v_id, t.etichetta, t.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, etichetta text, ordine int);

  insert into public.trattamento_livelli (esperimento_id, trattamento_id, livello_id)
  select v_id, t.id, tl.livello_id::uuid
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, livello_ids jsonb),
         jsonb_array_elements_text(coalesce(t.livello_ids, '[]')) as tl (livello_id);

  insert into public.piante (id, esperimento_id, trattamento_id, etichetta, blocco, ordine)
  select p.id, v_id, p.trattamento_id, p.etichetta, p.blocco, p.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'piante', '[]'))
         as p (id uuid, trattamento_id uuid, etichetta text, blocco text, ordine int);

  insert into public.parametri (id, esperimento_id, nome, unita, tipo, ordine, archiviato, progressivo,
                                n_letture, valore_min, valore_max, sotto_campi)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]')
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb);

  insert into public.strumenti (id, esperimento_id, nome, icona, ordine, tipo, archiviato)
  select s.id, v_id, s.nome, s.icona, s.ordine, coalesce(s.tipo, 'strumento'), coalesce(s.archiviato, false)
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]'))
         as s (id uuid, nome text, icona text, ordine int, tipo text, archiviato boolean);

  insert into public.strumento_parametri (esperimento_id, strumento_id, parametro_id, obbligatorio, ordine)
  select v_id, s.id, sp.parametro_id, coalesce(sp.obbligatorio, false), sp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]')) as s (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(s.parametri, '[]'))
         as sp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;

-- ===== 20261029000009_catalogo.sql =====
-- FastLab v3, Piano A: catalogo strumenti condiviso.
--
-- Il catalogo e' l'unica tabella condivisa tra tutti gli utenti: ogni voce e' uno strumento
-- (SPAD, Termometro, Ciras…) con i suoi valori. Un esperimento non usa la voce direttamente:
-- ne copia lo strumento e i parametri, che restano collegati con strumenti.catalogo_id e
-- parametri.catalogo_chiave (per aggiornare in seguito le proprie copie dal catalogo).
-- 1. catalogo_strumenti: lettura, inserimento e aggiornamento per authenticated; nessun
--    delete (le voci si archiviano); niente per anon; creato_da e id non modificabili; una
--    voce sopravvive al suo autore.
-- 2. I semi: le voci di partenza, con id fissi e senza autore.
-- 3. I collegamenti negli esperimenti e crea_esperimento che li legge dalla bozza.

-- ===== 1. Tabella =====
-- parametri: array di {chiave, nome, unita, n_letture, valore_min, valore_max}. La chiave
-- identifica il valore dentro la voce (diventa parametri.catalogo_chiave nelle copie).
create table catalogo_strumenti (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (btrim(nome) <> ''),
  icona text,
  descrizione text not null default '',
  parametri jsonb not null default '[]'
    constraint catalogo_strumenti_parametri_array check (jsonb_typeof(parametri) = 'array'),
  archiviato boolean not null default false,
  -- La voce e' di tutti: se l'autore viene eliminato resta, senza autore (come i semi).
  creato_da uuid references auth.users (id) on delete set null default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

-- Due voci attive con lo stesso nome (senza badare a spazi e maiuscole) confonderebbero la
-- scelta: si rifiutano. Una voce archiviata libera il nome. Il nome dell'indice e' quello che
-- l'app riconosce nel 23505 (src/lib/errori.ts).
create unique index catalogo_strumenti_nome_unico on catalogo_strumenti (lower(btrim(nome))) where not archiviato;

create trigger catalogo_strumenti_aggiornato_il
  before update on catalogo_strumenti
  for each row execute function public.imposta_aggiornato_il();

-- L'id di una voce non cambia: le copie negli esperimenti la ritrovano con catalogo_id. Il
-- privilegio di update su id resta (l'upsert di PostgREST mette id nel SET, con lo stesso
-- valore): la guardia scatta solo se l'id cambia davvero. security definer come le altre
-- guardie, cosi' non dipende dai privilegi di chi aggiorna.
create function guardia_id_catalogo() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'ID_NON_MODIFICABILE';
end
$$;

revoke execute on function guardia_id_catalogo() from public, anon, authenticated;

create trigger guardia_id_catalogo
  before update of id on catalogo_strumenti
  for each row when (new.id is distinct from old.id)
  execute function guardia_id_catalogo();

alter table catalogo_strumenti enable row level security;

-- Il catalogo e' di tutti: ogni utente autenticato legge e modifica ogni voce. Chi inserisce
-- firma la voce con se stesso (nessuno la firma a nome di altri).
create policy catalogo_strumenti_select on catalogo_strumenti
  for select to authenticated using (true);
create policy catalogo_strumenti_insert on catalogo_strumenti
  for insert to authenticated with check (creato_da = (select auth.uid()));
create policy catalogo_strumenti_update on catalogo_strumenti
  for update to authenticated using (true) with check (true);

-- Privilegi: Supabase concede tutto ad anon e authenticated per default. anon non serve;
-- delete non c'e' (nessuna policy e nessun privilegio: le voci si archiviano); truncate,
-- references e trigger non passano da RLS. creato_da non si cambia dopo l'insert: come in
-- 20261028000005 si toglie l'update sulla tabella e lo si concede sulle altre colonne,
-- comprese id e aggiornato_il perche' l'upsert di PostgREST mette nel SET tutte le colonne
-- del payload. Una colonna aggiunta in futuro va aggiunta anche qui.
revoke all on table catalogo_strumenti from anon;
revoke delete, truncate, references, trigger on table catalogo_strumenti from authenticated;
revoke update on table catalogo_strumenti from authenticated;
grant update (id, nome, icona, descrizione, parametri, archiviato, creato_il, aggiornato_il)
  on table catalogo_strumenti to authenticated;

-- ===== 2. Semi =====
-- Id fissi e leggibili, cosi' i test e i modelli li possono citare; creato_da null: non sono
-- di nessun utente. Ogni valore ha una lettura e nessun limite.
insert into catalogo_strumenti (id, nome, icona, descrizione, parametri, creato_da) values
  ('c0000000-0000-0000-0000-000000000001', 'SPAD', '💚', 'Contenuto di clorofilla della foglia.',
   '[{"chiave": "spad", "nome": "SPAD", "unita": null, "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000002', 'Termometro', '🌡', 'Temperatura dell''aria e della pianta.',
   '[{"chiave": "temp_aria", "nome": "Temp aria", "unita": "°C", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "temp_pianta", "nome": "Temp pianta", "unita": "°C", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000003', 'Ciras', '🍃', 'Scambi gassosi della foglia.',
   '[{"chiave": "a", "nome": "A", "unita": "µmol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "gs", "nome": "gs", "unita": "mol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "e", "nome": "E", "unita": "mmol m⁻² s⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null},
     {"chiave": "ci", "nome": "Ci", "unita": "µmol mol⁻¹", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000004', 'Metro', '📏', 'Altezza della pianta.',
   '[{"chiave": "altezza", "nome": "Altezza", "unita": "cm", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null),
  ('c0000000-0000-0000-0000-000000000005', 'Calibro', '📐', 'Diametro del fusto.',
   '[{"chiave": "diametro", "nome": "Diametro", "unita": "mm", "n_letture": 1, "valore_min": null, "valore_max": null}]',
   null);

-- ===== 3. Collegamenti negli esperimenti =====
-- Facoltativi: uno strumento creato a mano non viene dal catalogo, un parametro aggiunto a
-- mano non ha chiave. Le voci non si eliminano, quindi il riferimento non resta mai appeso.
-- strumenti e parametri hanno l'update sull'intera tabella: le colonne nuove si aggiornano.
alter table strumenti add column catalogo_id uuid references catalogo_strumenti (id);
alter table parametri add column catalogo_chiave text;

-- crea_esperimento come nella migration 0008, con strumenti[].catalogo_id e
-- parametri[].catalogo_chiave (null se la bozza non li porta).
-- Crea un esperimento completo da una BozzaEsperimento serializzata (src/domain/tipi.ts):
-- esperimento, fattori[].livelli[], trattamenti[].livello_ids, piante, parametri,
-- strumenti[].parametri[]. Gli id sono quelli della bozza (generati dal client) e ogni riga
-- figlia prende esperimento_id = bozza.esperimento.id. Una chiamata e' un solo statement:
-- se un insert fallisce non resta nulla. tipo e archiviato degli strumenti prendono i
-- default se la bozza non li porta.
create or replace function crea_esperimento(bozza jsonb) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := (bozza -> 'esperimento' ->> 'id')::uuid;
begin
  -- creato_da prende il default auth.uid(); il trigger aggiunge il proprietario ai membri,
  -- cosi' gli insert successivi passano da is_membro. values inserisce sempre una riga:
  -- una bozza senza esperimento fallisce sul not null invece di non creare nulla.
  insert into public.esperimenti (id, nome, data_inizio, note, stato)
  values (v_id,
          bozza -> 'esperimento' ->> 'nome',
          (bozza -> 'esperimento' ->> 'data_inizio')::date,
          coalesce(bozza -> 'esperimento' ->> 'note', ''),
          coalesce(bozza -> 'esperimento' ->> 'stato', 'in_corso'));

  insert into public.fattori (id, esperimento_id, nome, ordine)
  select f.id, v_id, f.nome, f.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, nome text, ordine int);

  insert into public.livelli (id, esperimento_id, fattore_id, nome, ordine)
  select l.id, v_id, f.id, l.nome, l.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'fattori', '[]')) as f (id uuid, livelli jsonb),
         jsonb_to_recordset(coalesce(f.livelli, '[]')) as l (id uuid, nome text, ordine int);

  insert into public.trattamenti (id, esperimento_id, etichetta, ordine)
  select t.id, v_id, t.etichetta, t.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, etichetta text, ordine int);

  insert into public.trattamento_livelli (esperimento_id, trattamento_id, livello_id)
  select v_id, t.id, tl.livello_id::uuid
    from jsonb_to_recordset(coalesce(bozza -> 'trattamenti', '[]')) as t (id uuid, livello_ids jsonb),
         jsonb_array_elements_text(coalesce(t.livello_ids, '[]')) as tl (livello_id);

  insert into public.piante (id, esperimento_id, trattamento_id, etichetta, blocco, ordine)
  select p.id, v_id, p.trattamento_id, p.etichetta, p.blocco, p.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'piante', '[]'))
         as p (id uuid, trattamento_id uuid, etichetta text, blocco text, ordine int);

  insert into public.parametri (id, esperimento_id, nome, unita, tipo, ordine, archiviato, progressivo,
                                n_letture, valore_min, valore_max, sotto_campi, catalogo_chiave)
  select p.id, v_id, p.nome, p.unita, p.tipo, p.ordine,
         coalesce(p.archiviato, false), coalesce(p.progressivo, false),
         coalesce(p.n_letture, 1), p.valore_min, p.valore_max, coalesce(p.sotto_campi, '[]'), p.catalogo_chiave
    from jsonb_to_recordset(coalesce(bozza -> 'parametri', '[]'))
         as p (id uuid, nome text, unita text, tipo text, ordine int, archiviato boolean, progressivo boolean,
               n_letture int, valore_min numeric, valore_max numeric,
               sotto_campi jsonb, catalogo_chiave text);

  insert into public.strumenti (id, esperimento_id, nome, icona, ordine, tipo, archiviato, catalogo_id)
  select s.id, v_id, s.nome, s.icona, s.ordine, coalesce(s.tipo, 'strumento'), coalesce(s.archiviato, false),
         s.catalogo_id
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]'))
         as s (id uuid, nome text, icona text, ordine int, tipo text, archiviato boolean, catalogo_id uuid);

  insert into public.strumento_parametri (esperimento_id, strumento_id, parametro_id, obbligatorio, ordine)
  select v_id, s.id, sp.parametro_id, coalesce(sp.obbligatorio, false), sp.ordine
    from jsonb_to_recordset(coalesce(bozza -> 'strumenti', '[]')) as s (id uuid, parametri jsonb),
         jsonb_to_recordset(coalesce(s.parametri, '[]'))
         as sp (parametro_id uuid, obbligatorio boolean, ordine int);

  return v_id;
end
$$;

revoke execute on function crea_esperimento(jsonb) from public, anon;
grant execute on function crea_esperimento(jsonb) to authenticated;

-- ===== 20261029000010_ultime_misure.sql =====
-- La data dell'ultima misura di ogni strumento di un esperimento, per la pagina "Scegli lo strumento"
-- ("ultima volta 21/10"). Una riga per strumento con almeno una misura; gli strumenti mai misurati non compaiono.
-- Security invoker: la RLS di misure resta quella di chi chiama, quindi un non membro non vede nulla.
create function ultime_misure_per_strumento(p_esperimento uuid) returns table (strumento_id uuid, ultima date)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.strumento_id, max(m.data_rilievo)
    from public.misure m
   where m.esperimento_id = p_esperimento
   group by m.strumento_id
$$;

revoke execute on function ultime_misure_per_strumento(uuid) from public, anon;
grant execute on function ultime_misure_per_strumento(uuid) to authenticated;

commit;
