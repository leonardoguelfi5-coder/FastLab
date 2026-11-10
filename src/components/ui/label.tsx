import * as React from "react"

import { cn } from "@/lib/utils"

/** Etichetta sopra il campo, in Label (in tondo, non maiuscolo) e grafite tenue. */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-label text-grafite-tenue select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export { Label }
