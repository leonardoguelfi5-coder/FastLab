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

-- ===== 20261031000011_ultime_misure_piante.sql =====
-- Le misure piu' recenti di ogni pianta per ogni strumento, per la scheda della pianta, l'elenco per trattamento e
-- "Oggi". Per ogni coppia (pianta, strumento) restituisce TUTTE le misure della data piu' recente: due misure dello
-- stesso giorno tornano entrambe, cosi' il client puo' fare la media giornaliera. Le coppie mai misurate non compaiono.
-- Security invoker: la RLS di misure resta quella di chi chiama, quindi un non membro non vede nulla.
create function ultime_misure_piante(p_esperimento uuid) returns setof public.misure
language sql
stable
security invoker
set search_path = ''
as $$
  select m.*
    from public.misure m
   where m.esperimento_id = p_esperimento
     and (m.pianta_id, m.strumento_id, m.data_rilievo) in (
       select u.pianta_id, u.strumento_id, max(u.data_rilievo)
         from public.misure u
        where u.esperimento_id = p_esperimento
        group by u.pianta_id, u.strumento_id
     )
   order by m.pianta_id, m.strumento_id, m.data_rilievo, m.ora
$$;

revoke execute on function ultime_misure_piante(uuid) from public, anon;
grant execute on function ultime_misure_piante(uuid) to authenticated;

-- ===== 20261101000012_note_foto.sql =====
-- FastLab v3, Piano C: note (con i promemoria) e foto, con le loro sicurezze.
--
-- 1. note: una nota datata dell'esperimento. promemoria = true se, quando la si e' salvata,
--    la data era futura (lo decide il client); fatto_il quando la si spunta.
-- 2. note_piante, note_trattamenti: a cosa e' collegata una nota (nessun collegamento = tutto
--    l'esperimento). Spariscono con la nota; una pianta o un trattamento con note collegate non
--    si elimina (23503, come una pianta con misure).
-- 3. foto: una riga per file, collegata a una pianta, a una nota o solo all'esperimento. Il file
--    sta nello Storage in `foto/<esperimento_id>/<id>.jpg`, e il vincolo sul percorso lo impone
--    anche alla riga. Eliminando la nota la foto resta, senza nota; una pianta con foto non si
--    elimina.
-- 4. Lo Storage: bucket privato `foto` e policy su storage.objects per i membri.
--
-- Come le altre tabelle: FK composte (id, esperimento_id), guardia_esperimento_id, RLS per
-- membro, niente per anon, creato_da non aggiornabile (e, all'insert, solo quello di chi scrive).
--
-- Cosa presuppone dello schema `storage` (lo crea il servizio Storage di Supabase, qui non si
-- ricrea nulla; scripts/db-senza-docker/stub-supabase.sql ne imita il minimo per i pgTAP):
-- - storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint,
--   allowed_mime_types text[]);
-- - storage.objects (bucket_id text, name text, owner uuid, ...) con la RLS gia' attiva;
-- - il servizio Storage esegue le query sugli oggetti con il ruolo (authenticated o anon) e le
--   claims del JWT di chi chiama, quindi auth.uid() e le policy qui sotto valgono anche li';
-- - authenticated e anon hanno i privilegi sulle tabelle dello Storage (li concede Supabase):
--   a filtrare sono solo le policy.
-- `on delete set null (nota_id)` richiede PostgreSQL 15 o successivo.

-- ===== 1. Note =====
-- `id` e' generato dal client (upsert per id), quindi nessun default.
create table note (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  data date not null,
  testo text not null check (btrim(testo) <> ''),
  promemoria boolean not null default false,
  fatto_il timestamptz,
  creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (id, esperimento_id)
);

create index note_esperimento_data_idx on note (esperimento_id, data);

create trigger note_aggiornato_il
  before update on note
  for each row execute function public.imposta_aggiornato_il();

-- ===== 2. Collegamenti delle note =====
-- Verso piante e trattamenti il default `no action`: la pianta o il trattamento collegati non
-- si eliminano, ma l'eliminazione a cascata dell'esperimento resta possibile perche' il
-- controllo avviene a fine statement (come per le misure).
create table note_piante (
  nota_id uuid not null,
  pianta_id uuid not null,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  primary key (nota_id, pianta_id),
  foreign key (nota_id, esperimento_id) references note (id, esperimento_id) on delete cascade,
  foreign key (pianta_id, esperimento_id) references piante (id, esperimento_id)
);

create index note_piante_pianta_idx on note_piante (pianta_id);

create table note_trattamenti (
  nota_id uuid not null,
  trattamento_id uuid not null,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  primary key (nota_id, trattamento_id),
  foreign key (nota_id, esperimento_id) references note (id, esperimento_id) on delete cascade,
  foreign key (trattamento_id, esperimento_id) references trattamenti (id, esperimento_id)
);

create index note_trattamenti_trattamento_idx on note_trattamenti (trattamento_id);

-- ===== 3. Foto =====
-- percorso e' sempre `<esperimento_id>/<id>.jpg`: una riga non puo' indicare il file di un
-- altro esperimento o di un'altra foto (ne' occuparne il percorso, che e' unico). Resta una
-- colonna perche' e' cio' che il client passa allo Storage. archiviata: il file e' stato
-- tolto dallo Storage dopo l'archivio .zip, la riga resta.
-- Sulla nota `on delete set null (nota_id)`: solo nota_id diventa null, esperimento_id resta.
create table foto (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  data date not null,
  percorso text not null unique
    constraint foto_percorso_formato check (percorso = esperimento_id::text || '/' || id::text || '.jpg'),
  larghezza int check (larghezza > 0),
  altezza int check (altezza > 0),
  byte int check (byte >= 0),
  pianta_id uuid,
  nota_id uuid,
  archiviata boolean not null default false,
  creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(),
  unique (id, esperimento_id),
  foreign key (pianta_id, esperimento_id) references piante (id, esperimento_id),
  foreign key (nota_id, esperimento_id) references note (id, esperimento_id) on delete set null (nota_id)
);

create index foto_esperimento_data_idx on foto (esperimento_id, data);
create index foto_pianta_idx on foto (pianta_id);
create index foto_nota_idx on foto (nota_id);

-- ===== Guardie =====
create trigger guardia_esperimento_id before update of esperimento_id on note
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on note_piante
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on note_trattamenti
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on foto
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

-- ===== RLS =====
alter table note enable row level security;
alter table note_piante enable row level security;
alter table note_trattamenti enable row level security;
alter table foto enable row level security;

-- Note e foto: ogni membro legge, modifica ed elimina tutto; chi inserisce firma con se stesso.
-- L'upsert di PostgREST passa anche dalla policy di insert, ma la riga proposta prende creato_da
-- dal default (il payload non lo contiene), quindi un membro aggiorna anche le note altrui.
create policy note_select on note
  for select to authenticated using (public.is_membro(esperimento_id));
