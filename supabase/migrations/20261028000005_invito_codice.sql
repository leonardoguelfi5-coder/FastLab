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
