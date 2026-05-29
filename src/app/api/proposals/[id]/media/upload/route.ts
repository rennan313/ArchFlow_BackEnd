import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { subscriptionService } from "@/services/subscription.service"
import { created, badRequest, forbidden } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params

    await proposalService.getById(id, user.sub)

    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    // Check storage limit before uploading
    if (user.workspaceId) {
      const sizeMb    = file.size / (1024 * 1024)
      const limitCheck = await subscriptionService.canUploadFile(user.workspaceId, sizeMb)
      if (!limitCheck.allowed) return forbidden(limitCheck.reason ?? "Storage limit reached")
    }

    const media = await mediaService.upload(id, file)
    return created(media, "Media uploaded successfully")
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("UNSUPPORTED_FILE_TYPE")) {
      const type = error.message.split(":")[1] ?? "unknown"
      return badRequest(`Unsupported file type: ${type}. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM, MOV`)
    }
    return handleServiceError(error)
  }
})
