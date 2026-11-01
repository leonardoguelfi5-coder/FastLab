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
-- non si tocca, ma se fosse pubblico la migration si ferma: ogni file sarebbe leggibile da
-- chiunque ne conosca il percorso, senza passare dalle policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto', 'foto', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

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
