import { z } from "zod"

// Only self-serve, sellable tiers are checkout-able. STARTER is the technical
// default (reactivated only via support flows), ENTERPRISE is contact-sales —
// neither is offered here, matching the existing upgrade route's constraint.
export const checkoutSchema = z.object({
  plan:  z.enum(["PROFESSIONAL", "STUDIO"]),
  cycle: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>
