# FastLab v3 sul telefono: i passi da fare a mano

Questi passi servono una volta sola e richiedono i tuoi account, per questo non li può fare Claude. Tutto il resto (codice, schema del database, icone e installazione sul telefono) è già pronto sul ramo `claude/app-review-improvements-c26294`. La v2 su `main` non viene toccata.

Tempo: circa 15 minuti.

## 1. Database (Supabase)

1. Su https://supabase.com/dashboard crea un **progetto nuovo** (per esempio `fastlab-v3`, regione Europa, piano Free). **Non usare il progetto della v2.** Annota la password del database che ti chiede.
2. Nel progetto apri **SQL Editor**, incolla tutto il contenuto del file [`supabase/online/schema-completo.sql`](../supabase/online/schema-completo.sql) e premi **Run**. Deve finire con "Success".
3. **Authentication → Sign In / Providers → Email**: spegni **Confirm email** e salva.
4. **Project Settings → API**: copia **Project URL** e la chiave pubblica (**anon** o **publishable**). Non copiare mai la `service_role` né una chiave segreta.

## 2. Sito (Vercel)

1. Su https://vercel.com: **Add New → Project** e importa il repository FastLab. Crea un progetto **nuovo**, per esempio `fastlab-v3`, separato da quello della v2.
2. Prima di **Deploy**, apri **Environment Variables** e aggiungi:
   - `VITE_SUPABASE_URL` = il Project URL del punto 1.4;
   - `VITE_SUPABASE_ANON_KEY` = la chiave pubblica del punto 1.4.
3. Premi **Deploy**. Questo primo deploy usa `main`, cioè la v2, e non funzionerà con il database nuovo: è normale.
4. **Settings → Git → Production Branch** (nelle versioni più recenti di Vercel: **Settings → Environments → Production → Branch Tracking**): scrivi `claude/app-review-improvements-c26294` e salva. Poi in **Deployments** premi **Redeploy** sull'ultimo deploy di quel ramo. Se non c'è ancora, basta un push sul ramo (lo fa Claude) o **Create Deployment** con quel ramo.
5. Copia l'indirizzo del sito (per esempio `https://fastlab-v3.vercel.app`).
6. Torna su Supabase, **Authentication → URL Configuration**: in **Site URL** metti quell'indirizzo e salva.

## 3. Il tuo account (primo amministratore)

1. Su Supabase, **SQL Editor**, esegui con la tua email scritta tutta in minuscolo:

   ```sql
   insert into public.inviti(email) values ('tua.email@esempio.it') returning codice;
   ```

   Copia il codice che compare (8 caratteri).
2. Sul telefono apri `https://<indirizzo del sito>/registrati` e registrati con la stessa email, una password di almeno 8 caratteri e il codice.
3. Torna nel SQL Editor ed esegui:

   ```sql
   update public.profili set admin = true where email = 'tua.email@esempio.it';
   ```

   Così nel menu compare **Inviti**, da cui inviti i colleghi.

## 4. Installarla sul telefono

- **iPhone (Safari):** apri il sito, tocca **Condividi** e poi **Aggiungi alla schermata Home**.
- **Android (Chrome):** apri il sito, tocca il menu ⋮ e poi **Installa app** (o **Aggiungi a schermata Home**).

Comparirà l'icona FastLab e l'app si aprirà a schermo intero, senza la barra del browser. I dati restano sempre online: serve la connessione.

## Aggiornamenti

- Ogni push sul ramo aggiorna il sito da solo: sul telefono basta riaprire l'app.
- Quando un aggiornamento cambia il database, Claude ti darà un file SQL da eseguire nello stesso modo del punto 1.2. `schema-completo.sql` va usato solo su un progetto vuoto.