create policy note_insert on note
  for insert to authenticated
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy note_update on note
  for update to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy note_delete on note
  for delete to authenticated using (public.is_membro(esperimento_id));

create policy note_piante_membro on note_piante
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy note_trattamenti_membro on note_trattamenti
  for all to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));

create policy foto_select on foto
  for select to authenticated using (public.is_membro(esperimento_id));
create policy foto_insert on foto
  for insert to authenticated
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy foto_update on foto
  for update to authenticated
  using (public.is_membro(esperimento_id)) with check (public.is_membro(esperimento_id));
create policy foto_delete on foto
  for delete to authenticated using (public.is_membro(esperimento_id));

-- Privilegi: come in 20261028000002 niente per anon, e per authenticated niente truncate,
-- references e trigger. creato_da non si cambia: come in 20261028000005 si toglie l'update
-- sulla tabella e lo si concede sulle altre colonne, comprese id ed esperimento_id perche'
-- l'upsert di PostgREST mette nel SET tutte le colonne del payload. Una colonna aggiunta in
-- futuro va aggiunta anche qui.
revoke all on table note, note_piante, note_trattamenti, foto from anon;
revoke truncate, references, trigger on table note, note_piante, note_trattamenti, foto from authenticated;
revoke update on table note, foto from authenticated;
grant update (id, esperimento_id, data, testo, promemoria, fatto_il, creato_il, aggiornato_il)
  on table note to authenticated;
grant update (id, esperimento_id, data, percorso, larghezza, altezza, byte, pianta_id, nota_id, archiviata, creato_il)
  on table foto to authenticated;

-- ===== 4. Storage =====
-- Bucket privato: i file si leggono solo con URL firmati, che il servizio Storage concede a chi
-- passa la policy di select. Il limite di dimensione e il tipo li controlla il servizio Storage
-- (il client carica JPEG compressi di circa 350 KB; 5 MB lascia margine). Se il bucket c'e' gia'
-- (creato a mano) se ne impongono limite e tipo, non la visibilita'; se fosse pubblico la migration si ferma: ogni file sarebbe leggibile da
-- chiunque ne conosca il percorso, senza passare dalle policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', false, 5242880, array['image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'foto' and public is not false) then
    raise exception 'BUCKET_FOTO_PUBBLICO: il bucket foto esiste ed e'' pubblico; renderlo privato e ripetere';
  end if;
end
$$;

-- L'esperimento a cui appartiene un file del bucket foto, oppure null se il nome non e'
-- esattamente `<uuid>/<uuid>.jpg` (uuid in minuscolo, come li scrivono Postgres e nuovoId()).
-- Si controlla il nome intero e non solo la prima cartella: niente `..`, niente sottocartelle,
-- niente altre estensioni. Il case evita il cast di un segmento qualsiasi (che andrebbe in
-- errore): un nome estraneo non apre nulla e non rompe la lettura degli altri file.
create function esperimento_della_foto(p_nome text) returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_nome ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_nome, '/', 1)::uuid
  end
$$;

-- Le policy la valutano con i privilegi di chi chiama lo Storage (authenticated).
revoke execute on function esperimento_della_foto(text) from public, anon;
grant execute on function esperimento_della_foto(text) to authenticated;

-- Un membro legge (anche per gli URL firmati), carica ed elimina i file del proprio
-- esperimento. Nessun update: un file non si sposta ne' si sovrascrive (un nuovo tentativo di
-- caricamento usa upsert: false e tratta "esiste gia'" come riuscito). is_membro(null) e'
-- false. I nomi delle policy sono univoci nello schema storage, condiviso con altri bucket.
create policy fastlab_foto_select on storage.objects
  for select to authenticated
  using (bucket_id = 'foto' and public.is_membro(public.esperimento_della_foto(name)));
create policy fastlab_foto_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'foto' and public.is_membro(public.esperimento_della_foto(name)));
create policy fastlab_foto_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'foto' and public.is_membro(public.esperimento_della_foto(name)));


