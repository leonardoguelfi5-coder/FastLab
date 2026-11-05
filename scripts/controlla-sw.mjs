// Controllo del service worker (Piano E, Task E7), da lanciare dopo `npm run build`.
//
// Uso: `node scripts/controlla-sw.mjs` (o `npm run test:sw`), facoltativo il percorso della build (di norma `dist`).
//
// Verifica che:
// - ogni file di `dist/assets` (js, css, woff2) e `index.html` siano nel precache di `dist/sw.js`: un'app aperta resta
//   coerente con la sua versione dopo un deploy (anche il chunk di exceljs) e si apre senza rete;
// - in `sw.js` non ci sia nessuna regola a runtime (nessuna strategia di cache, nessun URL di Supabase): il service
//   worker non tocca mai database, autenticazione e Storage; l'unica rotta è il ripiego di navigazione su index.html;
// - la versione nuova non si attivi da sola: `skipWaiting` solo su richiesta (messaggio SKIP_WAITING), niente
//   `clientsClaim`;
// - `vercel.json` serva `sw.js` senza cache e risponda 404 (non index.html) per un file mancante sotto `/assets/`.
// Esce con 1 se qualcosa non va.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const radice = path.resolve(import.meta.dirname, '..')
const dist = path.resolve(radice, process.argv[2] ?? 'dist')
const errori = []
const errore = testo => errori.push(testo)

const fileSw = path.join(dist, 'sw.js')
if (!existsSync(fileSw)) {
  console.error(`Manca ${path.relative(radice, fileSw)}: prima \`npm run build\`.`)
  process.exit(1)
}
const sw = readFileSync(fileSw, 'utf8')

// Il precache: le voci `{url:"...",revision:...}` che Workbox scrive in sw.js.
const precache = new Set([...sw.matchAll(/url:\s*"([^"]+)"/g)].map(m => m[1]))
if (precache.size === 0) errore('sw.js non ha un precache (nessuna voce `url:`).')

const cartellaAssets = path.join(dist, 'assets')
const assets = existsSync(cartellaAssets) ? readdirSync(cartellaAssets).filter(f => /\.(js|css|woff2)$/.test(f)) : []
if (assets.length === 0) errore('dist/assets non ha file js, css o woff2.')
const mancanti = assets.filter(f => !precache.has(`assets/${f}`))
for (const f of mancanti) errore(`assets/${f} non è nel precache del service worker.`)
if (!precache.has('index.html')) errore('index.html non è nel precache del service worker.')

// Nessuna regola a runtime: una sola rotta, il ripiego di navigazione su index.html.
const rotte = sw.match(/registerRoute\(/g)?.length ?? 0
if (rotte !== 1 || !/registerRoute\(new \w+\.NavigationRoute\(\w+\.createHandlerBoundToURL\("index\.html"\)/.test(sw)) {
  errore(`sw.js deve avere solo il ripiego di navigazione su index.html: trovate ${rotte} rotte.`)
}
for (const strategia of ['NetworkFirst', 'CacheFirst', 'StaleWhileRevalidate', 'NetworkOnly', 'CacheOnly', 'runtimeCaching']) {
  if (sw.includes(strategia)) errore(`sw.js contiene una regola di cache a runtime (${strategia}).`)
}

// Nessun URL di Supabase nel service worker (né nel suo runtime di Workbox).
const urlSupabase = leggiUrlSupabase()
const fileWorkbox = readdirSync(dist).filter(f => /^workbox-.*\.js$/.test(f))
for (const nome of ['sw.js', ...fileWorkbox]) {
  const testo = nome === 'sw.js' ? sw : readFileSync(path.join(dist, nome), 'utf8')
  if (/supabase/i.test(testo)) errore(`${nome} nomina Supabase: il service worker non deve toccarlo.`)
  if (urlSupabase && testo.includes(new URL(urlSupabase).host)) errore(`${nome} contiene l'indirizzo del progetto Supabase.`)
}

// La versione nuova aspetta: skipWaiting solo dentro il messaggio SKIP_WAITING, niente clientsClaim.
const salti = sw.match(/skipWaiting\(\)/g)?.length ?? 0
if (salti !== 1 || !/"SKIP_WAITING"\s*===\s*\w+\.data\.type\s*&&\s*self\.skipWaiting\(\)/.test(sw)) {
  errore('sw.js deve chiamare skipWaiting solo su richiesta (messaggio SKIP_WAITING).')
}
if (/clientsClaim/.test(sw)) errore('sw.js non deve prendere il controllo delle pagine aperte (clientsClaim).')

// vercel.json: sw.js senza cache, nessuna riscrittura dei file sotto /assets/.
const vercel = JSON.parse(readFileSync(path.join(radice, 'vercel.json'), 'utf8'))
const intestazioniSw = (vercel.headers ?? []).find(h => h.source === '/sw.js')?.headers ?? []
if (!intestazioniSw.some(h => h.key.toLowerCase() === 'cache-control' && h.value === 'no-cache')) {
  errore('vercel.json deve servire /sw.js con Cache-Control: no-cache.')
}
for (const r of vercel.rewrites ?? []) {
  // Le sorgenti di Vercel qui sono espressioni regolari valide anche in JavaScript.
  const regola = new RegExp(`^${r.source}$`)
  if (regola.test('/assets/index-mancante.js')) errore(`vercel.json riscrive anche i file sotto /assets/ (${r.source}): un file mancante deve dare 404.`)
}
if (!(vercel.rewrites ?? []).some(r => new RegExp(`^${r.source}$`).test('/esperimenti/E/oggi'))) {
  errore('vercel.json deve riscrivere le pagine dell\'app su /index.html.')
}

function leggiUrlSupabase() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  for (const nome of ['.env.local', '.env', '.env.production', '.env.production.local']) {
    const file = path.join(radice, nome)
    if (!existsSync(file)) continue
    const riga = readFileSync(file, 'utf8').split('\n').find(r => r.startsWith('VITE_SUPABASE_URL='))
    if (riga) return riga.slice('VITE_SUPABASE_URL='.length).trim().replace(/^["']|["']$/g, '')
  }
  return null
}

const kB = n => `${(n / 1024).toFixed(0)} KiB`
const peso = [...precache].reduce((s, u) => {
  const file = path.join(dist, u)
  return s + (existsSync(file) ? readFileSync(file).length : 0)
}, 0)
console.log(`Precache: ${precache.size} file (${kB(peso)}), di cui ${assets.length} da dist/assets.`)
if (errori.length > 0) {
  for (const e of errori) console.error(`ERRORE: ${e}`)
  process.exit(1)
}
console.log('OK: tutta la build è nel precache, nessuna regola per Supabase, aggiornamento solo su richiesta, vercel.json a posto.')
