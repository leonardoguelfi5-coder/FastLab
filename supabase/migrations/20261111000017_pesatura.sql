-- FastLab, Pesatura: analisi, sessioni, campioni e pesi, con le loro sicurezze.
--
-- 1. analisi_pesatura: un'analisi dell'utente (titolo, tipo, unita' di peso, impostazioni), riusabile in tutti i
--    suoi esperimenti. Non ha esperimento_id. Il tipo non cambia dopo la prima sessione (guardia_tipo_analisi) e
--    un'analisi con sessioni non si elimina (23503): si archivia.
-- 2. sessioni_pesatura: una pesata dell'esperimento. Copia titolo, tipo, unita' e impostazioni dell'analisi quando
--    nasce (lo fa il client), cosi' rinominare o modificare l'analisi dopo non cambia le sessioni gia' fatte.
-- 3. campioni_pesatura: cosa si pesa nella sessione, in ordine. Una pianta dell'esperimento oppure un nome libero
--    (mai entrambi, mai nessuno dei due); substrato per i vasi.
-- 4. pesi: un peso di un campione, con replica, tipo di peso, lettura del sensore e autore. Un solo peso per
--    campione, replica e tipo, tranne i punti di asciugatura dei vasi, che sono tanti.
-- 5. piante_non_eliminabili conta anche le piante usate nei campioni.
--
-- Permessi (Piano E, src/domain/ruoli.ts): ogni membro legge; proprietario e rilevatore creano sessioni e pesi;
-- il rilevatore corregge ed elimina solo i pesi propri; impostazioni, campioni e chiusura di una sessione li
-- gestiscono chi l'ha creata e il proprietario (puo_gestire_sessione); il lettore legge ed esporta. Le analisi
-- le modifica solo chi le ha create; le vede anche chi e' membro di un esperimento con una sessione che le usa.
--
-- Come le altre tabelle: `id` generato dal client (nessun default), FK composte (id, esperimento_id),
-- guardia_esperimento_id, aggiornato_il con imposta_aggiornato_il, RLS solo per authenticated con una policy per
-- operazione, niente per anon, creato_da non aggiornabile (e, all'insert, solo quello di chi scrive).
-- Solo online: nessuna coda locale scrive qui.

-- ===== 1. Analisi =====
create table analisi_pesatura (
  id uuid primary key,
  creato_da uuid not null default auth.uid(),
  titolo text not null check (btrim(titolo) <> ''),
  tipo text not null check (tipo in ('aliquota', 'rwc', 'sostanza_secca', 'vasi')),
  unita text not null default 'g' check (unita in ('g', 'mg')),
  impostazioni jsonb not null default '{}' check (jsonb_typeof(impostazioni) = 'object'),
  archiviata boolean not null default false,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create index analisi_pesatura_creato_da_idx on analisi_pesatura (creato_da);

create trigger analisi_pesatura_aggiornato_il
  before update on analisi_pesatura
  for each row execute function public.imposta_aggiornato_il();

-- ===== 2. Sessioni =====
-- Verso l'analisi il default `no action`: un'analisi con sessioni non si elimina (23503).
create table sessioni_pesatura (
  id uuid primary key,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  analisi_id uuid not null references analisi_pesatura (id),
  titolo text not null check (btrim(titolo) <> ''),
  tipo text not null check (tipo in ('aliquota', 'rwc', 'sostanza_secca', 'vasi')),
  unita text not null default 'g' check (unita in ('g', 'mg')),
  impostazioni jsonb not null default '{}' check (jsonb_typeof(impostazioni) = 'object'),
  data date not null,
  nota text,
  conclusa boolean not null default false,
  creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (id, esperimento_id)
);

create index sessioni_pesatura_esperimento_data_idx on sessioni_pesatura (esperimento_id, data);
create index sessioni_pesatura_analisi_idx on sessioni_pesatura (analisi_id);

create trigger sessioni_pesatura_aggiornato_il
  before update on sessioni_pesatura
  for each row execute function public.imposta_aggiornato_il();

-- ===== 3. Campioni =====
-- Verso la pianta il default `no action`, come per misure e note: la pianta usata non si elimina, ma
-- l'eliminazione a cascata dell'esperimento resta possibile perche' il controllo avviene a fine statement.
-- esperimento_id va a cascata anche direttamente sull'esperimento (come note_piante), non solo attraverso la
-- sessione: eliminando l'esperimento i campioni spariscono al primo livello della cascata, prima del controllo
-- `no action` sulle piante. Passando solo dalla sessione (secondo livello) quel controllo li troverebbe ancora e
-- l'esperimento non si eliminerebbe (23503).
create table campioni_pesatura (
  id uuid primary key,
  sessione_id uuid not null,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  pianta_id uuid,
  nome text check (nome is null or btrim(nome) <> ''),
  substrato text,
  ordine int not null,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  unique (id, sessione_id),
  foreign key (sessione_id, esperimento_id) references sessioni_pesatura (id, esperimento_id) on delete cascade,
  foreign key (pianta_id, esperimento_id) references piante (id, esperimento_id),
  check ((pianta_id is null) <> (nome is null))
);

create index campioni_pesatura_sessione_idx on campioni_pesatura (sessione_id, ordine);
create index campioni_pesatura_sessione_esperimento_idx on campioni_pesatura (sessione_id, esperimento_id);
create index campioni_pesatura_pianta_idx on campioni_pesatura (pianta_id);

create trigger campioni_pesatura_aggiornato_il
  before update on campioni_pesatura
  for each row execute function public.imposta_aggiornato_il();

-- ===== 4. Pesi =====
-- valore nell'unita' della sessione; lettura e' quella del sensore (vasi), facoltativa. esperimento_id va a
-- cascata anche direttamente sull'esperimento, come per i campioni.
create table pesi (
  id uuid primary key,
  campione_id uuid not null,
  sessione_id uuid not null,
  esperimento_id uuid not null references esperimenti (id) on delete cascade,
  replica int not null default 1 check (replica >= 1),
  tipo text not null check (tipo in ('aliquota', 'fresco', 'turgido', 'secco', 'capacita_campo', 'asciugatura')),
  valore numeric not null check (valore > 0),
  lettura numeric,
  misurato_il timestamptz not null default now(),
  creato_da uuid not null default auth.uid(),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now(),
  foreign key (campione_id, sessione_id) references campioni_pesatura (id, sessione_id) on delete cascade,
  foreign key (sessione_id, esperimento_id) references sessioni_pesatura (id, esperimento_id) on delete cascade
);

-- Un solo peso per campione, replica e tipo; i punti di asciugatura di un vaso sono tanti.
create unique index pesi_unico on pesi (campione_id, replica, tipo) where tipo <> 'asciugatura';
create index pesi_campione_sessione_idx on pesi (campione_id, sessione_id);
create index pesi_sessione_esperimento_idx on pesi (sessione_id, esperimento_id);

create trigger pesi_aggiornato_il
  before update on pesi
  for each row execute function public.imposta_aggiornato_il();

-- ===== Guardie =====
create trigger guardia_esperimento_id before update of esperimento_id on sessioni_pesatura
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on campioni_pesatura
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();
create trigger guardia_esperimento_id before update of esperimento_id on pesi
  for each row when (new.esperimento_id is distinct from old.esperimento_id)
  execute function guardia_esperimento_id();

-- Il tipo decide come si leggono i pesi delle sessioni: dopo la prima sessione non cambia. Security definer perche'
-- deve vedere tutte le sessioni dell'analisi, anche quelle di esperimenti di cui chi la modifica non e' (piu')
-- membro, che la RLS gli nasconderebbe.
create function guardia_tipo_analisi() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.sessioni_pesatura s where s.analisi_id = new.id) then
    raise exception 'il tipo di un''analisi con sessioni non si cambia' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

revoke execute on function guardia_tipo_analisi() from public, anon, authenticated;

create trigger guardia_tipo_analisi
  before update of tipo on analisi_pesatura
  for each row when (new.tipo is distinct from old.tipo)
  execute function public.guardia_tipo_analisi();

-- ===== Permessi =====
-- Chi gestisce una sessione (impostazioni, campioni, chiusura): il proprietario dell'esperimento, o chi puo'
-- scrivere se la sessione e' sua. Security definer come puo_modificare_nota: le policy la chiamano per ogni riga.
create function puo_gestire_sessione(p_sessione uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessioni_pesatura s
     where s.id = p_sessione
       and (public.puo_configurare(s.esperimento_id)
            or (public.puo_scrivere(s.esperimento_id) and s.creato_da = (select auth.uid())))
  )
$$;

revoke execute on function puo_gestire_sessione(uuid) from public, anon;
grant execute on function puo_gestire_sessione(uuid) to authenticated;

-- ===== RLS =====
alter table analisi_pesatura enable row level security;
alter table sessioni_pesatura enable row level security;
alter table campioni_pesatura enable row level security;
alter table pesi enable row level security;

-- --- Analisi: di chi le crea. Le vede anche chi e' membro di un esperimento con una sessione che la usa (per
-- leggere l'archivio e per avviare una sessione nuova con la stessa analisi). Solo l'autore le modifica.
create policy analisi_pesatura_select on analisi_pesatura
  for select to authenticated
  using (creato_da = (select auth.uid())
         or exists (select 1 from public.sessioni_pesatura s
                     where s.analisi_id = analisi_pesatura.id and public.is_membro(s.esperimento_id)));
create policy analisi_pesatura_insert on analisi_pesatura
  for insert to authenticated
  with check (creato_da = (select auth.uid()));
create policy analisi_pesatura_update on analisi_pesatura
  for update to authenticated
  using (creato_da = (select auth.uid())) with check (creato_da = (select auth.uid()));
create policy analisi_pesatura_delete on analisi_pesatura
  for delete to authenticated
  using (creato_da = (select auth.uid()));

-- --- Sessioni: ogni membro legge; proprietario e rilevatore creano, firmando con se stessi e solo con un'analisi
-- che vedono (la sottoquery passa dalla RLS di analisi_pesatura). Le gestisce puo_gestire_sessione. Anche cambiare
-- analisi_id resta verso un'analisi visibile: altrimenti una sessione renderebbe visibile l'analisi di un altro.
create policy sessioni_pesatura_select on sessioni_pesatura
  for select to authenticated using (public.is_membro(esperimento_id));
create policy sessioni_pesatura_insert on sessioni_pesatura
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())
              and exists (select 1 from public.analisi_pesatura a where a.id = analisi_id));
create policy sessioni_pesatura_update on sessioni_pesatura
  for update to authenticated
  using (public.puo_gestire_sessione(id))
  with check (public.puo_gestire_sessione(id)
              and exists (select 1 from public.analisi_pesatura a where a.id = analisi_id));
create policy sessioni_pesatura_delete on sessioni_pesatura
  for delete to authenticated using (public.puo_gestire_sessione(id));

-- --- Campioni: ogni membro legge; li gestisce chi gestisce la sessione.
create policy campioni_pesatura_select on campioni_pesatura
  for select to authenticated using (public.is_membro(esperimento_id));
create policy campioni_pesatura_insert on campioni_pesatura
  for insert to authenticated with check (public.puo_gestire_sessione(sessione_id));
create policy campioni_pesatura_update on campioni_pesatura
  for update to authenticated
  using (public.puo_gestire_sessione(sessione_id)) with check (public.puo_gestire_sessione(sessione_id));
create policy campioni_pesatura_delete on campioni_pesatura
  for delete to authenticated using (public.puo_gestire_sessione(sessione_id));

-- --- Pesi: come le misure (20261104000016). Proprietario e rilevatore aggiungono pesi a qualsiasi sessione
-- dell'esperimento (una sessione RWC si riempie in piu' giorni, anche da persone diverse), firmando con se stessi;
-- il proprietario corregge ed elimina tutto, il rilevatore solo i propri.
create policy pesi_select on pesi
  for select to authenticated using (public.is_membro(esperimento_id));
