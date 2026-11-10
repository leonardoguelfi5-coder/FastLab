// Controllo del bundle (Piano D, Task D8): exceljs e react-dom/server devono restare fuori dal chunk principale.
//
// Uso: `npm run test:bundle` (fa da solo una build di produzione in memoria, senza scrivere `dist/`).
//
// Il controllo non cerca parole nel codice minificato (il chunk principale contiene comunque il nome del file del chunk
// di exceljs, per l'import dinamico): chiede a Vite in quali chunk sono finiti i moduli. Il "principale" è l'entrata
// con tutti i chunk che importa in modo statico, cioè quello che il browser scarica all'apertura dell'app. Esce con 1
// se un modulo vietato ci finisce dentro; stampa le dimensioni (anche gzip) del principale e dei chunk vietati.
import { gzipSync } from 'node:zlib'
import { build } from 'vite'

const VIETATI = [
  { nome: 'exceljs', modulo: /[\\/]node_modules[\\/]exceljs[\\/]/ },
  { nome: 'react-dom/server', modulo: /[\\/]node_modules[\\/]react-dom[\\/](server[^\\/]*\.js$|cjs[\\/]react-dom-server)/ },
]

const kB = n => `${(n / 1000).toFixed(2)} kB`
const misura = chunk => `${kB(Buffer.byteLength(chunk.code))} (gzip ${kB(gzipSync(chunk.code).length)})`

const risultato = await build({ logLevel: 'warn', build: { write: false } })
const uscite = (Array.isArray(risultato) ? risultato : [risultato]).flatMap(r => r.output)
const chunk = new Map(uscite.filter(o => o.type === 'chunk').map(c => [c.fileName, c]))

// il principale: le entrate e, ricorsivamente, i chunk che importano in modo statico
const principale = new Set()
const daVisitare = [...chunk.values()].filter(c => c.isEntry).map(c => c.fileName)
while (daVisitare.length > 0) {
  const nome = daVisitare.pop()
  if (principale.has(nome)) continue
  principale.add(nome)
  daVisitare.push(...(chunk.get(nome)?.imports ?? []))
}

let errori = 0
console.log(`Chunk principale: ${[...principale].map(n => `${n} ${misura(chunk.get(n))}`).join(', ')}`)
for (const { nome, modulo } of VIETATI) {
  const dove = [...chunk.values()].filter(c => c.moduleIds.some(id => modulo.test(id)))
  if (dove.length === 0) {
    console.log(`${nome}: in nessun chunk (nessun modulo dell'app lo importa ancora)`)
    continue
  }
  for (const c of dove) {
    const nelPrincipale = principale.has(c.fileName)
    if (nelPrincipale) errori++
    console.log(`${nome}: ${c.fileName} ${misura(c)}${nelPrincipale ? '  ERRORE: è nel chunk principale' : ', caricato a richiesta'}`)
  }
}
if (errori > 0) {
  console.error('Il chunk principale contiene librerie che devono arrivare solo con un import dinamico.')
  process.exit(1)
}
console.log('OK: exceljs e react-dom/server sono fuori dal chunk principale.')
