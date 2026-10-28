
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