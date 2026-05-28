import { z } from "zod";

export const createProposalSchema = z.object({
  clientName:   z.string().min(2, "Client name must be at least 2 characters").max(100),
  projectType:  z.string().min(2).max(100),
  squareMeters: z.number().positive("Square meters must be a positive number"),
  city:         z.string().min(2).max(100),
  style:        z.string().min(2).max(100),
  scope:        z.string().min(10, "Scope must be at least 10 characters").max(5000),
  priorities:   z.string().max(2000).optional(),
  budget:       z.string().max(500).optional(),
  timeline:     z.string().max(500).optional(),
  meetingNotes: z.string().max(5000).optional(),
  generatedText: z.string().max(20000).optional(),
  status:       z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]).optional(),
});

export const updateProposalSchema = createProposalSchema.partial();

export const proposalQuerySchema = z.object({
  page:      z.coerce.number().int().min(1).optional().default(1),
  limit:     z.coerce.number().int().min(1).max(100).optional().default(10),
  search:    z.string().optional(),
  status:    z.enum(["DRAFT", "SENT", "APPROVED", "REJECTED"]).optional(),
  sortBy:    z.enum(["createdAt", "updatedAt", "clientName", "squareMeters"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const generateProposalSchema = z.object({
  clientName:   z.string().min(2).max(100),
  projectType:  z.string().min(2).max(100),
  squareMeters: z.number().positive().optional(),
  city:         z.string().min(2).max(100).optional(),
  style:        z.string().max(100).optional(),
  scope:        z.string().min(10).max(5000).optional(),
  priorities:   z.string().max(2000).optional(),
  budget:       z.string().max(500).optional(),
  timeline:     z.string().max(500).optional(),
  meetingNotes: z.string().max(5000).optional(),
});

export type CreateProposalInput  = z.infer<typeof createProposalSchema>;
export type UpdateProposalInput  = z.infer<typeof updateProposalSchema>;
export type ProposalQueryInput   = z.infer<typeof proposalQuerySchema>;
export type GenerateProposalInput = z.infer<typeof generateProposalSchema>;
