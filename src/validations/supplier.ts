import { z } from "zod"

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

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const supplierQuerySchema = z.object({
  page:       z.coerce.number().int().min(1).optional().default(1),
  limit:      z.coerce.number().int().min(1).max(200).optional().default(20),
  search:     z.string().optional(),
  categoryId: z.string().optional(),
  isActive:   z.coerce.boolean().optional(),
  sortBy:     z.enum(["name", "createdAt", "updatedAt"]).optional().default("name"),
  sortOrder:  z.enum(["asc", "desc"]).optional().default("asc"),
})

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>
export type SupplierQueryInput  = z.infer<typeof supplierQuerySchema>
