import { z } from "zod"

// unitPrice is reais (decimal, as typed by a human), converted to unitCents
// in the service layer — same boundary-conversion pattern as
// installmentInputSchema's `amount`. totalCents is never accepted from the
// client — it's always quantity × unitCents, computed server-side.
export const purchaseOrderItemInputSchema = z.object({
  description: z.string().min(1).max(300),
  quantity:    z.number().positive(),
  unitPrice:   z.number().positive(),
})

// totalAmountCents is deliberately NOT an input field — derived by summing
// the items the client submits, same reasoning as
// createFinancialDocumentSchema's totalAmountCents.
export const createPurchaseOrderSchema = z.object({
  supplierId:   z.string().min(1),
  projectId:    z.string().min(1).optional(),
  categoryId:   z.string().min(1),
  costCenterId: z.string().min(1).optional(),
  description:  z.string().min(2).max(300),
  dueDate:      z.coerce.date(),
  notes:        z.string().max(2000).optional(),
  items:        z.array(purchaseOrderItemInputSchema).min(1).max(200),
  idempotencyKey: z.string().uuid(),
})

// supplierId/projectId/categoryId/items are intentionally not editable after
// creation via this schema's sibling operations (approve/cancel) — a DRAFT
// purchase order can still be edited freely (status !== DRAFT is what
// closes editing, enforced in the service, not here).
export const updatePurchaseOrderSchema = z.object({
  supplierId:   z.string().min(1).optional(),
  projectId:    z.string().min(1).optional(),
  categoryId:   z.string().min(1).optional(),
  costCenterId: z.string().min(1).optional(),
  description:  z.string().min(2).max(300).optional(),
  dueDate:      z.coerce.date().optional(),
  notes:        z.string().max(2000).optional(),
  items:        z.array(purchaseOrderItemInputSchema).min(1).max(200).optional(),
})

export const purchaseOrderQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  status:     z.enum(["DRAFT", "APPROVED", "CANCELLED"]).optional(),
  supplierId: z.string().optional(),
  projectId:  z.string().optional(),
  search:     z.string().optional(),
  sortBy:    z.enum(["dueDate", "createdAt", "totalAmountCents"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
})

export type PurchaseOrderItemInput  = z.infer<typeof purchaseOrderItemInputSchema>
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>
export type PurchaseOrderQueryInput  = z.infer<typeof purchaseOrderQuerySchema>
