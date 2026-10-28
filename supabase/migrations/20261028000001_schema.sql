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
