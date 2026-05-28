# ArchFlow — Backend API

Backend for **ArchFlow**, a Micro SaaS that helps architects manage client proposals and monitor infrastructure instances.

## Stack

- **Next.js 16** — API Routes
- **TypeScript** — strict mode
- **Prisma ORM** — MongoDB driver
- **MongoDB** — database
- **JWT** — access token (15min) + refresh token (7d)
- **Bcrypt** — password hashing
- **Zod** — request validation
- **Swagger UI** — interactive docs at `/docs`

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/rennan313/ArchFlow_BackEnd.git
cd ArchFlow_BackEnd
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL="mongodb+srv://<user>:<password>@cluster.mongodb.net/archflow"

JWT_SECRET="your-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

RESET_PASSWORD_EXPIRES_IN_MINUTES=30

NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Push schema to MongoDB

```bash
npm run db:push
```

### 4. Run in development

```bash
npm run dev
```

API available at `http://localhost:3000`  
Swagger UI at `http://localhost:3000/docs`

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # register, login, refresh, forgot/reset password, me
│   │   ├── proposals/     # CRUD with pagination and filters
│   │   ├── instances/     # list, detail, metrics
│   │   └── docs/          # serves OpenAPI JSON spec
│   └── docs/              # Swagger UI page
├── lib/
│   ├── prisma.ts          # Prisma singleton
│   ├── jwt.ts             # sign / verify tokens
│   ├── hash.ts            # bcrypt helpers
│   ├── response.ts        # standardized HTTP responses
│   ├── pagination.ts      # pagination utilities
│   └── openapi.ts         # OpenAPI 3.0 spec
├── middlewares/
│   └── auth.ts            # withAuth / withAdminAuth HOF
├── repositories/          # raw Prisma queries per model
├── services/              # business logic
├── validations/           # Zod schemas
├── utils/
│   └── serviceError.ts    # maps domain errors → HTTP responses
└── types/
    └── index.ts
prisma/
└── schema.prisma
docs/
└── FRONTEND_INTEGRATION.md   # full frontend integration reference
```

---

## API Endpoints

### Auth

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login, receive tokens |
| POST | `/api/auth/refresh` | No | Refresh access token |
| POST | `/api/auth/forgot-password` | No | Request reset link |
| POST | `/api/auth/reset-password` | No | Set new password |
| GET | `/api/auth/me` | Yes | Current user |

### Proposals

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/proposals` | Yes | List (paginated, filterable) |
| POST | `/api/proposals` | Yes | Create |
| GET | `/api/proposals/:id` | Yes | Get by ID |
| PUT | `/api/proposals/:id` | Yes | Update |
| DELETE | `/api/proposals/:id` | Yes | Delete |

### Instances

| Method | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/instances` | Yes | List (paginated, filterable) |
| GET | `/api/instances/:id` | Yes | Get by ID |
| GET | `/api/instances/:id/metrics` | Yes | CPU, memory, uptime snapshot |

### Query Params (list routes)

```
?page=1&limit=10&search=keyword&status=DRAFT&sortBy=createdAt&sortOrder=desc
```

---

## Authentication

Login returns two tokens:

```json
{
  "accessToken":  "<jwt — expires 15min>",
  "refreshToken": "<jwt — expires 7d>"
}
```

Pass the access token in the `Authorization` header on every protected request:

```
Authorization: Bearer <accessToken>
```

When the access token expires, call `POST /api/auth/refresh` with the refresh token to get a new pair.

---

## Response Format

All responses follow the same envelope:

```json
{
  "success": true,
  "data": {},
  "message": "optional message",
  "pagination": { "total": 42, "page": 1, "limit": 10, "totalPages": 5 }
}
```

Errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": { "email": ["Invalid email address"] }
}
```

---

## Available Scripts

```bash
npm run dev          # start development server
npm run build        # production build
npm run start        # start production server
npm run db:push      # sync Prisma schema to MongoDB
npm run db:studio    # open Prisma Studio (DB browser)
npm run db:generate  # regenerate Prisma client
```

---

## Frontend Integration

See [`docs/FRONTEND_INTEGRATION.md`](docs/FRONTEND_INTEGRATION.md) for the complete reference including:

- All request bodies and response shapes
- TypeScript types ready to use
- Axios and SWR setup with automatic token refresh
- Auth flow step-by-step
- Error handling patterns
