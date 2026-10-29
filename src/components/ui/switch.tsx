"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

/**
 * Interruttore: spento → binario carta ombra con bordo visibile al sole e pomello grafite tenue;
 * acceso → inchiostro pieno con pomello foglio. Lo stato si legge anche dalla posizione del pomello,
 * non solo dal colore. L'area di tocco è allargata a 44px con lo pseudo-elemento.
 */
function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors after:absolute after:-inset-x-2 after:-inset-y-2 data-[size=default]:h-7 data-[size=default]:w-12 data-[size=sm]:h-6 data-[size=sm]:w-10 data-checked:border-inchiostro data-checked:bg-inchiostro data-unchecked:border-riga-controllo data-unchecked:bg-carta-ombra aria-invalid:border-errore data-disabled:cursor-not-allowed data-disabled:border-riga data-disabled:bg-carta-ombra",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4 data-checked:bg-foglio data-unchecked:bg-grafite-tenue group-data-[size=default]/switch:data-checked:translate-x-[23px] group-data-[size=sm]/switch:data-checked:translate-x-[19px] data-unchecked:translate-x-[3px] data-disabled:bg-riga-forte"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
