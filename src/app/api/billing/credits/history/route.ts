import type { NextRequest } from "next/server"
import { ok } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import { withWorkspace } from "@/middlewares/auth"
import { aiCreditService } from "@/services/billing/aiCredit.service"
import type { JwtPayload } from "@/lib/jwt"

// GET — the workspace's AI credit ledger history, newest-first. Read-only
// (any member can view), reuses AiCreditLedgerEntry directly — no parallel
// history table.
export const GET = withWorkspace(
  async (_req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, _user: JwtPayload, workspaceId: string) => {
    try {
      return ok(await aiCreditService.listHistory(workspaceId))
    } catch (error) {
      return handleServiceError(error)
    }
  },
)
