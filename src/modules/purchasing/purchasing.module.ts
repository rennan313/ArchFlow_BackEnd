// Public surface of the Purchasing module (Compras) — routes import from
// here, never from internal service files directly, same barrel convention
// as src/modules/financial/financial.module.ts. Depends on Finance
// (Supplier, FinancialCategory, CostCenter) read/write in one direction
// only — Finance never imports anything from here (DOMAIN_GUIDE.md §6).

export { purchaseOrderService } from "./services/purchaseOrder.service"
