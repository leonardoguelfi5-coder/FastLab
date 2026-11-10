import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-28 w-full rounded-md border border-riga-controllo bg-foglio px-3.5 py-3 text-base text-grafite transition-colors outline-none hover:border-grafite-tenue focus:border-inchiostro focus:ring-3 focus:ring-inchiostro-velato aria-invalid:border-errore aria-invalid:focus:ring-errore-velato disabled:cursor-not-allowed disabled:border-riga disabled:bg-carta-ombra disabled:text-grafite-tenue",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
