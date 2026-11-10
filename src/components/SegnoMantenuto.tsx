/**
 * Il segno accanto al nome di un campo che parte dal valore "mantenuto" dalla pianta di prima: si vede col testo,
 * non solo col colore, così non si salva per sbaglio sulla pianta sbagliata. Il campo lo legge con `aria-describedby`.
 */
export function SegnoMantenuto({ id }: { id: string }) {
  return <span id={id} className="text-label text-grafite-tenue select-none">mantenuto</span>
}
