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
create policy foto_insert on foto
  for insert to authenticated
  with check (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid()));
create policy foto_update on foto
  for update to authenticated
  using (public.puo_configurare(esperimento_id)
         or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())))
  with check (public.puo_configurare(esperimento_id)
              or (public.puo_scrivere(esperimento_id) and creato_da = (select auth.uid())));
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
