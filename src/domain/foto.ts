/**
 * Il percorso del file di una foto nel bucket `foto`: `<esperimento_id>/<foto_id>.jpg`. Lo impone il vincolo
 * `foto_percorso_formato` della riga e le policy dello Storage (accettano solo questo nome, con uuid in minuscolo, come
 * li scrive Postgres): per questo si porta in minuscolo anche un id arrivato da un link scritto a mano.
 */
export function percorsoFoto(espId: string, fotoId: string): string {
  return `${espId.toLowerCase()}/${fotoId.toLowerCase()}.jpg`
}
