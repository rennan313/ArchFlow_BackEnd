// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const openApiSpec: Record<string, any> = {
  openapi: "3.0.3",
  info: {
    title: "ArchFlow API",
    description:
      "Backend API for ArchFlow — a Micro SaaS for architects to manage client proposals and monitor infrastructure instances.",
    version: "1.0.0",
    contact: {
      name: "ArchFlow Support",
    },
  },
  servers: [
    { url: "http://localhost:3000", description: "Development" },
    { url: "https://your-domain.com", description: "Production" },
  ],
  tags: [
    { name: "Auth", description: "Authentication & session management" },
    { name: "Proposals", description: "Client proposal CRUD" },
    { name: "Instances", description: "Infrastructure instance monitoring" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token returned by /api/auth/login",
      },
    },
    schemas: {
      // ── Enums ──────────────────────────────────────────────────────────────
      Role: {
        type: "string",
        enum: ["USER", "ADMIN"],
      },
      ProposalStatus: {
        type: "string",
        enum: ["DRAFT", "SENT", "APPROVED", "REJECTED"],
      },
      InstanceStatus: {
        type: "string",
        enum: ["RUNNING", "STOPPED", "PENDING", "ERROR"],
      },
      Environment: {
        type: "string",
        enum: ["PRODUCTION", "STAGING", "DEVELOPMENT"],
      },

      // ── Models ─────────────────────────────────────────────────────────────
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "6650a1b2c3d4e5f678901234" },
          name: { type: "string", example: "Ana Souza" },
          email: { type: "string", format: "email", example: "ana@archflow.com" },
          role: { $ref: "#/components/schemas/Role" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Proposal: {
        type: "object",
        properties: {
          id: { type: "string", example: "6650a1b2c3d4e5f678901235" },
          userId: { type: "string", example: "6650a1b2c3d4e5f678901234" },
          clientName: { type: "string", example: "João Lima" },
          projectType: { type: "string", example: "Residential" },
          squareMeters: { type: "number", example: 120.5 },
          city: { type: "string", example: "São Paulo" },
          style: { type: "string", example: "Modern Minimalist" },
          scope: { type: "string", example: "Full interior and exterior design including lighting plan." },
          generatedText: { type: "string", nullable: true, example: "AI-generated proposal text..." },
          status: { $ref: "#/components/schemas/ProposalStatus" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Instance: {
        type: "object",
        properties: {
          id: { type: "string", example: "6650a1b2c3d4e5f678901236" },
          name: { type: "string", example: "prod-server-01" },
          status: { $ref: "#/components/schemas/InstanceStatus" },
          ip: { type: "string", example: "192.168.1.100" },
          environment: { $ref: "#/components/schemas/Environment" },
          memoryUsage: { type: "number", example: 72.3, description: "Percentage 0–100" },
          cpuUsage: { type: "number", example: 14.5, description: "Percentage 0–100" },
          uptime: { type: "integer", example: 86400, description: "Seconds since last boot" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      InstanceMetrics: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          status: { $ref: "#/components/schemas/InstanceStatus" },
          metrics: {
            type: "object",
            properties: {
              memoryUsage: { type: "number", description: "%" },
              cpuUsage: { type: "number", description: "%" },
              uptime: { type: "integer", description: "seconds" },
            },
          },
          timestamp: { type: "string", format: "date-time" },
        },
      },

      // ── Tokens ─────────────────────────────────────────────────────────────
      Tokens: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
        },
      },

      // ── Pagination ─────────────────────────────────────────────────────────
      Pagination: {
        type: "object",
        properties: {
          total: { type: "integer", example: 42 },
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 10 },
          totalPages: { type: "integer", example: 5 },
        },
      },

      // ── Generic responses ──────────────────────────────────────────────────
      SuccessResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string" },
          data: {},
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string" },
          errors: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
            },
            example: { email: ["Invalid email address"] },
          },
        },
      },
    },
  },
  paths: {
    // ── AUTH ────────────────────────────────────────────────────────────────
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password"],
                properties: {
                  name: { type: "string", minLength: 2, example: "Ana Souza" },
                  email: { type: "string", format: "email", example: "ana@archflow.com" },
                  password: {
                    type: "string",
                    minLength: 8,
                    example: "Secure123",
                    description: "Min 8 chars, one uppercase, one number",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Account created",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/User" } } },
                  ],
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "Email already registered", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and receive JWT tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email", example: "ana@archflow.com" },
                  password: { type: "string", example: "Secure123" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    {
                      properties: {
                        data: {
                          type: "object",
                          properties: {
                            user: { $ref: "#/components/schemas/User" },
                            accessToken: { type: "string" },
                            refreshToken: { type: "string" },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a refresh token for a new token pair",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: {
                  refreshToken: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "New tokens issued",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/Tokens" } } },
                  ],
                },
              },
            },
          },
          "401": { description: "Invalid or expired refresh token", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset link",
        description: "Always returns 200 to prevent email enumeration. In development the reset token is included in the response body.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", format: "email", example: "ana@archflow.com" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Reset email sent (or address not found — same response)",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    {
                      properties: {
                        data: {
                          type: "object",
                          properties: {
                            message: { type: "string" },
                            debug_token: { type: "string", description: "Only present in development" },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password using the token received by email",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["token", "password"],
                properties: {
                  token: { type: "string", example: "a3f9bc12..." },
                  password: { type: "string", minLength: 8, example: "NewSecure456", description: "Min 8 chars, one uppercase, one number" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Password reset successful", content: { "application/json": { schema: { $ref: "#/components/schemas/SuccessResponse" } } } },
          "400": {
            description: "Invalid, expired, or already-used token",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
          },
        },
      },
    },

    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the currently authenticated user",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Current user data",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/User" } } },
                  ],
                },
              },
            },
          },
          "401": { description: "Missing or invalid token", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    // ── PROPOSALS ───────────────────────────────────────────────────────────
    "/api/proposals": {
      get: {
        tags: ["Proposals"],
        summary: "List proposals for the authenticated user",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 }, description: "Page number" },
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 100 }, description: "Items per page" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Full-text search on clientName, city, projectType, style" },
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/ProposalStatus" },
            description: "Filter by status",
          },
          {
            name: "sortBy",
            in: "query",
            schema: { type: "string", enum: ["createdAt", "updatedAt", "clientName", "squareMeters"], default: "createdAt" },
          },
          { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          "200": {
            description: "Paginated list of proposals",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/Proposal" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
                example: {
                  success: true,
                  data: [],
                  pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      post: {
        tags: ["Proposals"],
        summary: "Create a new proposal",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["clientName", "projectType", "squareMeters", "city", "style", "scope"],
                properties: {
                  clientName: { type: "string", minLength: 2, example: "João Lima" },
                  projectType: { type: "string", example: "Residential" },
                  squareMeters: { type: "number", example: 120.5 },
                  city: { type: "string", example: "São Paulo" },
                  style: { type: "string", example: "Modern Minimalist" },
                  scope: { type: "string", minLength: 10, example: "Full interior and exterior design including lighting plan." },
                  generatedText: { type: "string", example: "Optional AI-generated text for the proposal..." },
                  status: { $ref: "#/components/schemas/ProposalStatus" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Proposal created",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/Proposal" } } },
                  ],
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/proposals/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "6650a1b2c3d4e5f678901235" }],
      get: {
        tags: ["Proposals"],
        summary: "Get a single proposal by ID",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Proposal data",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/Proposal" } } },
                  ],
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Proposal not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      put: {
        tags: ["Proposals"],
        summary: "Update a proposal (partial update supported)",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  clientName: { type: "string" },
                  projectType: { type: "string" },
                  squareMeters: { type: "number" },
                  city: { type: "string" },
                  style: { type: "string" },
                  scope: { type: "string" },
                  generatedText: { type: "string" },
                  status: { $ref: "#/components/schemas/ProposalStatus" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated proposal",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/Proposal" } } },
                  ],
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Proposal not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      delete: {
        tags: ["Proposals"],
        summary: "Delete a proposal",
        security: [{ BearerAuth: [] }],
        responses: {
          "204": { description: "Deleted successfully — no body" },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Proposal not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    // ── INSTANCES ───────────────────────────────────────────────────────────
    "/api/instances": {
      get: {
        tags: ["Instances"],
        summary: "List infrastructure instances",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 100 } },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by name or IP" },
          { name: "status", in: "query", schema: { $ref: "#/components/schemas/InstanceStatus" } },
          { name: "environment", in: "query", schema: { $ref: "#/components/schemas/Environment" } },
          {
            name: "sortBy",
            in: "query",
            schema: { type: "string", enum: ["createdAt", "name", "cpuUsage", "memoryUsage", "uptime"], default: "createdAt" },
          },
          { name: "sortOrder", in: "query", schema: { type: "string", enum: ["asc", "desc"], default: "desc" } },
        ],
        responses: {
          "200": {
            description: "Paginated list of instances",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: { type: "array", items: { $ref: "#/components/schemas/Instance" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/instances/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "6650a1b2c3d4e5f678901236" }],
      get: {
        tags: ["Instances"],
        summary: "Get a single instance by ID",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Instance data",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/Instance" } } },
                  ],
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Instance not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },

    "/api/instances/{id}/metrics": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "6650a1b2c3d4e5f678901236" }],
      get: {
        tags: ["Instances"],
        summary: "Get real-time metrics for an instance",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": {
            description: "Instance metrics snapshot",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/SuccessResponse" },
                    { properties: { data: { $ref: "#/components/schemas/InstanceMetrics" } } },
                  ],
                },
              },
            },
          },
          "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "404": { description: "Instance not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
  },
};
