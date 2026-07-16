import { z } from "zod"
import { FinancialDirectionEnum } from "./financialCategory"

export const InstallmentStatusEnum = z.enum(["OPEN", "PARTIAL", "PAID"])

// This is the primary listing used by both the Financeiro screen and
// Relatórios (the brief's filter set — período, projeto, fornecedor,
// cliente, categoria, status — is identical for both, so one endpoint
// serves both instead of duplicating the query). It lists at the parcela
// (Installment) level, not the título (FinancialDocument) level, because
// that's the actual unit users reason about ("o que vence essa semana"),
// same as every real AP/AR screen (Omie, Conta Azul, SAP B1).
export const installmentQuerySchema = z.object({
  page:  z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  direction:    FinancialDirectionEnum.optional(),
  projectId:    z.string().optional(),
  clientId:     z.string().optional(),
  supplierId:   z.string().optional(),
  categoryId:   z.string().optional(),
  costCenterId: z.string().optional(),
  status:       InstallmentStatusEnum.optional(),
  // Derived filter — dueDate < now && status != PAID. Not a stored status,
  // see the InstallmentStatus enum comment in schema.prisma.
  overdue:      z.coerce.boolean().optional(),
  dueDateFrom:  z.coerce.date().optional(),
  dueDateTo:    z.coerce.date().optional(),
  sortBy:    z.enum(["dueDate", "amountCents"]).optional().default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
})

export type InstallmentQueryInput = z.infer<typeof installmentQuerySchema>
