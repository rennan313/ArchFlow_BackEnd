import { type NextRequest } from "next/server";
import { withAuth } from "@/middlewares/auth";
import { aiService } from "@/services/ai.service";
import { proposalService } from "@/services/proposal.service";
import { generateProposalSchema } from "@/validations/proposal";
import { ok } from "@/lib/response";
import { handleServiceError } from "@/utils/serviceError";
import type { JwtPayload } from "@/lib/jwt";

export const POST = withAuth(async (req: NextRequest, _ctx: { params: Promise<Record<string, string>> }, user: JwtPayload) => {
  try {
    const body  = await req.json();
    const input = generateProposalSchema.parse(body);

    // 1. Generate proposal content via AI service
    const { proposal, rawText } = await aiService.generateProposal(input);

    // 2. Persist as a new proposal record
    const saved = await proposalService.create(user.sub, {
      clientName:   input.clientName,
      projectType:  input.projectType,
      squareMeters: input.squareMeters ?? 1,
      city:         input.city ?? "Não informado",
      style:        input.style ?? "Contemporâneo",
      scope:        input.scope ?? `Projeto ${input.projectType} para ${input.clientName}.`,
      priorities:   input.priorities,
      budget:       input.budget,
      timeline:     input.timeline,
      meetingNotes: input.meetingNotes,
      generatedText: rawText,
      status:       "DRAFT",
    });

    return ok({ proposal: saved, generated: proposal }, "Proposal generated successfully");
  } catch (error) {
    return handleServiceError(error);
  }
});
