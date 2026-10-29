import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Le taglie tipografiche e le ombre di DESIGN.md (src/index.css): senza questo elenco tailwind-merge
// scambierebbe `text-campo` per un colore e lo toglierebbe accanto a `text-grafite`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["numero", "headline", "title", "campo", "dato", "label"],
      shadow: ["galleggiante", "dialogo"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
