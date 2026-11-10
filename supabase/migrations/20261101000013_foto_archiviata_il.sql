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
