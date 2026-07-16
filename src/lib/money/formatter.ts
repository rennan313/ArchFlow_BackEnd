import type { Cents } from "./money"
import { centsToReais } from "./converter"

// Backend-side formatting exists for logs/audit messages only — the API
// never sends pre-formatted currency strings to the frontend (it sends raw
// cents, serialized as a numeric string by money.ts's BigInt.toJSON shim;
// see ArchFlow/src/lib/format.ts#formatCentsBRL for the frontend formatter
// that renders it for a human).
export function formatCentsBRL(cents: Cents, locale = "pt-BR"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(centsToReais(cents))
}
