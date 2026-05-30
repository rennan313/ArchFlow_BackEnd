import pino from "pino"

// env.ts is not imported here to avoid circular dependency
// (logger is imported by env-consuming files; env itself doesn't import logger)
const isDev = process.env.NODE_ENV !== "production"

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, ignore: "pid,hostname", translateTime: "HH:MM:ss" },
    },
  }),
})
