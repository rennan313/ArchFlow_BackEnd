// AI Credit Purchase sprint (resumed) — single source of truth for the
// add-on credit packs sold via /api/billing/credits/checkout. Mirrors the
// OPERATION_COST convention in services/billing/aiCredit.service.ts: the
// frontend only ever sends a packageId, never a price or credit amount —
// this map is the only place either value is decided. aiCreditPurchase.
// service.ts snapshots {credits, amount, currency} onto the AiCreditPurchase
// row at creation time, so a later edit here never changes an in-flight or
// historical purchase retroactively.

export type CreditPackageId = "50" | "150" | "500"

export interface CreditPackage {
  id:       CreditPackageId
  credits:  number
  price:    number // BRL, decimal
  currency: "BRL"
}

// Placeholder pricing — pending business/blueprint sign-off before production.
export const CREDIT_PACKAGES: Record<CreditPackageId, CreditPackage> = {
  "50":  { id: "50",  credits: 50,  price: 39.90,  currency: "BRL" },
  "150": { id: "150", credits: 150, price: 99.90,  currency: "BRL" },
  "500": { id: "500", credits: 500, price: 279.90, currency: "BRL" },
}

export function isCreditPackageId(value: string): value is CreditPackageId {
  return value in CREDIT_PACKAGES
}

export function listCreditPackages(): CreditPackage[] {
  return Object.values(CREDIT_PACKAGES)
}
