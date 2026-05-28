import { type NextRequest } from "next/server"
import { withAuth } from "@/middlewares/auth"
import { mediaService } from "@/services/media.service"
import { proposalService } from "@/services/proposal.service"
import { created, badRequest } from "@/lib/response"
import { handleServiceError } from "@/utils/serviceError"
import type { JwtPayload } from "@/lib/jwt"

type Ctx = { params: Promise<{ id: string }> }

export const POST = withAuth(async (req: NextRequest, ctx: Ctx, user: JwtPayload) => {
  try {
    const { id } = await ctx.params

    // Verify proposal belongs to user
    await proposalService.getById(id, user.sub)

    const formData = await req.formData()
    const file     = formData.get("file")

    if (!file || !(file instanceof File)) {
      return badRequest('Field "file" is required and must be a file')
    }

    const media = await mediaService.upload(id, file)
    return created(media, "Media uploaded successfully")
  } catch (error) {
    // Handle unsupported file type explicitly
    if (error instanceof Error && error.message.startsWith("UNSUPPORTED_FILE_TYPE")) {
      const type = error.message.split(":")[1] ?? "unknown"
      return badRequest(`Unsupported file type: ${type}. Allowed: JPEG, PNG, WebP, GIF, MP4, WebM, MOV`)
    }
    return handleServiceError(error)
  }
})