-- Le piante che non si possono eliminare: quelle con misure, note collegate o foto (la FK verso piante
-- darebbe 23503). Le Impostazioni la usano per offrire "Elimina"; piante_con_dati resta sulle sole
-- misure perche' decide anche il cambio di trattamento, che una nota o una foto non vincolano
-- (guardia_piante guarda solo le misure).
create function piante_non_eliminabili(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select m.pianta_id from public.misure m where m.esperimento_id = p_esperimento
  union
  select np.pianta_id from public.note_piante np where np.esperimento_id = p_esperimento
  union
  select f.pianta_id from public.foto f where f.esperimento_id = p_esperimento and f.pianta_id is not null
$$;

revoke execute on function piante_non_eliminabili(uuid) from public, anon;
grant execute on function piante_non_eliminabili(uuid) to authenticated;

-- ===== 20261101000013_foto_archiviata_il.sql =====
-- FastLab v3, Piano C (Task C7): la data dell'archiviazione di una foto.
--
-- Il segnaposto "Archiviata nel .zip del GG/MM" ha bisogno di sapere quando e' avvenuta. Si aggiunge
-- `archiviata_il` accanto al booleano (non lo si sostituisce: `archiviata` e' gia' letta e filtrata dal
-- client, e `spazioFoto` la usa come filtro) e un vincolo li tiene allineati: una foto e' archiviata se e
-- solo se ha una data di archiviazione. Cosi' le due colonne non possono dire cose diverse, e il client le
-- scrive sempre insieme. Mai riscrivere la 0012: questa e' una migration nuova.

alter table foto add column archiviata_il timestamptz;

-- Eventuali righe gia' archiviate (la 0012 non aveva modo di farlo se non a mano): una data c'e', altrimenti
-- il vincolo qui sotto fallirebbe. La data vera non si conosce, si usa il momento della migration.
update foto set archiviata_il = now() where archiviata and archiviata_il is null;

alter table foto add constraint foto_archiviata_coerente check (archiviata = (archiviata_il is not null));

-- Come in 0012 l'update e' concesso colonna per colonna (creato_da non si cambia): la nuova colonna va aggiunta.
grant update (archiviata_il) on table foto to authenticated;

-- ===== 20261102000014_export_salvati.sql =====
-- FastLab v3, Piano D (Task D1): gli export salvati, per esperimento e per utente.
--
-- 1. scelte_export_valide: la forma fissa (versione 1) delle scelte di un export, controllata in un
--    check. La gemella nel client e' leggiSceltaExport (src/domain/export/scelte.ts), con gli stessi
--    casi di prova (supabase/tests/export_salvati.test.sql).
-- 2. export_salvati: nome e scelte. Ogni utente vede e tocca solo i suoi, e solo negli esperimenti di
--    cui e' membro: un collega dello stesso esperimento non li vede (spec §7.5). "Tutto
--    l'esperimento" non e' una riga: e' una costante del client.
-- 3. L'indice di misure per leggere le misure di uno strumento a pagine keyset per id (Task D3).
--
-- Come le altre tabelle: id dal client (upsert per id), guardia_esperimento_id, RLS, niente per anon,
-- creato_da non aggiornabile e, all'insert, solo quello di chi scrive.

-- ===== 1. La forma delle scelte =====
-- Versione 1, un oggetto con esattamente queste chiavi (nessuna in piu', nessuna in meno):
--   {"v": 1,
--    "strumenti": {"modo": "tutti"} | {"modo": "scelti", "ids": [uuid, ...]},
--    "piante":    {"modo": "tutte"} | {"modo": "trattamenti", "ids": [uuid, ...]} | {"modo": "piante", "ids": [uuid, ...]},
--    "periodo":   {"modo": "tutto"} | {"modo": "settimane", "n": 4} | {"modo": "intervallo", "da": "AAAA-MM-GG", "a": "AAAA-MM-GG"},
--    "come":      {"valori": bool, "medie": bool, "grafici": bool, "diario": bool, "info": bool}}
-- Regole:
-- - v e' il numero 1;
-- - ids: array di stringhe uuid in minuscolo (come le scrivono Postgres e nuovoId()), senza doppioni,
--   da 1 a 200 elementi per gli strumenti e da 1 a 2000 per trattamenti e piante;
-- - n: numero intero da 1 a 104 (4,5 no, "4" come testo no);
-- - da e a: stringhe AAAA-MM-GG che sono date vere (2026-02-30 no, l'anno 0000 no), con da <= a;
-- - come: i cinque booleani veri (non "si'", non 1), almeno uno vero;
-- - tutto il testo al piu' 100 000 byte (il massimo legittimo, 2200 uuid, e' sotto i 90 000).
-- Gli ids non si confrontano con l'esperimento: una pianta eliminata dopo non deve rendere invalida
-- la riga. Li scarta il client in lettura (applicaAllaConfigurazione) e lo dice.
--
-- Non va mai in errore: per ogni forma sbagliata, e per null, restituisce false (il check allora
-- risponde 23514). Il blocco exception e' l'ultima rete (per esempio make_date di una data
-- impossibile); i controlli di tipo vengono prima, cosi' nessuna funzione riceve un valore del tipo
-- sbagliato. immutable: dipende solo dall'argomento (make_date e le regex non leggono impostazioni).
create function scelte_export_valide(s jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  uuid_re constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  data_re constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  x jsonb;
  ids jsonb;
  massimo int;
  n numeric;
  da date;
  a date;
begin
  if s is null or jsonb_typeof(s) is distinct from 'object' then
    return false;
  end if;
  -- Prima di tutto la dimensione: un oggetto enorme non si legge chiave per chiave.
  if octet_length(s::text) > 100000 then
    return false;
  end if;
  if array(select jsonb_object_keys(s) order by 1) <> array['come', 'periodo', 'piante', 'strumenti', 'v'] then
    return false;
  end if;

  -- Un if per controllo: in SQL un `or` non garantisce l'ordine, e il cast va fatto solo su un numero.
  if jsonb_typeof(s -> 'v') is distinct from 'number' then
    return false;
  end if;
  if (s ->> 'v')::numeric <> 1 then
    return false;
  end if;

  -- I tre oggetti con un modo: ciascuno ha esattamente le chiavi del suo modo.
  x := s -> 'strumenti';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutti' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' = 'scelti' then
    if array(select jsonb_object_keys(x) order by 1) <> array['ids', 'modo'] then return false; end if;
  else
    return false;
  end if;

  x := s -> 'piante';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutte' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' in ('trattamenti', 'piante') then
    if array(select jsonb_object_keys(x) order by 1) <> array['ids', 'modo'] then return false; end if;
  else
    return false;
  end if;

  x := s -> 'periodo';
  if jsonb_typeof(x) is distinct from 'object' or jsonb_typeof(x -> 'modo') is distinct from 'string' then
    return false;
  end if;
  if x ->> 'modo' = 'tutto' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo'] then return false; end if;
  elsif x ->> 'modo' = 'settimane' then
    if array(select jsonb_object_keys(x) order by 1) <> array['modo', 'n'] then return false; end if;
    if jsonb_typeof(x -> 'n') is distinct from 'number' then return false; end if;
    n := (x ->> 'n')::numeric;
    if n <> trunc(n) or n < 1 or n > 104 then return false; end if;
  elsif x ->> 'modo' = 'intervallo' then
    if array(select jsonb_object_keys(x) order by 1) <> array['a', 'da', 'modo'] then return false; end if;
    if jsonb_typeof(x -> 'da') is distinct from 'string' or jsonb_typeof(x -> 'a') is distinct from 'string'
       or not (x ->> 'da') ~ data_re or not (x ->> 'a') ~ data_re then
      return false;
    end if;
    -- make_date va in errore su una data impossibile (o sull'anno 0): lo raccoglie l'exception.
    da := make_date(substr(x ->> 'da', 1, 4)::int, substr(x ->> 'da', 6, 2)::int, substr(x ->> 'da', 9, 2)::int);
    a := make_date(substr(x ->> 'a', 1, 4)::int, substr(x ->> 'a', 6, 2)::int, substr(x ->> 'a', 9, 2)::int);
    if da > a then return false; end if;
  else
    return false;
  end if;

  -- Gli ids, dove il modo li chiede (le chiavi sono gia' state controllate sopra).
  foreach x in array array[s -> 'strumenti', s -> 'piante'] loop
    continue when not x ? 'ids';
    ids := x -> 'ids';
    massimo := case when x ->> 'modo' = 'scelti' then 200 else 2000 end;
    if jsonb_typeof(ids) is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(ids) < 1 or jsonb_array_length(ids) > massimo then
      return false;
    end if;
    if exists (select 1 from jsonb_array_elements(ids) e
                where jsonb_typeof(e) is distinct from 'string' or not (e #>> '{}') ~ uuid_re) then
      return false;
    end if;
    if (select count(distinct e) from jsonb_array_elements(ids) e) <> jsonb_array_length(ids) then
      return false;
    end if;
  end loop;

  x := s -> 'come';
  if jsonb_typeof(x) is distinct from 'object'
     or array(select jsonb_object_keys(x) order by 1) <> array['diario', 'grafici', 'info', 'medie', 'valori'] then
    return false;
  end if;
  if exists (select 1 from jsonb_each(x) c where jsonb_typeof(c.value) is distinct from 'boolean') then
    return false;
  end if;
  if not exists (select 1 from jsonb_each(x) c where c.value = 'true'::jsonb) then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end
$$;

-- authenticated serve: il check la valuta con i privilegi di chi scrive la riga.
revoke execute on function scelte_export_valide(jsonb) from public, anon;
grant execute on function scelte_export_valide(jsonb) to authenticated;

-- ===== 2. Export salvati =====
-- `id` e' generato dal client (upsert per id), quindi nessun default. creato_da va a cascata
-- sull'utente: gli export sono solo suoi, nessun altro li vede.
create table export_salvati (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  nome text not null check (btrim(nome) <> '' and char_length(nome) <= 80),
  scelte jsonb not null constraint export_salvati_scelte_valide check (public.scelte_export_valide(scelte)),
  creato_da uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

-- Il nome e' unico per esperimento e utente, senza badare a maiuscole e spazi ai bordi (salvando
-- con un nome gia' usato il client chiede se sostituire). Serve anche alla lista dell'utente.
create unique index export_salvati_nome_unico on export_salvati (esperimento_id, creato_da, lower(btrim(nome)));
-- Per l'eliminazione a cascata di un utente.
create index export_salvati_creato_da_idx on export_salvati (creato_da);

create trigger export_salvati_aggiornato_il
  before update on export_salvati
  for each row execute function public.imposta_aggiornato_il();

create trigger guardia_esperimento_id before update of esperimento_id on export_salvati
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

-- ===== RLS =====
-- Ogni operazione chiede entrambe le cose: membro dell'esperimento e autore della riga. Chi lascia
-- un esperimento non vede piu' i suoi export di li'. Un upsert con l'id di un export altrui fallisce
-- (42501) sulla policy di update.
alter table export_salvati enable row level security;

create policy export_salvati_select on export_salvati
  for select to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_insert on export_salvati
  for insert to authenticated
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_update on export_salvati
  for update to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()))
  with check (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));
create policy export_salvati_delete on export_salvati
  for delete to authenticated
  using (public.is_membro(esperimento_id) and creato_da = (select auth.uid()));

-- Privilegi come in 20261101000012: niente per anon, per authenticated niente truncate, references e
-- trigger. L'update e' concesso colonna per colonna: l'upsert di PostgREST mette nel SET le colonne del
-- payload (id, esperimento_id, nome, scelte), creato_da e creato_il restano fuori. Una colonna
-- aggiunta in futuro va aggiunta anche qui.
revoke all on table export_salvati from anon;
revoke truncate, references, trigger on table export_salvati from authenticated;
revoke update on table export_salvati from authenticated;
grant update (id, esperimento_id, nome, scelte, aggiornato_il) on table export_salvati to authenticated;

-- ===== 3. Misure di uno strumento a pagine =====
-- Dataset ed Esporta leggono `esperimento_id = X and strumento_id = Y and id > <ultimo> order by id`.
create index misure_esperimento_strumento_id_idx on misure (esperimento_id, strumento_id, id);

-- ===== 20261104000015_conteggi_spazio.sql =====
-- FastLab v3, Piano E (Task E4): conteggi degli strumenti e spazio del progetto.
--
-- 1. conteggi_strumenti: per ogni strumento misurato dell'esperimento quante misure, di quante piante,
--    la prima e l'ultima data, in una sola lettura. Prende il posto di strumentiConDati nel client, che
--    scaricava tutti gli strumento_id delle misure a pagine. Decide se "Elimina strumento" elimina o
--    spiega perche' non si puo'.
-- 2. parametri_con_dati: stessa firma e stesso risultato della 20261028000004, ma in un solo passaggio
--    sulle misure dell'esperimento invece di un exists per parametro.
-- 3. spazio_progetto: quanto occupano il database e le foto di tutto il progetto (solo totali) e, per
--    chi e' membro, i conteggi dell'esperimento.
--
-- Nessuna tabella nuova. Funzioni con search_path vuoto, niente per anon.

-- ===== 1. Conteggi degli strumenti =====
-- security invoker: la RLS delle misure fa il resto, chi non e' membro riceve zero righe. Solo gli
-- strumenti con almeno una misura; il group by usa l'indice misure (esperimento_id, strumento_id, id)
-- della 20261102000014.
create function conteggi_strumenti(p_esperimento uuid)
returns table (strumento_id uuid, misure bigint, piante bigint, prima date, ultima date)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.strumento_id, count(*), count(distinct m.pianta_id), min(m.data_rilievo), max(m.data_rilievo)
    from public.misure m
   where m.esperimento_id = p_esperimento
   group by m.strumento_id
$$;

revoke execute on function conteggi_strumenti(uuid) from public, anon;
grant execute on function conteggi_strumenti(uuid) to authenticated;

-- ===== 2. Parametri con dati, in un passaggio =====
-- Si raccolgono una volta le chiavi di tutte le misure dell'esperimento, poi si confrontano con i suoi
-- parametri. Le chiavi sono quelle che l'operatore `valori ? id` della versione di prima (e di
-- guardia_parametri, che resta com'e') riconosce: le chiavi di un oggetto, le stringhe in cima a un
-- array e una stringa da sola. L'app scrive sempre un oggetto; gli altri due casi ci sono perche' il
-- risultato non cambi su nessuna riga, e perche' jsonb_object_keys su un array andrebbe in errore.
-- `create or replace` tiene la firma e i privilegi (revoke da anon, grant ad authenticated).
create or replace function parametri_con_dati(p_esperimento uuid) returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id
    from public.parametri p
   where p.esperimento_id = p_esperimento
     and p.id::text in (
       select k.chiave
         from public.misure m
        cross join lateral (
          select o.chiave
            from jsonb_object_keys(case jsonb_typeof(m.valori) when 'object' then m.valori else '{}'::jsonb end) as o (chiave)
          union all
          select e.valore #>> '{}'
            from jsonb_array_elements(case jsonb_typeof(m.valori) when 'array' then m.valori else '[]'::jsonb end) as e (valore)
           where jsonb_typeof(e.valore) = 'string'
          union all
          select m.valori #>> '{}' where jsonb_typeof(m.valori) = 'string'
        ) as k (chiave)
        where m.esperimento_id = p_esperimento
     )
$$;

-- ===== 3. Spazio del progetto =====
-- Il piano gratuito di Supabase ha due limiti per l'intero progetto (500 MB di database, 1 GB di
-- Storage), condivisi da tutti gli esperimenti di tutti gli utenti: per sapere quanto manca servono
-- anche i numeri degli esperimenti di cui non si e' membri. Per questo security definer, e per questo
-- restituisce solo numeri: nessun nome di file, di esperimento o di utente.
--
-- Forma:
--   {"database_byte": 41234567, "foto_byte": 210000000,
--    "esperimento": {"misure": 3120, "note": 14, "foto": 85, "dati_byte": 1830000, "foto_byte": 29000000}}
-- - database_byte: pg_database_size del database (tabelle, indici e sistema di Supabase);
-- - foto_byte: i byte dei file del bucket foto, di tutti gli esperimenti (anche i file senza riga);
-- - esperimento: null se chi chiama non e' membro (anche per un id che non esiste). Altrimenti le
--   misure, le note, le foto con il file (le archiviate no: il file non c'e' piu'), i byte stimati
--   delle loro righe (pg_column_size) e i byte dei file nella cartella dell'esperimento.
-- Senza sessione (auth.uid() null) restituisce null.
--
-- Ripiego: su Supabase storage.objects e' del servizio Storage (supabase_storage_admin) e ha la RLS
-- attiva. Se il proprietario di questa funzione non avesse bypassrls, le policy (solo per
-- authenticated) gli nasconderebbero ogni riga e la somma sarebbe zero; senza il privilegio di select
-- la lettura andrebbe in errore. In entrambi i casi vale la somma da public.foto (byte delle foto non
-- archiviate), che e' tabella del proprietario della funzione: si prende il maggiore dei due numeri,
-- cosi' un totale che lo Storage non dice non diventa mai zero. Di norma lo Storage ha il numero
-- maggiore (conta anche i file senza riga). Il Task E13 (miniature) aggiunge qui byte_miniatura.
create function spazio_progetto(p_esperimento uuid) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_righe bigint;
  v_righe_esp bigint;
  v_storage bigint := 0;
  v_storage_esp bigint := 0;
  v_esperimento jsonb;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  select coalesce(sum(f.byte), 0),
         coalesce(sum(f.byte) filter (where f.esperimento_id = p_esperimento), 0)
    into v_righe, v_righe_esp
    from public.foto f
   where not f.archiviata;

  begin
    -- size e' un numero nei metadati che scrive il servizio Storage; un valore di altro tipo non conta.
    -- La cartella di un esperimento e' il suo id: un uuid non ha caratteri speciali per like.
    select coalesce(sum((o.metadata ->> 'size')::numeric), 0)::bigint,
           coalesce(sum((o.metadata ->> 'size')::numeric)
             filter (where o.name like p_esperimento::text || '/%'), 0)::bigint
      into v_storage, v_storage_esp
      from storage.objects o
     where o.bucket_id = 'foto'
       and jsonb_typeof(o.metadata -> 'size') = 'number';
  exception when insufficient_privilege then
    v_storage := 0;
    v_storage_esp := 0;
  end;

  if public.is_membro(p_esperimento) then
    v_esperimento := jsonb_build_object(
      'misure', (select count(*) from public.misure m where m.esperimento_id = p_esperimento),
      'note', (select count(*) from public.note n where n.esperimento_id = p_esperimento),
      'foto', (select count(*) from public.foto f where f.esperimento_id = p_esperimento and not f.archiviata),
      'dati_byte',
        (select coalesce(sum(pg_column_size(m.*)), 0) from public.misure m where m.esperimento_id = p_esperimento)
        + (select coalesce(sum(pg_column_size(n.*)), 0) from public.note n where n.esperimento_id = p_esperimento)
        + (select coalesce(sum(pg_column_size(f.*)), 0) from public.foto f where f.esperimento_id = p_esperimento),
      'foto_byte', greatest(v_storage_esp, v_righe_esp)
    );
  end if;

  return jsonb_build_object(
    'database_byte', pg_database_size(current_database()),
    'foto_byte', greatest(v_storage, v_righe),
    'esperimento', v_esperimento
  );
end
$$;

revoke execute on function spazio_progetto(uuid) from public, anon;
grant execute on function spazio_progetto(uuid) to authenticated;

-- ===== 20261104000016_ruoli_persone.sql =====
-- FastLab v3, Piano E (Task E9): ruoli dell'esperimento e Persone.
--
-- Tre ruoli per chi e' membro di un esperimento:
-- - proprietario: tutto. Configurazione, stato, archivio e "Libera lo spazio", eliminazione, Persone; corregge ed
--   elimina misure, note e foto di tutti. Possono essere piu' d'uno, mai zero.
-- - rilevatore: legge tutto; crea misure, note e foto; corregge ed elimina SOLO le proprie (creato_da = chi scrive).
--   E' la decisione dell'utente del 09/11 ("solo le proprie"), che prevale sul piano ("anche altrui").
-- - lettore: legge tutto (Dataset, Esporta, i propri export salvati, Duplica), non scrive nulla dell'esperimento.
--
-- 1. Ruoli: il vincolo nuovo e 'collaboratore' che diventa 'rilevatore'.
-- 2. ruolo_in, puo_scrivere, puo_configurare (is_membro resta com'e' e decide la lettura) e gli aiuti per le note e i
--    file delle foto.
-- 3. Tutte le policy riscritte, una per operazione: niente piu' `for all`. Le select restano is_membro; le scritture
--    passano da puo_configurare (configurazione ed esperimento) o da puo_scrivere piu' l'autore (misure, note, foto).
-- 4. Storage: caricare ed eliminare i file delle foto con le stesse regole delle righe.
-- 5. RPC di Persone: membri_di, aggiungi_membro, togli_membro.
-- 6. riepilogo_esperimenti con il ruolo.
-- 7. Catalogo: modificato_da e autori_catalogo.
--
-- Per i dati di oggi l'esito non cambia: in ogni esperimento c'e' solo il proprietario (aggiungi_proprietario), che
-- puo' tutto come prima. La migration e' compatibile all'indietro con il client che non conosce i ruoli.

-- ===== 1. Ruoli =====
-- Il vincolo vecchio non ammette 'rilevatore': prima si toglie, poi si converte, poi si mette il nuovo. Nessuna riga
-- e' 'collaboratore' (nessuna RPC lo scriveva), l'update e' per sicurezza.
alter table membri_esperimento drop constraint membri_esperimento_ruolo_check;
update membri_esperimento set ruolo = 'rilevatore' where ruolo = 'collaboratore';
alter table membri_esperimento
  add constraint membri_esperimento_ruolo_check check (ruolo in ('proprietario', 'rilevatore', 'lettore'));

-- ===== 2. Funzioni dei ruoli =====
-- Tutte security definer (come is_membro): le policy le chiamano per ogni riga e membri_esperimento ha a sua volta la
-- RLS; il risultato dipende solo dall'utente corrente e dagli argomenti. Con un esperimento null o senza sessione:
-- nessun ruolo, false.

-- Il ruolo di chi chiama nell'esperimento, o null se non ne e' membro.
create function ruolo_in(p uuid) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.ruolo from public.membri_esperimento m
   where m.esperimento_id = p
     and m.utente_id = (select auth.uid())
$$;

-- Proprietario o rilevatore: crea misure, note e foto.
create function puo_scrivere(p uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membri_esperimento m
     where m.esperimento_id = p
       and m.utente_id = (select auth.uid())
       and m.ruolo in ('proprietario', 'rilevatore')
  )
$$;

-- Solo il proprietario: configurazione, stato, eliminazione, Persone, e le correzioni ai dati degli altri.
create function puo_configurare(p uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membri_esperimento m
     where m.esperimento_id = p
       and m.utente_id = (select auth.uid())
       and m.ruolo = 'proprietario'
  )
$$;

-- Chi puo' modificare una nota, e quindi i suoi collegamenti: il proprietario, o un rilevatore se la nota e' sua.
-- Il collegamento porta anche lui esperimento_id, ma l'autore e' quello della nota.
create function puo_modificare_nota(p_nota uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.note n
     where n.id = p_nota
       and (public.puo_configurare(n.esperimento_id)
            or (public.puo_scrivere(n.esperimento_id) and n.creato_da = (select auth.uid())))
  )
$$;

-- I file delle foto. Il nome e' `<esperimento>/<id>.jpg`, gia' validato per intero da esperimento_della_foto: i primi
-- 36 caratteri dopo la barra sono l'id della foto (anche per la miniatura `<id>_m.jpg` del Task E13, quando
-- esperimento_della_foto la accettera'). Le righe si cercano per esperimento e id, cosi' una riga di un altro
-- esperimento non conta mai.
--
-- Caricare: chi scrive nell'esperimento, sul percorso di una foto nuova (nessuna riga, il caso normale: il file arriva
-- prima della riga) o di una foto propria (un nuovo tentativo). Il percorso di una foto di un altro (per esempio
-- archiviata, il cui file non c'e' piu') non si occupa: sarebbe cambiare la foto di un altro. Il proprietario sempre.
create function puo_caricare_file_foto(p_nome text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_esp uuid := public.esperimento_della_foto(p_nome);
begin
  if v_esp is null or (select auth.uid()) is null then
    return false;
  end if;
  if public.puo_configurare(v_esp) then
    return true;
  end if;
  if not public.puo_scrivere(v_esp) then
    return false;
  end if;
  return not exists (
    select 1 from public.foto f
     where f.esperimento_id = v_esp
       and f.id = substr(split_part(p_nome, '/', 2), 1, 36)::uuid
       and f.creato_da is distinct from (select auth.uid())
  );
end
$$;

-- Eliminare: il proprietario sempre (eliminazione di qualunque foto, "Libera lo spazio", eliminazione
-- dell'esperimento, che svuota la cartella: anche i file senza riga o senza autore). Un rilevatore solo un file che ha
-- caricato lui (`p_caricato_da`: owner_id, o owner, che il servizio Storage scrive con l'utente del JWT) e, se la foto
-- ha la riga, solo se anche la riga e' sua. Bastano i due casi dell'app: eliminaFoto toglie prima la riga e poi il
-- file (rimasto senza riga), caricaFoto toglie il file appena caricato se la riga viene rifiutata. Chiedere entrambe
-- le cose chiude un giro: un rilevatore che vede nella cartella il file senza riga di un altro (un caricamento la cui
-- riga non e' arrivata) potrebbe scrivere per primo una riga sua con quell'id, ma il file resta di chi l'ha caricato.
create function puo_eliminare_file_foto(p_nome text, p_caricato_da text) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_esp uuid := public.esperimento_della_foto(p_nome);
  v_autore uuid;
begin
  if v_esp is null or (select auth.uid()) is null then
    return false;
  end if;
  if public.puo_configurare(v_esp) then
    return true;
  end if;
  if not public.puo_scrivere(v_esp) or p_caricato_da is distinct from (select auth.uid())::text then
    return false;
  end if;
  select f.creato_da into v_autore
    from public.foto f
   where f.esperimento_id = v_esp
     and f.id = substr(split_part(p_nome, '/', 2), 1, 36)::uuid;
  return not found or v_autore = (select auth.uid());
end
$$;

revoke execute on function ruolo_in(uuid) from public, anon;
revoke execute on function puo_scrivere(uuid) from public, anon;
revoke execute on function puo_configurare(uuid) from public, anon;
revoke execute on function puo_modificare_nota(uuid) from public, anon;
revoke execute on function puo_caricare_file_foto(text) from public, anon;
revoke execute on function puo_eliminare_file_foto(text, text) from public, anon;
grant execute on function ruolo_in(uuid) to authenticated;
grant execute on function puo_scrivere(uuid) to authenticated;
grant execute on function puo_configurare(uuid) to authenticated;
grant execute on function puo_modificare_nota(uuid) to authenticated;
grant execute on function puo_caricare_file_foto(text) to authenticated;
grant execute on function puo_eliminare_file_foto(text, text) to authenticated;

-- ===== 3. Policy delle tabelle =====
-- Via le policy `for all` e quelle di scrittura per membro; restano esperimenti_select, esperimenti_insert
-- (creato_da = chi crea: chiunque crea un esperimento suo e ne diventa proprietario), note_select, foto_select,
-- membri_esperimento_select e quelle di export_salvati (membro e autore: personali anche per il lettore).
drop policy esperimenti_update on esperimenti;
drop policy esperimenti_delete on esperimenti;
drop policy fattori_membro on fattori;
drop policy livelli_membro on livelli;
drop policy trattamenti_membro on trattamenti;
drop policy trattamento_livelli_membro on trattamento_livelli;
drop policy piante_membro on piante;
drop policy parametri_membro on parametri;
drop policy strumenti_membro on strumenti;
drop policy strumento_parametri_membro on strumento_parametri;
drop policy misure_membro on misure;
drop policy note_insert on note;
drop policy note_update on note;
drop policy note_delete on note;
drop policy note_piante_membro on note_piante;
drop policy note_trattamenti_membro on note_trattamenti;
drop policy foto_insert on foto;
drop policy foto_update on foto;
drop policy foto_delete on foto;

-- --- Esperimento: rinominarlo, cambiarne lo stato, eliminarlo: solo il proprietario.
create policy esperimenti_update on esperimenti
  for update to authenticated
  using (public.puo_configurare(id)) with check (public.puo_configurare(id));
create policy esperimenti_delete on esperimenti
  for delete to authenticated
  using (public.puo_configurare(id));

-- --- Configurazione: ogni membro legge, solo il proprietario scrive. crea_esperimento (security invoker) passa da qui:
-- l'insert dell'esperimento fa di chi crea il proprietario (trigger aggiungi_proprietario), poi i figli passano.
create policy fattori_select on fattori
  for select to authenticated using (public.is_membro(esperimento_id));
create policy fattori_insert on fattori
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy fattori_update on fattori
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy fattori_delete on fattori
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy livelli_select on livelli
  for select to authenticated using (public.is_membro(esperimento_id));
create policy livelli_insert on livelli
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy livelli_update on livelli
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy livelli_delete on livelli
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy trattamenti_select on trattamenti
  for select to authenticated using (public.is_membro(esperimento_id));
create policy trattamenti_insert on trattamenti
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy trattamenti_update on trattamenti
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy trattamenti_delete on trattamenti
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy trattamento_livelli_select on trattamento_livelli
  for select to authenticated using (public.is_membro(esperimento_id));
create policy trattamento_livelli_insert on trattamento_livelli
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy trattamento_livelli_update on trattamento_livelli
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy trattamento_livelli_delete on trattamento_livelli
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy piante_select on piante
  for select to authenticated using (public.is_membro(esperimento_id));
create policy piante_insert on piante
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy piante_update on piante
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy piante_delete on piante
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy parametri_select on parametri
  for select to authenticated using (public.is_membro(esperimento_id));
create policy parametri_insert on parametri
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy parametri_update on parametri
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy parametri_delete on parametri
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy strumenti_select on strumenti
  for select to authenticated using (public.is_membro(esperimento_id));
create policy strumenti_insert on strumenti
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy strumenti_update on strumenti
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy strumenti_delete on strumenti
  for delete to authenticated using (public.puo_configurare(esperimento_id));

create policy strumento_parametri_select on strumento_parametri
  for select to authenticated using (public.is_membro(esperimento_id));
create policy strumento_parametri_insert on strumento_parametri
  for insert to authenticated with check (public.puo_configurare(esperimento_id));
create policy strumento_parametri_update on strumento_parametri
  for update to authenticated
  using (public.puo_configurare(esperimento_id)) with check (public.puo_configurare(esperimento_id));
create policy strumento_parametri_delete on strumento_parametri
  for delete to authenticated using (public.puo_configurare(esperimento_id));

-- --- Misure, note e foto: ogni membro legge; proprietario e rilevatore creano, firmando con se stessi (creato_da ha
-- per default auth.uid() e il payload del client non lo porta mai); il proprietario corregge ed elimina tutto, il
-- rilevatore solo le proprie. Un rilevatore diventato lettore, o tolto dall'esperimento, non tocca piu' nemmeno le
-- sue. L'upsert di PostgREST con l'id di una riga altrui passa dall'insert (la riga proposta e' firmata da chi scrive)
-- e poi dalla using dell'update sulla riga che c'e': se questa non passa, l'upsert fallisce con 42501, non tocca 0
-- righe in silenzio. La coda d'invio lo tratta come un rifiuto definitivo (src/lib/coda/invio.ts, eDefinitivo).
-- Rispetto a prima l'insert delle misure chiede anche creato_da = chi scrive, come gia' note e foto: con le
-- correzioni riservate all'autore, una misura firmata a nome di un altro non deve poter nascere.
create policy misure_select on misure
  for select to authenticated using (public.is_membro(esperimento_id));
create policy misure_insert on misure
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid()));
create policy misure_update on misure
  for update to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
  with check (public.puo_configurare(esperimento_id)
              or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));
create policy misure_delete on misure
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));

-- note_select resta (membro). Spuntare un promemoria e' una modifica della nota: anche quella solo all'autore o al
-- proprietario.
create policy note_insert on note
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid()));
create policy note_update on note
  for update to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
  with check (public.puo_configurare(esperimento_id)
              or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));
