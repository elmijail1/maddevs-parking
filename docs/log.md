
28.10. Set up AI agent context:
- AGENTS.md: agent working rules (no code without confirmation, no package installs, no Git) and pointers to context files
- CLAUDE.md: refers to AGENTS.md
- docs/decisions.md: a file for important implementation decisions
- Agreed on the initial architecture and step 1 (allowEntrance) decisions, recorded in decisions.md: pnpm workspace layout, minimal DB-less CLI mocks for the bar post and payment terminal, Postgres in Docker, no Vehicle foreign key on parkings, atomic conditional booking, money in cents with rates in a shared config (UTC+4), pino logging, space seeding.
- Decided on API key auth for the mock devices and a one-shot CLI for the bar post (no server, no port).
- Renamed the app directories to match the workspace layout (main-app, bar-post-mock-app, payment-terminal-mock-app) and added packages/shared.

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