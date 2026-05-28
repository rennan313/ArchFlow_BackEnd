import { z } from "zod";

export const instanceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().optional(),
  status: z.enum(["RUNNING", "STOPPED", "PENDING", "ERROR"]).optional(),
  environment: z.enum(["PRODUCTION", "STAGING", "DEVELOPMENT"]).optional(),
  sortBy: z.enum(["createdAt", "name", "cpuUsage", "memoryUsage", "uptime"]).optional().default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export type InstanceQueryInput = z.infer<typeof instanceQuerySchema>;