create policy pesi_insert on pesi
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid()));
create policy pesi_update on pesi
  for update to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
  with check (public.puo_configurare(esperimento_id)
              or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));
create policy pesi_delete on pesi
  for delete to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));

-- Privilegi: come in 20261101000012 niente per anon, e per authenticated niente truncate, references e trigger.
-- creato_da non si cambia: si toglie l'update sulla tabella e lo si concede sulle altre colonne, comprese id ed
-- esperimento_id perche' l'upsert di PostgREST mette nel SET tutte le colonne del payload. campioni_pesatura non
-- ha creato_da, ma segue lo stesso schema, cosi' ogni tabella della Pesatura si legge allo stesso modo. Una colonna
-- aggiunta in futuro va aggiunta anche qui.
revoke all on table analisi_pesatura, sessioni_pesatura, campioni_pesatura, pesi from anon;
revoke truncate, references, trigger on table analisi_pesatura, sessioni_pesatura, campioni_pesatura, pesi
  from authenticated;
revoke update on table analisi_pesatura, sessioni_pesatura, campioni_pesatura, pesi from authenticated;
grant update (id, titolo, tipo, unita, impostazioni, archiviata, creato_il, aggiornato_il)
  on table analisi_pesatura to authenticated;
grant update (id, esperimento_id, analisi_id, titolo, tipo, unita, impostazioni, data, nota, conclusa,
              creato_il, aggiornato_il)
  on table sessioni_pesatura to authenticated;
grant update (id, sessione_id, esperimento_id, pianta_id, nome, substrato, ordine, creato_il, aggiornato_il)
  on table campioni_pesatura to authenticated;
grant update (id, campione_id, sessione_id, esperimento_id, replica, tipo, valore, lettura, misurato_il,
              creato_il, aggiornato_il)
  on table pesi to authenticated;

-- ===== 5. piante_non_eliminabili =====
-- Le piante che non si possono eliminare: quelle con misure, note collegate, foto o campioni della Pesatura (la FK
-- verso piante darebbe 23503). Stessa firma della 20261101000012, quindi restano anche i privilegi; li si ripete
-- per chiarezza. piante_con_dati resta sulle sole misure: un campione non vincola il cambio di trattamento.
create or replace function piante_non_eliminabili(p_esperimento uuid) returns setof uuid
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
  union
  select c.pianta_id from public.campioni_pesatura c where c.esperimento_id = p_esperimento and c.pianta_id is not null
$$;

revoke execute on function piante_non_eliminabili(uuid) from public, anon;
grant execute on function piante_non_eliminabili(uuid) to authenticated;
