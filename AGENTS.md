# Instructions for AI agents

## Working rules
- Do not start writing code unless the user confirms or explicitly asks you to. Discuss and propose first.
- Do not install packages. Recommend them instead and provide the exact installation commands for the user to run.
- Do not commit or touch Git in any way (no commits, branches, staging, stashes, resets, etc.) unless the user explicitly asks.
- Write as few comments as possible, in code and config files alike. Add one only when something truly can't be understood without it.
- When starting a server yourself for a check, point it at the test database (`DATABASE_URL` = `TEST_DATABASE_URL`) so the user's development data stays untouched, and stop it by its port afterwards (`kill $(lsof -t -iTCP:<port> -sTCP:LISTEN)`). Killing the `pnpm`/`tsx` wrapper leaves the Node process running.

## Project context
Read these before working on the project:
- [docs/assignment.md](docs/assignment.md) – the original assignment: requirements, stack, expected results
- [docs/initial-description.md](docs/initial-description.md) – technologies, data models, business flows, UI
- [docs/implementation-plan.md](docs/implementation-plan.md) – main functions and the order they're built in
- [docs/decisions.md](docs/decisions.md) – important implementation decisions made during development
- [docs/log.md](docs/log.md) – a log of what was done and when

Repo layout (pnpm workspace):
- `main-app/backend` – the main system (Node.js, Fastify, Prisma, PostgreSQL in Docker)
- `main-app/frontend` – the user-facing app (React)
- `bar-post-mock-app` – a minimal mock of the bar post: a CLI taking `regNumber` + `direction`, no DB
- `payment-terminal-mock-app` – a minimal mock of the payment terminal: a CLI taking a payment status, no DB
- `packages/shared` – Zod schemas, types, and business config (rates, timezone) used by all apps

Only the main app is built fully; keep the mocks as simple as possible.

## Commands
- `pnpm db:up` / `pnpm db:down` – start / stop the Postgres containers
- `pnpm typecheck` – type-check all packages
- `pnpm test` – run all tests (the backend's need the `db-test` container running). Don't pass file filters to it: it runs every package's `test` script with the same args, and packages without a match fail
- `pnpm --filter @parking/backend test <file-substring>` / `-t "<test name>"` – run selected backend tests
- `pnpm bar-post --reg XX000XX --direction in|out` – simulate a car at the bar post (needs the backend running; exits also need the payment terminal)
- `pnpm payment-terminal` – start the payment terminal mock (stays running, type the payment result when a session arrives)
- `pnpm --filter @parking/backend dev` – run the main backend with reload on change
- `pnpm --filter @parking/backend db:migrate` – create and apply migrations
- `pnpm --filter @parking/backend db:generate` – regenerate the Prisma client
- `pnpm --filter @parking/backend db:seed` – seed the spaces

## Maintaining the context files
- **docs/log.md**: after finishing a piece of work (a feature, a setup step, a context update), add a short entry describing what was done. Newest entries go on top, dated `DD.MM.`. There's only one entry per date: if today's entry already exists, add a bullet to its list instead of creating a new dated entry.
- **docs/decisions.md**: when the user and the agent agree on an important implementation decision, record it: the date, what was decided, why, and the alternatives considered. Newest entries go on top.
