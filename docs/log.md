
29.10. Step 3 (allowExit):
- Added the charge calculation to the shared package: full minutes only, split at the 08:00/20:00 rate boundaries, plus money formatting, with unit tests.
- Added refreshParkingTotals in the backend: an idempotent total refresh that the exit, the future cron job and user clicks will share.
- Added the Payment model with the "one pending/successful payment per parking" partial index (migration `payments`), and rewrote the partial index conditions in Postgres' normalized form so migrations stay clean.
- Added the exit routes: POST /api/new-exit, POST /api/payment-result, GET /api/payments/:paymentId (stale pending payments are cancelled when checked, a new car's payment takes priority).
- Added 48 backend tests for the exit flow, payment results, polling, payment constraints and total refreshes (89 tests in total, all passing).
- Added the payment terminal mock: a long-running process with a /sessions endpoint, a prompt for the result and a 5-minute timeout.
- The bar post now handles exits: it shows the total, polls the payment status and opens or stays closed.

28.10. Set up AI agent context:
- AGENTS.md: agent working rules (no code without confirmation, no package installs, no Git) and pointers to context files
- CLAUDE.md: refers to AGENTS.md
- docs/decisions.md: a file for important implementation decisions
- Agreed on the initial architecture and step 1 (allowEntrance) decisions, recorded in decisions.md: pnpm workspace layout, minimal DB-less CLI mocks for the bar post and payment terminal, Postgres in Docker, no Vehicle foreign key on parkings, atomic conditional booking, money in cents with rates in a shared config (UTC+4), pino logging, space seeding.
- Decided on API key auth for the mock devices and a one-shot CLI for the bar post (no server, no port).
- Renamed the app directories to match the workspace layout (main-app, bar-post-mock-app, payment-terminal-mock-app) and added packages/shared.
- Set up the pnpm workspace and installed the root, shared and backend dependencies (Prisma pinned to 7.10.1).
- Added the workspace config: docker-compose (dev + test Postgres), .env.example, tsconfig.base.json, .gitignore.
- Added the shared package: business config (rates, day hours, UTC+4, booking expiration) and Zod schemas (statuses, regNumber, direction, new entrance request/response).
- Added the backend foundation: Prisma schema (Space, Vehicle, Parking with partial unique indexes), prisma.config.ts, env validation, Prisma client setup, space seed script.
- Added the first endpoint, POST /api/new-entrance (allowEntrance): Fastify app and server, API key check for device routes, booking a vacant space safely under concurrent requests, denying cars that are already inside.
- Added the shared day/night rate function (getRateTypeAt) with unit tests.
- Added backend integration tests against the test database: the 5 planned step 1 cases plus already-inside, two concurrency cases, regNumber normalization, invalid bodies and API keys (20 tests in total, all passing).
- Added the bar post mock: a one-shot Commander CLI (`pnpm bar-post --reg ... --direction in|out`) that calls /api/new-entrance and prints whether the bar opens.
- Added step 2, POST /api/new-parking (handleNewParking): activates the booked parking and occupies the space, handles the inconsistent cases from the plan plus entrances without any booking and repeated calls. The bar post now calls it after opening.
- Moved the "claim a vacant space" logic into one shared function used by both endpoints.
- Added 21 tests for new-parking and the open-parking constraints, with log checks (41 tests in total, all passing). Checked the whole entrance flow end to end with the real server and the bar post CLI.
- Agreed on most of the step 3 (allowExit) design: the terminal answers asynchronously, the bar post polls for the result, full minutes only, timeout fallback, a new car's payment takes priority over a stale pending one, one pending/successful payment per parking.

27.10. Prepared context files:
- assignment.md
- initial-description.md
- implementation-plan.md
- log.md

26.10. Made diagrams describing main parts of the app:
- General flow
- Entering & exiting
- Booking and cancelling a booking
- Drawing the parking lot diagram