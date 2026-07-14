import { zodToJsonSchema } from "zod-to-json-schema"
import { z } from "zod"

// ─── Import all Zod validation schemas ───────────────────────────────────────
import { createClientSchema, updateClientSchema } from "@/validations/client"
import { createOpportunitySchema, updateOpportunitySchema } from "@/validations/opportunity"
import { upsertBriefingSchema } from "@/validations/briefing"
import { createFollowUpSchema, updateFollowUpSchema } from "@/validations/followup"
import { updateBrandingSchema } from "@/validations/branding"
import { calculatePricingSchema } from "@/validations/pricing"

// ─── Helper: Zod → OpenAPI Schema Object ─────────────────────────────────────

function zs(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: "openApi3" }) as Record<string, unknown>
}

// ─── Reusable components ─────────────────────────────────────────────────────

const IdStr   = { type: "string", example: "6650a1b2c3d4e5f678901234" }
const DateStr = { type: "string", format: "date-time" }
const NullStr = { type: "string", nullable: true }

const schemas = {
  Error: { type:"object", properties:{ success:{type:"boolean",example:false}, message:{type:"string"} } },
  Pagination: { type:"object", properties:{ total:{type:"integer"}, page:{type:"integer"}, limit:{type:"integer"}, totalPages:{type:"integer"} } },

  User: { type:"object", properties:{
    id:IdStr, name:{type:"string"}, email:{type:"string"}, image:NullStr, role:{type:"string"},
    createdAt:DateStr,
  }},

  Client: { type:"object", properties:{
    id:IdStr, userId:IdStr, name:{type:"string"},
    email:NullStr, phone:NullStr, city:NullStr, state:NullStr, notes:NullStr,
    createdAt:DateStr, updatedAt:DateStr,
  }},

  Opportunity: { type:"object", properties:{
    id:IdStr, userId:IdStr, clientId:IdStr, title:{type:"string"}, projectType:{type:"string"},
    city:NullStr, state:NullStr, squareMeters:{type:"number",nullable:true},
    estimatedRevenue:{type:"number",nullable:true}, probability:{type:"number"},
    weightedRevenue:{type:"number",nullable:true},
    stage:{type:"string",enum:["LEAD","BRIEFING","PROPOSAL_DRAFT","PROPOSAL_SENT","NEGOTIATION","APPROVED","LOST"]},
    createdAt:DateStr, updatedAt:DateStr,
  }},

  Briefing: { type:"object", properties:{
    id:IdStr, opportunityId:IdStr,
    projectObjective:NullStr, spaceUsage:NullStr, desiredStyle:NullStr,
    currentProblems:NullStr, priorities:NullStr, budget:NullStr, timeline:NullStr, meetingNotes:NullStr,
    createdAt:DateStr, updatedAt:DateStr,
  }},

  FollowUp: { type:"object", properties:{
    id:IdStr, opportunityId:IdStr, userId:IdStr,
    nextContactDate:DateStr, notes:NullStr, completed:{type:"boolean"},
    createdAt:DateStr, updatedAt:DateStr,
  }},

  OfficeBranding: { type:"object", properties:{
    id:IdStr, userId:IdStr, officeName:NullStr, tradeName:NullStr,
    architectName:NullStr, cauNumber:NullStr, email:NullStr, phone:NullStr,
    primaryColor:NullStr, secondaryColor:NullStr,
    logoUrl:NullStr, logoWhiteUrl:NullStr, faviconUrl:NullStr,
    proposalSignature:NullStr, proposalFooter:NullStr, updatedAt:DateStr,
  }},

  Dashboard: { type:"object", properties:{
    activeOpportunities:{type:"integer"}, pipelineValue:{type:"number"},
    expectedRevenue:{type:"number"}, approvalRate:{type:"number"},
    averageApprovedRevenue:{type:"number"}, overdueFollowUps:{type:"integer"},
    byStage:{ type:"object", additionalProperties:{ type:"object", properties:{ count:{type:"integer"}, revenue:{type:"number"} } } },
  }},
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

const auth   = [{ BearerAuth: [] }]
const IdPath = [{ name:"id", in:"path", required:true, schema:{type:"string"} }]

function jsonBody(schema: z.ZodTypeAny) {
  return { required:true, content:{ "application/json":{ schema: zs(schema) } } }
}
function formBody() {
  return { required:true, content:{ "multipart/form-data":{ schema:{ type:"object", properties:{ file:{ type:"string", format:"binary" } }, required:["file"] } } } }
}
function ok(ref: string) {
  return { "200":{ description:"Success", content:{ "application/json":{ schema:{ type:"object", properties:{ success:{type:"boolean"}, data:{ "$ref":`#/components/schemas/${ref}` } } } } } } }
}
function okList(ref: string) {
  return { "200":{ description:"Paginated list", content:{ "application/json":{ schema:{ type:"object", properties:{ success:{type:"boolean"}, data:{ type:"array", items:{ "$ref":`#/components/schemas/${ref}` } }, pagination:{ "$ref":"#/components/schemas/Pagination" } } } } } } }
}
function okInline(schema: Record<string, unknown>) {
  return { "200":{ description:"Success", content:{ "application/json":{ schema:{ type:"object", properties:{ success:{type:"boolean"}, data:schema } } } } } }
}
const e = {
  r400: { "400":{ description:"Validation error", content:{ "application/json":{ schema:{ "$ref":"#/components/schemas/Error" } } } } },
  r401: { "401":{ description:"Unauthorized",     content:{ "application/json":{ schema:{ "$ref":"#/components/schemas/Error" } } } } },
  r404: { "404":{ description:"Not found",         content:{ "application/json":{ schema:{ "$ref":"#/components/schemas/Error" } } } } },
  r409: { "409":{ description:"Conflict",           content:{ "application/json":{ schema:{ "$ref":"#/components/schemas/Error" } } } } },
  r204: { "204":{ description:"No content" } },
}

// ─── Paths ────────────────────────────────────────────────────────────────────

const paths: Record<string, unknown> = {
  "/api/auth/me":                   { get:  { tags:["Auth"], security:auth, summary:"Current user",                  responses:{...ok("User"),...e.r401} } },
  "/api/auth/login":                { post: { tags:["Auth"], summary:"Sign in (email/password)",          requestBody:jsonBody(z.object({email:z.string().email(),password:z.string()})),  responses:{...okInline({type:"object",properties:{user:{"$ref":"#/components/schemas/User"},accessToken:{type:"string"}}}),...e.r400,...e.r401} } },
  "/api/auth/register":             { post: { tags:["Auth"], summary:"Register (email/password)",          requestBody:jsonBody(z.object({name:z.string(),email:z.string().email(),password:z.string().min(8)})),  responses:{...okInline({type:"object",properties:{user:{"$ref":"#/components/schemas/User"},accessToken:{type:"string"}}}),...e.r400,...e.r409} } },
  "/api/auth/google-signin":        { post: { tags:["Auth"], summary:"Create/update user via Google",      requestBody:jsonBody(z.object({email:z.string().email(),name:z.string(),googleId:z.string(),image:z.string().nullable().optional()})), responses:{...okInline({type:"object",properties:{user:{"$ref":"#/components/schemas/User"},accessToken:{type:"string"}}})} } },

  "/api/settings/branding":            { get:  { tags:["Branding"], security:auth, summary:"Get office branding",    responses:{...ok("OfficeBranding"),...e.r401} },
                                         patch: { tags:["Branding"], security:auth, summary:"Update branding fields", requestBody:jsonBody(updateBrandingSchema), responses:{...ok("OfficeBranding"),...e.r400,...e.r401} } },
  "/api/settings/branding/logo":       { post: { tags:["Branding"], security:auth, summary:"Upload logo (PNG/SVG/WEBP ≤5MB)",        requestBody:formBody(), responses:{...okInline({type:"object",properties:{url:{type:"string"},storagePath:{type:"string"}}}),...e.r400,...e.r401} } },
  "/api/settings/branding/logo-white": { post: { tags:["Branding"], security:auth, summary:"Upload white logo (PNG/SVG/WEBP ≤5MB)",  requestBody:formBody(), responses:{...okInline({type:"object",properties:{url:{type:"string"},storagePath:{type:"string"}}}),...e.r400,...e.r401} } },
  "/api/settings/branding/favicon":    { post: { tags:["Branding"], security:auth, summary:"Upload favicon (PNG/SVG/WEBP ≤5MB)",     requestBody:formBody(), responses:{...okInline({type:"object",properties:{url:{type:"string"},storagePath:{type:"string"}}}),...e.r400,...e.r401} } },

  "/api/clients":        { get:  { tags:["Clients"], security:auth, summary:"List clients",   responses:{...okList("Client"),...e.r401} },
                           post: { tags:["Clients"], security:auth, summary:"Create client",  requestBody:jsonBody(createClientSchema), responses:{...ok("Client"),...e.r400,...e.r401} } },
  "/api/clients/{id}":   { parameters:IdPath,
                           get:    { tags:["Clients"], security:auth, summary:"Get client",    responses:{...ok("Client"),...e.r401,...e.r404} },
                           put:    { tags:["Clients"], security:auth, summary:"Update client", requestBody:jsonBody(updateClientSchema), responses:{...ok("Client"),...e.r400,...e.r401,...e.r404} },
                           delete: { tags:["Clients"], security:auth, summary:"Delete client", responses:{...e.r204,...e.r401,...e.r404} } },

  "/api/opportunities":       { get:  { tags:["Opportunities"], security:auth, summary:"List opportunities — filter by stage/client", parameters:[{name:"stage",in:"query",schema:{type:"string"}},{name:"clientId",in:"query",schema:{type:"string"}}], responses:{...okList("Opportunity"),...e.r401} },
                                 post: { tags:["Opportunities"], security:auth, summary:"Create opportunity (probability auto-set)", requestBody:jsonBody(createOpportunitySchema), responses:{...ok("Opportunity"),...e.r400,...e.r401} } },
  "/api/opportunities/{id}":  { parameters:IdPath,
                                 get:    { tags:["Opportunities"], security:auth, summary:"Get opportunity with client + briefing", responses:{...ok("Opportunity"),...e.r401,...e.r404} },
                                 put:    { tags:["Opportunities"], security:auth, summary:"Update opportunity (stage → probability)", requestBody:jsonBody(updateOpportunitySchema), responses:{...ok("Opportunity"),...e.r400,...e.r401,...e.r404} },
                                 delete: { tags:["Opportunities"], security:auth, summary:"Delete opportunity", responses:{...e.r204,...e.r401,...e.r404} } },

  "/api/opportunities/{id}/briefing":       { parameters:IdPath,
                                              get: { tags:["Briefings"], security:auth, summary:"Get briefing",             responses:{...ok("Briefing"),...e.r401,...e.r404} },
                                              put: { tags:["Briefings"], security:auth, summary:"Upsert briefing",           requestBody:jsonBody(upsertBriefingSchema), responses:{...ok("Briefing"),...e.r400,...e.r401,...e.r404} } },

  "/api/opportunities/{id}/followups":      { parameters:IdPath,
                                              get:  { tags:["FollowUps"], security:auth, summary:"List follow-ups",          responses:{...okList("FollowUp"),...e.r401,...e.r404} },
                                              post: { tags:["FollowUps"], security:auth, summary:"Schedule follow-up",       requestBody:jsonBody(createFollowUpSchema), responses:{...ok("FollowUp"),...e.r400,...e.r401,...e.r404} } },
  "/api/opportunities/{id}/followups/{fid}":{ parameters:[...IdPath,{name:"fid",in:"path",required:true,schema:{type:"string"}}],
                                              patch:  { tags:["FollowUps"], security:auth, summary:"Update/complete follow-up", requestBody:jsonBody(updateFollowUpSchema), responses:{...ok("FollowUp"),...e.r400,...e.r401,...e.r404} },
                                              delete: { tags:["FollowUps"], security:auth, summary:"Delete follow-up",          responses:{...e.r204,...e.r401,...e.r404} } },

  "/api/proposals":           { get:  { tags:["Proposals"], security:auth, summary:"List proposals",              responses:{...okList("User"),...e.r401} },  // generic schema
                                 post: { tags:["Proposals"], security:auth, summary:"Create proposal",             responses:{...ok("User"),...e.r400,...e.r401} } },
  "/api/proposals/{id}":      { parameters:IdPath,
                                 get:    { tags:["Proposals"], security:auth, summary:"Get proposal",              responses:{...ok("User"),...e.r401,...e.r404} },
                                 put:    { tags:["Proposals"], security:auth, summary:"Update proposal",           responses:{...ok("User"),...e.r401,...e.r404} },
                                 delete: { tags:["Proposals"], security:auth, summary:"Delete proposal",           responses:{...e.r204,...e.r401,...e.r404} } },
  "/api/proposals/{id}/status":  { parameters:IdPath, patch: { tags:["Proposals"], security:auth, summary:"Update status (DRAFT→REVIEW→SENT→NEGOTIATION→APPROVED/REJECTED)", requestBody:jsonBody(z.object({status:z.string(),force:z.boolean().optional()})), responses:{...ok("User"),...e.r400,...e.r401,...e.r404} } },
  "/api/proposals/{id}/versions":{ parameters:IdPath, get:   { tags:["Proposals"], security:auth, summary:"List AI-generated versions",  responses:{...okList("User"),...e.r401,...e.r404} } },

  "/api/ai/generate-proposal": { post: { tags:["AI"], security:auth, summary:"Generate premium proposal — injects branding, adapts tone", requestBody:jsonBody(z.object({clientName:z.string(),projectType:z.string(),city:z.string().optional(),complexity:z.string().optional(),meetingNotes:z.string().optional()})), responses:{...okInline({type:"object",properties:{proposalId:{type:"string"},tone:{type:"string"},model:{type:"string"},tokensUsed:{type:"integer"}}}),...e.r400,...e.r401} } },

  "/api/pricing/regional":  { get:  { tags:["Pricing"], summary:"Regional pricing reference (state + projectType)", parameters:[{name:"state",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:2}},{name:"projectType",in:"query",schema:{type:"string"}},{name:"pricingMethod",in:"query",schema:{type:"string",enum:["HOURLY","SQUARE_METER"]}}], responses:{...okInline({type:"object",properties:{min:{type:"number"},max:{type:"number"},average:{type:"number"},suggested:{type:"number"}}})} } },
  "/api/pricing/calculate": { post: { tags:["Pricing"], security:auth, summary:"Calculate price with complexity multiplier", requestBody:jsonBody(calculatePricingSchema), responses:{...okInline({type:"object",properties:{subtotal:{type:"number"},complexityMultiplier:{type:"number"},total:{type:"number"}}}),...e.r400,...e.r401} } },

  "/api/locations/states": { get: { tags:["Locations"], summary:"All 27 Brazilian states", responses:{...okList("User")} } },
  "/api/locations/cities": { get: { tags:["Locations"], summary:"Cities for a state with search + pagination", parameters:[{name:"state",in:"query",required:true,schema:{type:"string",minLength:2,maxLength:2}},{name:"search",in:"query",schema:{type:"string"}},{name:"page",in:"query",schema:{type:"integer"}},{name:"limit",in:"query",schema:{type:"integer"}}], responses:{...okList("User")} } },
  "/api/cities":           { get: { tags:["Locations"], summary:"City autocomplete (min 2 chars, cross-state)", parameters:[{name:"q",in:"query",required:true,schema:{type:"string",minLength:2}},{name:"limit",in:"query",schema:{type:"integer",default:10}}], responses:{...okList("User")} } },

  "/api/dashboard": { get: { tags:["Dashboard"], security:auth, summary:"Revenue + pipeline aggregations", responses:{...ok("Dashboard"),...e.r401} } },
}