create policy note_delete on note
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));

-- Collegamenti: chi puo' modificare la nota (anche aggiungerne uno e' modificarla). Eliminare la nota li toglie a
-- cascata, senza passare da qui.
create policy note_piante_select on note_piante
  for select to authenticated using (public.is_membro(esperimento_id));
create policy note_piante_insert on note_piante
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));
create policy note_piante_update on note_piante
  for update to authenticated
  using (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id))
  with check (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));
create policy note_piante_delete on note_piante
  for delete to authenticated
  using (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));

create policy note_trattamenti_select on note_trattamenti
  for select to authenticated using (public.is_membro(esperimento_id));
create policy note_trattamenti_insert on note_trattamenti
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));
create policy note_trattamenti_update on note_trattamenti
  for update to authenticated
  using (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id))
  with check (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));
create policy note_trattamenti_delete on note_trattamenti
  for delete to authenticated
  using (public.puo_scrivere(esperimento_id) and public.puo_modificare_nota(nota_id));

-- foto_select resta (membro). Archiviare (archiviata e archiviata_il) e' un update: per il rilevatore solo sulle sue;
-- "Libera lo spazio" e' del proprietario.
-- Collegare una foto a una nota e' modificare la nota (come note_piante e note_trattamenti): solo verso una nota
-- che si puo' modificare, altrimenti un rilevatore attaccherebbe le sue foto alla nota di un altro.
create policy foto_insert on foto
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())
              and (nota_id is null or public.puo_modificare_nota(nota_id)));
