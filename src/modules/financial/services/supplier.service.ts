import { supplierRepository } from "@/repositories/supplier.repository"
import { buildMeta } from "@/lib/pagination"
import { AppError, ErrorCode } from "@/lib/errors"
import { assertWorkspaceReferences } from "@/lib/tenantGuard"
import type { CreateSupplierInput, UpdateSupplierInput, SupplierQueryInput } from "@/validations/supplier"

export const supplierService = {
  async list(workspaceId: string, query: SupplierQueryInput) {
    const { data, total } = await supplierRepository.findMany(workspaceId, query)
    return { data, pagination: buildMeta(total, query.page, query.limit) }
  },

  async getById(id: string, workspaceId: string) {
    const supplier = await supplierRepository.findById(id, workspaceId)
    if (!supplier) throw new AppError(ErrorCode.SUPPLIER_NOT_FOUND)
    return supplier
  },

  // Projects this supplier has been billed against, derived from
  // FinancialDocument — see supplier.repository.ts for why there is no
  // separate join table for the Fornecedor↔Projeto relationship.
  async projects(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    return supplierRepository.findProjects(id, workspaceId)
  },

  async create(workspaceId: string, input: CreateSupplierInput) {
    await assertWorkspaceReferences(workspaceId, { supplierCategoryId: input.categoryId })

    return supplierRepository.create({
      workspaceId,
      categoryId: input.categoryId,
      name:       input.name,
      document:   input.document,
      email:      input.email,
      whatsapp:   input.whatsapp,
      phone:      input.phone,
      website:    input.website,
      address:    input.address,
      notes:      input.notes,
    })
  },

  async update(id: string, workspaceId: string, input: UpdateSupplierInput) {
    await this.getById(id, workspaceId)
    if (input.categoryId) {
      await assertWorkspaceReferences(workspaceId, { supplierCategoryId: input.categoryId })
    }

    await supplierRepository.update(id, workspaceId, input)
    return this.getById(id, workspaceId)
  },

  // No physical delete — Supplier participates in financial history
  // (FinancialDocument.supplierId), which must never be able to point at a
  // vanished row. "Inativo" is the whole lifecycle end-state for this entity.
  async deactivate(id: string, workspaceId: string) {
    await this.getById(id, workspaceId)
    await supplierRepository.update(id, workspaceId, { isActive: false })
  },
}
