import { z } from "zod"
import { booleanQueryParam } from "./common"

export const createSupplierSchema = z.object({
  name:       z.string().min(2).max(200),
  categoryId: z.string().min(1).optional(),
  document:   z.string().max(30).optional(),
  email:      z.string().email().optional(),
  whatsapp:   z.string().max(30).optional(),
  phone:      z.string().max(30).optional(),
  website:    z.string().url().optional(),
  address:    z.string().max(300).optional(),
  notes:      z.string().max(2000).optional(),
})

// archived/archivedAt/archivedBy are never editable through the generic
// update endpoint (ADR-020) — only through the dedicated archive/restore actions.
export const updateSupplierSchema = createSupplierSchema.partial()

export const supplierQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(200).optional().default(20),
  search:     z.string().optional(),
  categoryId: z.string().optional(),
  archived:   booleanQueryParam.optional(),
  sortBy:     z.enum(["name", "createdAt", "updatedAt"]).optional().default("name"),
  sortOrder:  z.enum(["asc", "desc"]).optional().default("asc"),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
export type SupplierQueryInput  = z.infer<typeof supplierQuerySchema>
