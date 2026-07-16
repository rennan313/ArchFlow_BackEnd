// Public surface of the Financial module — office-level bookkeeping (AP/AR,
// suppliers, bank accounts, chart of accounts). Routes import from here, not
// from internal service files directly, same barrel convention as
// src/modules/billing/billing.module.ts. Distinct bounded context from
// billing: this is the workspace's own money, not ArchFlow's SaaS billing.

export { supplierCategoryService } from "./services/supplierCategory.service"
export { supplierService }         from "./services/supplier.service"
export { bankAccountService }      from "./services/bankAccount.service"
export { financialCategoryService } from "./services/financialCategory.service"
export { costCenterService }       from "./services/costCenter.service"
export { financialDocumentService } from "./services/financialDocument.service"
export { installmentService }      from "./services/installment.service"
export { financialDashboardService } from "./services/financialDashboard.service"
export { projectFinancialSummaryService } from "./services/projectFinancialSummary.service"
