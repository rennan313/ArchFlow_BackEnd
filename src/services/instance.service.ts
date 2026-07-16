import { instanceRepository } from "@/repositories/instance.repository";
import type { InstanceQueryInput } from "@/validations/instance";
import { buildMeta } from "@/lib/pagination";
import { AppError, ErrorCode } from "@/lib/errors";

export const instanceService = {
  async list(query: InstanceQueryInput) {
    const { data, total } = await instanceRepository.findMany(query);
    const pagination = buildMeta(total, query.page, query.limit);
    return { data, pagination };
  },

  async getById(id: string) {
    const instance = await instanceRepository.findById(id);
    if (!instance) throw new AppError(ErrorCode.NOT_FOUND);
    return instance;
  },

  async getMetrics(id: string) {
    const instance = await instanceRepository.findById(id);
    if (!instance) throw new AppError(ErrorCode.NOT_FOUND);
    return {
      id: instance.id,
      name: instance.name,
      status: instance.status,
      metrics: {
        memoryUsage: instance.memoryUsage,
        cpuUsage: instance.cpuUsage,
        uptime: instance.uptime,
      },
      timestamp: new Date().toISOString(),
    };
  },
};
