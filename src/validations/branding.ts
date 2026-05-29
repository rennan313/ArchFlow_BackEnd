import { z } from "zod"

const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color (#RGB or #RRGGBB)")

const url = z.string().url("Must be a valid URL").optional()

const cauPattern = /^[A-Z]{2}-\d{1,6}-[A-Z]$/
const cau = z.string().regex(cauPattern, "CAU must match pattern UF-123456-A").optional()

export const updateBrandingSchema = z.object({
  officeName:        z.string().min(2).max(100).optional(),
  tradeName:         z.string().max(100).optional(),
  architectName:     z.string().max(100).optional(),
  cauNumber:         cau,
  email:             z.string().email().optional(),
  phone:             z.string().max(20).optional(),
  whatsapp:          z.string().max(20).optional(),
  website:           url,
  instagram:         z.string().max(50).optional(),
  primaryColor:      hexColor.optional(),
  secondaryColor:    hexColor.optional(),
  proposalSignature: z.string().max(2000).optional(),
  proposalFooter:    z.string().max(1000).optional(),
})

export const ALLOWED_BRANDING_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/webp",
  "image/jpeg",
])

export const MAX_BRANDING_ASSET_SIZE = 5 * 1024 * 1024 // 5 MB

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>
