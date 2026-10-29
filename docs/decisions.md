# Decisions

Important implementation decisions, newest on top. Each entry: date, decision, reasoning, alternatives considered.

The baseline technical and business decisions made before development started are in [initial-description.md](initial-description.md).

---

## 29.10. Step 3 (allowExit)

### Charges are calculated by a pure function, cron only refreshes stored values
- **Decision:** `calculateCharge(from, to)` in the shared package counts the full minutes between two times. Each minute is charged at the rate in effect when it started, walking from one 08:00/20:00 boundary to the next. The backend's `refreshParkingTotals(parking, now)` adds that charge to `total`, moves `latestTotalUpdate` forward **only by the charged minutes** (so leftover seconds are never lost), and switches `currentRate`, setting `latestRateChange` to the boundary where it switched. The exit uses it now. The hourly cron job (step 7) and the user's "refresh my car" action will call the same function.
- **Why:** the total is correct whether or not cron ran on time, and how often the refresh runs doesn't change the result. Both functions can be tested with fixed dates, without running cron.
- **Alternatives:** relying on cron alone to switch rates (correct only if it always runs on time, and hard to test).

### Exit and payment flow
- **Decision:** as agreed on 28.10 (an asynchronous terminal, polling, priority for the new car, timeout fallback). Implementation details:
  - **Routes:**
    - `POST /api/new-exit`: answers `awaiting_payment` with the payment id and total, or `denied` with `no_active_parking` / `terminal_unavailable`
    - `POST /api/payment-result`: the terminal reports the result
    - `GET /api/payments/:paymentId`: the bar post's polling
    - All three are behind the API key.
  - **The terminal mock** receives sessions at `POST /sessions` and answers 202 right away.
  - **Successful payment:** the parking becomes `finished`, but the space stays `occupied` until the car actually leaves (step 4).
  - **A late `success`** for a payment that's no longer pending is ignored with a **critical** log: the driver may have paid for nothing. A late `cancelled`/`failed` is only a non-critical log.
  - **A pending payment counts as stale** after `paymentSessionTimeoutMinutes` + `paymentResultGraceSeconds` (5 min + 30 s, both in the shared config). The bar post waits a few seconds longer than that, so it always sees the main app's fallback result.
  - **Plan case 4** (several active parkings for one car) can't happen because of the one-open-parking-per-car index, so it isn't handled.
- **The terminal mock is built on Node's `http` module**, not Fastify: it has a single route, so it doesn't need a framework.

### Partial index conditions are written the way Postgres stores them
- **Decision:** the `where: raw(...)` conditions in `schema.prisma` use Postgres' own normalized form, `(status = ANY (ARRAY['booked'::"ParkingStatus", ...]))`, instead of `status IN (...)`.
- **Why:** Prisma compares the schema text with the condition Postgres stores. Postgres rewrites `IN (...)` to `= ANY (ARRAY[...])`, so with the shorter form every new migration would drop and recreate the indexes.

### Creating migrations without touching the development database
- **Decision:** when the agent creates a migration, it generates the SQL with `prisma migrate diff --from-config-datasource --to-schema` against the **test** database (which has every migration applied) and saves it as a new migration folder. The user applies it to the development database with `db:migrate`.
- **Why:** `prisma migrate dev` doesn't work non-interactively, and the development database is the user's.

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
- **Decision:** an atomic conditional update inside a transaction: `UPDATE space SET status='booked', relatedVehicle=? WHERE id=? AND status='vacant'`, then check the number of affected rows (0 means someone got there first). As a safety net, partial unique indexes in the DB: one `booked`/`active` parking per space, and one per car. They're defined in `schema.prisma` with Prisma's `partialIndexes` preview feature (`@@unique([...], where: raw("status IN ('booked', 'active')"))`), so Prisma generates them in migrations itself.
- **Why:** simple, with no explicit locks held, and enforced by the database itself. Keeping the indexes in the schema (instead of a hand-written SQL migration) stops Prisma from seeing them as drift and generating migrations that drop them.
- **Caveat:** because of these indexes, the generated client accepts `spaceId` and `vehicleRegNumber` in `findUnique`/`upsert`. Never look up parkings that way: the uniqueness only holds for open parkings, so always filter by status with `findFirst`/`findMany`/`updateMany`.
- **Alternatives:** pessimistic row locking (`SELECT … FOR UPDATE`); a raw SQL migration for the indexes (the original plan, replaced once it turned out Prisma 7 supports partial indexes).

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
- **Decision:** 6 spaces named A1–A3 and B1–B3, created by an idempotent seed script (`createMany` with `skipDuplicates`).

