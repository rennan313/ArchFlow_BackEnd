import { type NextRequest } from "next/server"
import { withWorkspace } from "@/middlewares/auth"
import { hasPermission } from "@/middlewares/rbac"
import { dashboardService } from "@/services/dashboard.service"
import { financialDashboardService } from "@/modules/financial/financial.module"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

export const GET = withWorkspace(async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload, workspaceId: string) => {
  try {
    // Financial widgets are fetched only when the caller actually has
    // view:financial-dashboard — unlike every other widget here, financial
    // data is NOT part of the universal read:* grant (see rbac.ts's block
    // comment on the Financial permission block), so DESIGNER/VIEWER (and by
    // default ASSISTANT) must not receive this key in the payload at all.
    const canViewFinancialDashboard = hasPermission(user.workspaceRole ?? "VIEWER", "view:financial-dashboard")

    const [data, kanbanWidgets, financialWidgets] = await Promise.all([
      dashboardService.getAggregations(workspaceId),
      dashboardService.getKanbanWidgets(workspaceId),
      canViewFinancialDashboard ? financialDashboardService.getWidgets(workspaceId) : Promise.resolve(null),
    ])
    return ok({ ...data, ...kanbanWidgets, ...(financialWidgets ? { financial: financialWidgets } : {}) })
  } catch (error) { return handleServiceError(error) }
})