create policy foto_update on foto
  for update to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
  with check ((public.puo_configurare(esperimento_id)
               or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
              and (nota_id is null or public.puo_modificare_nota(nota_id)));
create policy foto_delete on foto
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));

-- ===== 4. Storage =====
-- fastlab_foto_select resta (membro: legge e ottiene gli URL firmati). Nessuna policy di update, come prima.
-- Su Supabase storage.objects e' del servizio Storage: create policy e drop policy chiedono gli stessi privilegi (li
-- ha chi ha applicato la 20261101000012). I nomi restano quelli di prima.
drop policy fastlab_foto_insert on storage.objects;
drop policy fastlab_foto_delete on storage.objects;

create policy fastlab_foto_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'foto' and public.puo_caricare_file_foto(name));
create policy fastlab_foto_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'foto' and public.puo_eliminare_file_foto(name, coalesce(owner_id, owner::text)));

-- ===== 5. Persone =====
-- Chi c'e' nell'esperimento, per un membro (altrimenti nessuna riga): proprietari, rilevatori, lettori, poi per email
-- (con l'ordinamento "C", uguale su ogni server). L'email viene dai profili; un membro senza profilo resta in elenco
-- con l'email vuota, mai nascosto.
create function membri_di(p uuid) returns table (utente_id uuid, email text, ruolo text, sei_tu boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.utente_id, pr.email, m.ruolo, m.utente_id = (select auth.uid())
    from public.membri_esperimento m
    left join public.profili pr on pr.id = m.utente_id
   where m.esperimento_id = p
     and public.is_membro(p)
   order by case m.ruolo when 'proprietario' then 0 when 'rilevatore' then 1 else 2 end,
            lower(pr.email) collate "C", m.utente_id
$$;

-- Aggiunge un collega gia' registrato, o ne cambia il ruolo se e' gia' membro. Solo il proprietario
-- (SOLO_PROPRIETARIO, 42501, anche per un esperimento che non c'e'); il ruolo e' uno dei tre (RUOLO_NON_VALIDO);
-- l'email si cerca nei profili senza badare a spazi e maiuscole (UTENTE_NON_TROVATO: la registrazione resta su
-- invito dell'amministratore). Mai un esperimento senza proprietari (ULTIMO_PROPRIETARIO): il proprietario che passa
-- a rilevatore o lettore deve lasciarne un altro.
-- Le modifiche ai membri di un esperimento passano una alla volta: si blocca la riga dell'esperimento (no key update,
-- che non ferma gli insert delle misure) e solo dopo si controlla di nuovo chi chiama e quanti proprietari restano.
-- Cosi' due proprietari che si tolgono il ruolo a vicenda nello stesso istante non lasciano l'esperimento senza.
create function aggiungi_membro(p uuid, p_email text, p_ruolo text) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_utente uuid;
  v_trovati int;
begin
  if not public.puo_configurare(p) then
    raise exception 'SOLO_PROPRIETARIO' using errcode = '42501';
  end if;
  if p_ruolo is null or p_ruolo not in ('proprietario', 'rilevatore', 'lettore') then
    raise exception 'RUOLO_NON_VALIDO';
  end if;
  -- auth.users ha l'email unica: piu' di un profilo per la stessa email non dovrebbe esistere, e se c'e' non si sceglie.
  select count(*), min(pr.id::text)::uuid into v_trovati, v_utente
    from public.profili pr
   where lower(btrim(pr.email)) = lower(btrim(p_email));
  if v_trovati <> 1 then
    raise exception 'UTENTE_NON_TROVATO';
  end if;

  perform 1 from public.esperimenti e where e.id = p for no key update;
  if not public.puo_configurare(p) then
    raise exception 'SOLO_PROPRIETARIO' using errcode = '42501';
  end if;

  insert into public.membri_esperimento (esperimento_id, utente_id, ruolo)
  values (p, v_utente, p_ruolo)
  on conflict (esperimento_id, utente_id) do update set ruolo = excluded.ruolo;

  if not exists (
    select 1 from public.membri_esperimento m where m.esperimento_id = p and m.ruolo = 'proprietario'
  ) then
    raise exception 'ULTIMO_PROPRIETARIO';
  end if;
end
$$;

-- Toglie un membro: il proprietario chiunque, ogni membro se stesso ("Lascia l'esperimento"). Mai l'ultimo
-- proprietario (ULTIMO_PROPRIETARIO). Le misure, le note e le foto di chi esce restano, con il suo creato_da; i suoi
-- export salvati restano ma non li vede piu' nessuno (finche' non rientra). Togliere chi non e' membro non fa nulla.
create function togli_membro(p uuid, p_utente uuid) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_io uuid := (select auth.uid());
  v_tolti int;