### Setup details
- **Prisma 7.10.1**, with `prisma` and `@prisma/client` pinned to the exact same version. npm's `latest` tag for `prisma` pointed to an 8.0 release candidate, which didn't match the client. Prisma 7 needs a driver adapter (`@prisma/adapter-pg` + `pg`), and its config lives in `prisma.config.ts`.
- **One `.env` in the repo root**, read by every app (and by `prisma.config.ts`). The backend validates its env with Zod at startup (`src/env.ts`).
- **Two Postgres containers:** `db` (port 5432, persistent volume) for development and `db-test` (port 5433, in-memory) for tests.
- **Timestamps** are `timestamptz`, so stored times are unambiguous whatever the server's timezone.
- **Registration numbers** are trimmed and uppercased by the shared Zod schema before validation (1–15 characters), so `xx000xx ` and `XX000XX` are the same car.
- **Parking** got an `updatedAt` field, which isn't in initial-description.md, for consistency with the other models.
- **The workspace's TypeScript files import each other without file extensions** (`moduleResolution: bundler`). The code runs through tsx and Vitest and is never compiled by `tsc`, which only checks types.

### A car that's already inside is denied entrance
- **Decision:** if a space is `occupied` by the car approaching from the outside, the main system denies entrance (`reason: "vehicle_already_inside"`) and emits a critical log.
- **Why:** a car can't physically be inside and at the entrance at the same time, so the data is wrong (most likely the exit wasn't registered) and support must look into it. Booking another space would also violate the one-open-parking-per-car index. This covers the assignment's "entering the lot twice" requirement.
- **Alternatives:** letting the car in anyway (keeps the driver moving, but hides the inconsistency and leaves the lot's state wrong).

### Walk-in booking details
- **Decision:** the vacant spaces are tried in `displayName` order (A1 first). If a space is taken between the read and the update, the next vacant one is tried, and the car is denied only when none are left. If creating the parking fails because the car already has an open parking (with no space booked or occupied for it), a critical log is emitted and the request fails with a 500, which the bar post shows as "not working".
- **Why:** a race for one space shouldn't turn a car away while other spaces are free. The failing case is inconsistent data that support needs to fix.

### Device API: auth, validation and responses
- **Decision:** the device routes live in one Fastify plugin with an `onRequest` hook that checks `x-api-key` (compared through SHA-256 hashes with `timingSafeEqual`, which avoids leaking the key through timing). An invalid or missing key gets a 401. Bodies are validated with the shared Zod schemas through `safeParse` in the handler, and an invalid body gets a 400. A valid request always gets a 200 with `{ allowed: true }` or `{ allowed: false, reason }`.
- **Why:** no extra packages. The plugin scope keeps the key check off the future frontend routes.
- **Alternatives:** `fastify-type-provider-zod` (validates through route schemas, but it's one more dependency for a handful of routes).

### Bar post mock details
- **Decision:** `pnpm bar-post --reg <regNumber> --direction in|out`, built with Commander. The mock doesn't validate the registration number itself: it passes whatever "the camera read" to the main app, so the main app's validation can be tried out by hand. Requests time out after 5 seconds. Any error, timeout or non-2xx response shows "The bar post isn't working". The env is read from the root `.env` with Node's built-in `process.loadEnvFile`, so there's no dotenv dependency. `out` prints "not supported yet" until `/api/new-exit` exists, and the follow-up `/api/new-parking` call is added in step 2.

### /api/new-parking (step 2): how the cases are handled
- **Decision:** the bar post sends `{ regNumber, time }` after opening. The main app finds the car's open parking (`booked` or `active`; the index allows at most one) and acts on it:
  - **booked parking, its space booked for this car:** the parking becomes `active` with `activeSince`/`latestRateChange`/`latestTotalUpdate` set to the entrance time and the rate for that time; the space becomes `occupied`.
  - **booked parking, its space vacant or already occupied by this car:** same, plus a non-critical log.
  - **booked parking, its space held by another car:** the parking is `cancelled`, the space is left alone, critical log (as planned; the car stays in the lot without a parking until support resolves it).
  - **no parking, but a space is booked or occupied for this car:** an `active` parking is created on that space, non-critical log.
  - **no parking and no space for the car** (the General flow's 3b/3c): the first vacant space is claimed with the same atomic update as in new-entrance, and occupied right away, non-critical log. If there's no vacant space: critical log and a 409.
  - **the parking is already active** (e.g. the bar post sent the call twice): nothing changes, non-critical log.
- **Malformed input:** a missing, malformed or future time (more than 1 minute ahead, to allow for clock skew) is replaced with the current time, non-critical log. An invalid registration number gets a 400 and a critical log.
- **Responses:** 204 for every handled case and 409 when there's no space. The bar post only prints errors.
- **Plan case 6 (several booked parkings for one car) isn't handled**, because the one-open-parking-per-car index makes it impossible. Tests prove that the database rejects it instead.
- **Why:** follows the implementation plan. The extra cases make repeated or out-of-order calls safe.
- **Known gap:** activation checks that the parking is still `booked` and fails with a 500 if it isn't. Once booking expiry and cancellation exist (steps 6 and 8), an expiry that lands at the same moment as an entrance must be looked at again.

### Step 3 (allowExit) design: the terminal answers asynchronously
- **Decision:** the main app sends `{ paymentId, total }` to the terminal, which accepts it right away. The terminal posts the result (`success`/`cancelled`/`failed`) to the main app later. The main app answers the bar post's `/api/new-exit` right away with "awaiting payment".
  - **The bar post learns the result by polling:** it asks the main app every 2 seconds, for up to the payment session timeout. The timeout (`paymentSessionTimeoutMinutes = 5`) is in the shared config, so all apps use the same value.
  - **Timeout safety net:** the terminal reports `cancelled` after 5 minutes without input. As a fallback (e.g. the terminal crashed), the main app treats a payment still `pending` after the timeout plus a short margin as `cancelled` whenever it's checked.
  - **Terminal unreachable** when the main app sends the total: the payment is `failed`, with a critical log, and the bar post shows that the terminal isn't working.
  - **Same car calls new-exit while its payment is pending:** the existing payment is returned, and no new one is created.
  - **A new car arrives while another car's payment is pending** (e.g. the first car backed away without cancelling): the new car has priority. The old pending payment is `cancelled`, with a non-critical log, the terminal drops the old session and starts the new one, and any late result for the old payment is ignored.
  - **The terminal mock becomes a long-running process:** a small server on its port that receives sessions, plus a prompt to type the status.
- **Why:** more realistic than holding requests open for minutes. Polling is the simplest way for a mock bar post to get the result.
- **Alternatives:** holding the requests open until the payment ends (simplest, less realistic); long polling, or a callback server in the bar post (rejected as overengineering).

### Charging full minutes only
- **Decision:** only full minutes are charged (10:01:00 to 11:00:30 is 59 minutes).

### One pending or successful payment per parking
- **Decision:** a partial unique index on `Payment(parkingId) WHERE status IN ('pending', 'success')`, like the parking indexes.

### Shared booking logic
- **Decision:** "claim the first vacant space with the atomic update and create a parking" lives in one function (`claimVacantSpace`) used by both new-entrance (books the space) and new-parking (occupies it right away).

### Backend testing approach
- **Decision:** integration tests run through `app.inject` against the real test Postgres (`db-test`). Vitest's global setup applies the migrations with `prisma migrate deploy`. Each test truncates the tables and recreates the 6 spaces, and test files run one at a time.
- **Why:** the main risks (concurrent bookings, the partial unique indexes) live in the database and can't be checked with mocks. The tests include two concurrency cases: two cars racing for the last space, and 10 cars arriving at an empty 6-space lot. Log expectations (critical and non-critical) are checked by sending the app's logs into an in-memory list in tests.
- **Day/night rate logic** (`getRateTypeAt`) lives in the shared package, so the frontend can use it later, and has its own unit tests around the 08:00 and 20:00 boundaries in UTC+4.
