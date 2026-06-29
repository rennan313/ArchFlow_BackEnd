import { z } from "zod"
import { PricingMethodEnum, ComplexityEnum } from "./pricing"

export const generatePremiumProposalSchema = z.object({
  // Required
  clientName:       z.string().min(2).max(100),
  projectType:      z.string().min(2).max(100),
  // Project context
  city:             z.string().max(100).optional(),
  state:            z.string().length(2).toUpperCase().optional(),
  squareMeters:     z.number().positive().optional(),
  style:            z.string().max(100).optional(),
  // Briefing
  projectObjective: z.string().max(2000).optional(),
  spaceUsage:       z.string().max(2000).optional(),
  currentProblems:  z.string().max(2000).optional(),
  priorities:       z.string().max(2000).optional(),
  budget:           z.string().max(500).optional(),
  timeline:         z.string().max(500).optional(),
  meetingNotes:     z.string().max(5000).optional(),
  // Pricing
  pricingMethod:    PricingMethodEnum.optional(),
  estimatedValue:   z.number().nonnegative().optional(),
  complexity:       ComplexityEnum.optional(),
  // Visual references from moodboard
  visualRefUrls:    z.array(z.string().url().refine(
    (url) => url.startsWith("http://") || url.startsWith("https://"),
    { message: "Only http/https URLs are allowed" }
  )).optional(),
  imageRefs: z.array(z.object({
    url:         z.string().url(),
    storagePath: z.string(),
  })).optional(),
})

export type GeneratePremiumProposalInput = z.infer<typeof generatePremiumProposalSchema>
