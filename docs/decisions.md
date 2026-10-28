# Decisions

Important implementation decisions, newest on top. Each entry: date, decision, reasoning, alternatives considered.

The baseline technical and business decisions made before development started are in [initial-description.md](initial-description.md).

---

## 28.10. Initial architecture and step 1 (allowEntrance) decisions

### Workspace structure
- **Decision:** a pnpm workspace with these apps:
  - `main-app/backend`: the main system (Fastify, Prisma, PostgreSQL)
  - `main-app/frontend`: the user-facing React app
  - `bar-post-mock-app`: a mocked bar post, a separate app
  - `payment-terminal-mock-app`: a mocked payment terminal, a separate app with its own port
  - `packages/shared`: a shared package with Zod schemas, TypeScript types and the business config (see "Money, rates and time") used by all the apps
- **Why:** one source of truth for contracts between the apps, with no duplication or drift.
- **Alternatives:** fully separate projects, each with its own copy of the contracts. That's closer to a real-world setup, where the bar post and terminal would be third-party systems, but it's needless overhead for this assignment.

### Mock apps (bar post and payment terminal)
- **Decision:** only the main app is built fully. The bar post and payment terminal are minimal mocks and have **no databases**.
  - **Bar post:** a one-shot CLI command per car (e.g. `pnpm bar-post --reg XX000XX --direction in`): it runs, prints the result and exits. `direction` decides the endpoint the number goes to: `in` goes to `/api/new-entrance`, `out` goes to `/api/new-exit`. The response is printed as the bar post's UI message (opened, or closed with a reason). It then sends the follow-up calls (`/api/new-parking`, `/api/space-vacant-again`). It only sends requests and never receives them, so it has **no server and no port**.
    - *Alternative:* a long-running interactive prompt that reads `XX000XX in` line by line. Rejected because the one-shot command is simpler and easy to script for testing.
  - **Payment terminal:** receives a total from the main system, waits for a CLI input of the payment status (`success`, `cancelled` or `failed`), and returns that result to the main system.
  - Passthrough and POSPayment objects aren't stored, since the mocks have no DB. At most they're logged to the console.
- **Why:** the assignment is about the parking service. The physical devices only need to provide realistic inputs and outputs to the main system.
- **Alternatives:** full apps with their own DBs and UIs (as originally described in initial-description.md). Real terminals would read a bank card instead of a typed status.

### Authenticating the mock devices
- **Decision:** a shared API key. The main app reads `SERVICE_API_KEY` from its `.env`. A Fastify hook on the device routes (`/api/new-entrance`, `/api/new-exit`, `/api/new-parking`, `/api/space-vacant-again`) rejects requests that don't have a matching `x-api-key` header. The mocks read the same key from their own `.env` and send it. The same applies to the main app's calls to the payment terminal.
- **Why:** it stops anyone (e.g. the frontend or a random request) from opening the gate or creating parkings, and it's only a few lines of code.
- **Alternatives:** no auth on the device routes (simpler but open), mTLS or signed requests (realistic but too complex for mocks).

### Database for development
- **Decision:** PostgreSQL runs in Docker (docker-compose).
- **Why:** easy to run the app locally on any machine with one command.

### Parking isn't linked to Vehicle by a foreign key
- **Decision:** `Parking.vehicleRegNumber` (and `Space.relatedVehicle`) is a plain string with no foreign key to `Vehicle`. A `Vehicle` row exists only once a user has added the car through the app.
- **Why:** cars without an account must be able to enter, and the gate can't provide a VIN or registration certificate number. The Vehicle model only exists to let users who have verified the car (VIN + certificate) see its parking state. That isn't strong protection against tracking, but it's enough for this app.

### Preventing double booking of a space
- **Decision:** an atomic conditional update inside a transaction: `UPDATE space SET status='booked', relatedVehicle=? WHERE id=? AND status='vacant'`, then check the number of affected rows (0 means someone got there first). As a safety net, partial unique indexes in the DB: one `booked`/`active` parking per space, and one per car (added through a raw SQL migration, since Prisma doesn't support partial unique indexes in its schema).
- **Why:** simple, with no explicit locks held, and enforced by the database itself.
- **Alternatives:** pessimistic row locking (`SELECT … FOR UPDATE`).

### Money, rates and time
- **Decision:**
  - All money is stored as **integer cents**.
  - The base rate, multipliers and timezone live in a **config file in the shared package**, readable by both backend and frontend:
    - base rate: **10 cents per minute** (stored per minute)
    - day multiplier: **2** (08:00–20:00), i.e. 20 cents/min = $12/hour
    - night multiplier: **1** (20:00–08:00), i.e. 10 cents/min = $6/hour
    - timezone: a fixed **UTC+4** offset (matches the developer's timezone for easier testing; a fixed offset also means no daylight saving edge cases)
- **Why:** integers avoid floating point rounding errors. These values won't change while the app is used, so a config file is enough.
- **Alternatives:** storing rates in a DB table so the business can change them at runtime (more realistic, but not needed here).

### Logging
- **Decision:** Fastify's built-in logger (pino). Critical logs (support must react) use the `error` level with a `critical: true` field. Non-critical logs use the `warn` level.
- **Why:** no extra infrastructure. pino supports transports, so logs can be sent to a DB (or anywhere else) later without changing the code that writes them.
- **Alternatives:** a dedicated log table or service.

### Walk-in entrance without a later new-parking call
- **Decision:** accept the gap. If a car without a booking gets a "yes" from `/api/new-entrance` (a space gets booked for it) but `/api/new-parking` never arrives, the booking stays until it expires normally after 15 minutes (the expiry worker comes in a later step).
- **Why:** it behaves exactly like a normal booking, and the window is short enough not to matter.

### Spaces
- **Decision:** 6 spaces named A1–A3 and B1–B3, created by a seed script.