// ─── Final spec ───────────────────────────────────────────────────────────────

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title:       "ArchFlow API",
    version:     "2.0.0",
    description: "Revenue Operating System for Architecture Firms — schemas auto-generated from Zod via zod-to-json-schema",
  },
  servers: [
    { url: "http://localhost:3000",       description: "Development" },
    { url: "https://api.archflowstudio.com", description: "Production"  },
  ],
  tags: [
    { name:"Auth",          description:"Authentication — email/password + Google OAuth" },
    { name:"Onboarding",    description:"First-access workspace setup flow" },
    { name:"Settings",      description:"Workspace preferences" },
    { name:"Branding",      description:"Office identity — logo, colors, proposal footer" },
    { name:"Clients",       description:"Client CRM" },
    { name:"Opportunities", description:"Deal pipeline — LEAD→APPROVED/LOST" },
    { name:"Briefings",     description:"Project briefing per opportunity" },
    { name:"FollowUps",     description:"Follow-up scheduling" },
    { name:"Proposals",     description:"Proposal CRUD + status workflow" },
    { name:"AI",            description:"AI proposal generation" },
    { name:"Pricing",       description:"Hourly / m² pricing with regional reference" },
    { name:"Locations",     description:"Brazilian states + cities (IBGE)" },
    { name:"Dashboard",     description:"Pipeline + revenue aggregations" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: { type:"http", scheme:"bearer", bearerFormat:"JWT" },
    },
    schemas,
  },
  paths,
}