begin
  if v_io is null then
    raise exception 'SOLO_PROPRIETARIO' using errcode = '42501';
  end if;
  if p_utente is distinct from v_io and not public.puo_configurare(p) then
    raise exception 'SOLO_PROPRIETARIO' using errcode = '42501';
  end if;
  -- Chi non e' membro e "lascia": niente da fare, e nessun blocco su un esperimento non suo.
  if p_utente = v_io and not public.is_membro(p) then
    return;
  end if;

  perform 1 from public.esperimenti e where e.id = p for no key update;
  if p_utente is distinct from v_io and not public.puo_configurare(p) then
    raise exception 'SOLO_PROPRIETARIO' using errcode = '42501';
  end if;

  delete from public.membri_esperimento m where m.esperimento_id = p and m.utente_id = p_utente;
  get diagnostics v_tolti = row_count;

  if v_tolti > 0 and not exists (
    select 1 from public.membri_esperimento m where m.esperimento_id = p and m.ruolo = 'proprietario'
  ) then
    raise exception 'ULTIMO_PROPRIETARIO';
  end if;
end
$$;

revoke execute on function membri_di(uuid) from public, anon;
revoke execute on function aggiungi_membro(uuid, text, text) from public, anon;
revoke execute on function togli_membro(uuid, uuid) from public, anon;
grant execute on function membri_di(uuid) to authenticated;
grant execute on function aggiungi_membro(uuid, text, text) to authenticated;
grant execute on function togli_membro(uuid, uuid) to authenticated;

