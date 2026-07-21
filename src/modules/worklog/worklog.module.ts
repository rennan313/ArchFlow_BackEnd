// Public surface of the Worklog module — routes import from here, never from
// internal service files directly, same barrel convention as
// src/modules/purchasing/purchasing.module.ts. Depends on Projetos/Clientes/
// Tasks read-only reference only, one direction (DOMAIN_GUIDE.md §6); not a
// Core module in this phase (WORKLOG_ARCHITECTURE_DECISIONS.md ADR-023).

export { timeEntryService } from "./services/timeEntry.service"
export { workSessionService } from "./services/workSession.service"
export { activityCategoryService } from "./services/activityCategory.service"
export { worklogSummaryService } from "./services/worklogSummary.service"