-- ===== 6. riepilogo_esperimenti con il ruolo =====
-- Il tipo del risultato cambia: drop e create. Le colonne di prima restano nello stesso ordine e il ruolo va in
-- fondo, cosi' il client che non lo conosce lo ignora. Come prima security invoker: la RLS sceglie gli esperimenti.
drop function riepilogo_esperimenti();

create function riepilogo_esperimenti()
returns table (id uuid, nome text, stato text, data_inizio date, n_piante int, n_trattamenti int,
               ultima_data date, piante_ultima_data int, ruolo text)
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
           where m.esperimento_id = e.id and m.data_rilievo = u.ultima_data),
         public.ruolo_in(e.id)
    from public.esperimenti e
   cross join lateral (
     select max(m.data_rilievo) as ultima_data from public.misure m where m.esperimento_id = e.id
   ) u
   order by e.creato_il desc, e.id
$$;

revoke execute on function riepilogo_esperimenti() from public, anon;
grant execute on function riepilogo_esperimenti() to authenticated;

-- ===== 7. Catalogo: chi ha modificato per ultimo =====
-- modificato_da lo scrive solo il trigger, con l'utente della sessione (null da Dashboard o service role): non e' nel
-- grant di update per colonne della 20261029000009, quindi un update a mano fallisce con 42501, e all'insert un valore
-- nel payload viene sostituito. Le voci gia' esistenti restano senza (non si sa chi le ha modificate).
-- Il trigger scatta solo sulle colonne del contenuto della voce (l'upsert del client le mette sempre nel SET): non
-- sull'`on delete set null` di creato_da o modificato_da quando si elimina un utente, che altrimenti cancellerebbe chi
-- ha modificato per ultimo (o metterebbe l'utente che si sta eliminando). Una colonna del contenuto aggiunta in futuro
-- va aggiunta anche qui.
alter table catalogo_strumenti
  add column modificato_da uuid references auth.users (id) on delete set null;

create function imposta_modificato_da() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.modificato_da := (select auth.uid());
  return new;
end
$$;

revoke execute on function imposta_modificato_da() from public, anon, authenticated;

create trigger catalogo_strumenti_modificato_da
  before insert or update of nome, icona, descrizione, parametri, archiviato on catalogo_strumenti
  for each row execute function public.imposta_modificato_da();

-- Gli utenti che hanno creato o modificato per ultimo una voce del catalogo (archiviate comprese), con l'email. Il
-- catalogo e' di tutti gli utenti registrati, e cosi' chi lo cura (Decisione 17 del Piano E).
create function autori_catalogo() returns table (utente_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.email
    from public.profili pr
   where (select auth.uid()) is not null
     and exists (
       select 1 from public.catalogo_strumenti c
        where c.creato_da = pr.id or c.modificato_da = pr.id
     )
   order by lower(pr.email) collate "C", pr.id
$$;

revoke execute on function autori_catalogo() from public, anon;
grant execute on function autori_catalogo() to authenticated;

commit;
