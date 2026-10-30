
30.10. Step 10 (cancelling a booking):
- Agreed on the step 10 details: the cancelled parking keeps its time fields, a confirmation before cancelling, entering after a cancellation is treated as entering without a booking (and expiry will be postponed when a booked car is let in, in step 11). Updated implementation-plan.md (steps 10 and 11).
- Added POST /api/bookings/:parkingId/cancel (owner check, conditional updates, SSE announcement) and the entrance fallback for a booking cancelled after the car was let in. 9 new backend tests (196 in total).
- Made the charge tests compute amounts from the configured rates, after the base rate was changed to 2¢ a minute.
- Enabled Cancel booking on /spaces with a confirmation dialog, the "Booking cancelled" message and the "can no longer be cancelled" case. 5 new frontend tests (109 in total). Checked cancelling, another user's attempt and the SSE update through the Vite proxy.
- Added a "Working on a step of the implementation plan" section to AGENTS.md: summarize the step, propose what to build and ask at least 3 questions before coding; afterwards list what was done, what to run, and how to live-check it.
- Step 11 (booking reminders and automatic expiry): agreed on the details (all users with the car get the reminder, including bar-post bookings; a separate email mock; both jobs scheduled at once and cancelled on entry; expiry 30 s after the expiry time plus a 2-minute in-memory postponement when a booked car is let in). Updated implementation-plan.md and added two future ideas (parkings linked to users, a notifications model).
- Added the email service mock app (`pnpm email-service`), an in-memory scheduler, the booking reminder and expiry jobs (scheduled on booking and walk-in bookings, cancelled on entry, cancellation and exit, rebuilt on startup), and the expiry postponement on entrance. 20 new backend tests (216 in total). Checked startup rescheduling, an overdue expiry and a reminder with real timers against the test DB.
- Step 12 (tracing a parking): agreed on refreshing only when the dialog opens (a refresh button went to future-ideas.md), showing the counted full minutes instead of an "as of" time, a short note on the next rate, and an hourly worker for all active parkings. Updated implementation-plan.md.
- Added POST /api/parkings/:parkingId/refresh, conditional total writes (also used by the exit), the hourly refresh job, `formatDuration` and the parking totals schema. 10 new backend tests (226 in total), 8 shared (71).
- Replaced the parked-car placeholder dialog on /spaces with the totals dialog (spinner, error with Try again, "no longer in the lot"). 4 new frontend tests (113 in total). Checked the refresh through the Vite proxy with a car parked via the bar post.
- Step 13 (parking history): agreed on showing all statuses, the entry or booking date, "Paid: …" or "Left without paying" only on finished parkings, and the page in the URL. Updated implementation-plan.md.
- Added GET /api/history (active cars, parkings since each car's latest addition, newest first, 10 per page, successful payments), the history schemas and `formatLotDateTime`. 12 new backend tests (238 in total), 1 shared (72).
- Added the /history page (cards with status chips, pagination at the top and bottom, page in the URL, empty, loading and error states) and the "History" header link. 12 new frontend tests (125 in total). Checked both pages, a paid and an unpaid parking, and invalid requests through the Vite proxy.
- Made the header sticky, so it stays at the top of the viewport when scrolling (e.g. a long history page).
- Replaced the history pagination with an infinite list (10 at a time, loaded on scrolling to the end or with Load more) and did the same for My Cars; both APIs now use cursors (`?cursor=` / `nextCursor`), the page titles are sticky, and the booking dialog fetches all the user's cars. Updated implementation-plan.md (steps 8 and 13). 3 new backend tests (241 in total), 6 shared (78), 128 frontend tests in total. Checked loading 13 cars and 23 parkings by cursor through the Vite proxy.
- Limited users to 20 active cars (checked in a transaction that locks the user's row, so parallel adds can't pass it) and made the booking dialog's car list a scroll box showing 3-4 cars. Updated implementation-plan.md (steps 8 and 9). 4 new backend tests (245 in total), 1 frontend (129).
- Step 14 (several bookings and parkings per user): reviewed what was already covered and found two gaps. Highlighted spaces now show the car's display name and registration number, and parked cars' spaces are green (booked ones stay yellow). Added future ideas: a limit on simultaneous bookings, and tighter cancelling with parkings linked to users. Updated implementation-plan.md (steps 12 and 14). 3 new backend tests (248 in total), 5 frontend (134).
- Text fields no longer accept more characters than their limits (maxLength from the shared limits): email 100, passwords 30, registration and certificate numbers 15, VIN 17, display name 20. Replaced the frontend tests that typed too-long values with tests that the fields stop at the limit (135 frontend tests in total).
- Step 15 (concurrency and multiple tabs): reviewed what was covered and found four gaps. Added cross-tab syncing of logout, login and email changes (`BroadcastChannel`), a "Live updates paused, reconnecting…" notice with automatic reconnecting (checking the session, 3–30 s backoff), two-tab frontend tests for the plan's cases and the syncing, and future ideas for several backend instances and Playwright end-to-end tests. Updated implementation-plan.md (step 15, case 4). 9 new frontend tests (144 in total).
- Fixed the live-updates notice not appearing when the backend stops: through the Vite proxy the stream stayed open without an error. The server now sends a `heartbeat` event every 5 s and the page treats 12 s of silence as a lost connection; a failed session re-check while the backend is down no longer replaces the page. 1 new backend test (249 in total), 2 frontend (146). Checked the heartbeats and their stop through the Vite proxy.
- The "Live updates paused" notice now floats below the header (fixed, centred) instead of pushing the diagram down.
- Filled in the README: technology versions, step-by-step local setup, 5 main features and 3 limitations.

29.10. Step 3 (allowExit):
- Added the charge calculation to the shared package: full minutes only, split at the 08:00/20:00 rate boundaries, plus money formatting, with unit tests.
- Added refreshParkingTotals in the backend: an idempotent total refresh that the exit, the future cron job and user clicks will share.
- Added the Payment model with the "one pending/successful payment per parking" partial index (migration `payments`), and rewrote the partial index conditions in Postgres' normalized form so migrations stay clean.
- Added the exit routes: POST /api/new-exit, POST /api/payment-result, GET /api/payments/:paymentId (stale pending payments are cancelled when checked, a new car's payment takes priority).
- Added 48 backend tests for the exit flow, payment results, polling, payment constraints and total refreshes (89 tests in total, all passing).
- Added the payment terminal mock: a long-running process with a /sessions endpoint, a prompt for the result and a 5-minute timeout.
- The bar post now handles exits: it shows the total, polls the payment status and opens or stays closed.
- Added step 4, POST /api/space-vacant-again (handleCarExit): frees every space related to the leaving car, cancels its booked parking on them, finishes an unpaid active parking with a critical log. The bar post calls it after opening for an exit.
- Added 16 tests for space-vacant-again (the 6 plan cases plus unpaid parkings, repeated calls, re-entering, invalid bodies and API keys; 105 tests in total, all passing). Checked entrance → paid exit → re-entrance end to end with the real servers.
- Agreed on the step 5 design (SSE for live updates, no relatedVehicle in public space data, Vite + React + React Router + MUI + Tailwind) and set up the frontend package; the user installed its dependencies.
- Added GET /api/spaces and the SSE stream GET /api/spaces/events: the whole list on connect and after every change from new-entrance, new-parking and space-vacant-again, sent only when it actually changed. 5 backend tests (90 backend tests in total).
- Added the frontend: the parking lot diagram at /spaces (two rows of spaces across a driveway, loading and error states, the space details dialog with rates, the booking dialog with regNumber validation and a non-working "Book for ..." button), live updates through SSE into the TanStack Query cache. 11 frontend tests, including the plan's two cases. Checked the stream through the Vite proxy with the real backend and the bar post.
- Agreed on the step 6 (user authentication) design: a 14-day JWT in an httpOnly cookie, scrypt password hashes, shared validation rules, protected spaces routes. Added rate limiting to future-ideas.md. The user installed `@fastify/jwt` and `@fastify/cookie`.
- Added the User model (migration `users`), the shared auth schemas (22 tests), and POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me; GET /api/spaces and the SSE stream now need a logged-in user. 33 new backend tests (123 in total).
- Added the /authenticate page (Log in / Sign up tabs, frontend validation, server errors), route guards for /spaces and /authenticate, and the redirect to /authenticate on any 401. 22 new frontend tests (33 in total). Checked signup, login and the protected routes through the Vite proxy.
- Fixed the CSS layer order so Tailwind's reset no longer removes MUI's input borders; made the auth form's submit button narrower and taller.
- Added Show/Hide buttons to every password field of the auth forms (each field separately, hidden again after switching tabs), with 3 tests (36 frontend tests in total).
- Agreed on the step 7 (profile page) design and updated implementation-plan.md: the password can't be shown (only its hash is stored), the current password is required for both changes, the new password is confirmed, "Email already in use, try another" and the current-password check became test cases 7 and 8. Added "Logging out other sessions after a password change" to future-ideas.md.
- Added POST /api/auth/logout, PATCH /api/profile/email and PATCH /api/profile/password, with shared schemas. 18 new backend tests (141 in total).
- Added the header (Parking Diagram, My Profile), the /profile page (email and password editors, one at a time, saving overlay, reload on failure, logout) and a shared PasswordField. Logging in now always leads to /spaces (remembering the requested page raced with logout). 25 new frontend tests (61 in total). Checked the profile requests and logout through the Vite proxy.
- Agreed on the step 8 (My cars page) details: display names with spaces, apostrophes and hyphens, uppercase identifiers, one mismatch message, already-added error, removal clears the name and asks for confirmation, dates in UTC+4. Updated implementation-plan.md to match.
- Added the UserVehicle model (migration `user_vehicles`), shared car schemas and `formatLotDate` (19 tests), and GET/POST /api/cars, PATCH/DELETE /api/cars/:id. 30 new backend tests (171 in total).
- Added the /cars page (Add car dialog, cards, inline name editor, delete confirmation) and the "My Cars" header link; moved the request helper into a shared `sendRequest`; the saving overlays now cover the header. 28 new frontend tests (89 in total). Checked the cars API through the Vite proxy with two users.
- Agreed on the step 9 (booking from the app) details: only the user's own cars, busy cars left out of the list plus a server guard, the new car preselected, Cancel disabled until step 10, a simple parked dialog until step 11, shared cars highlighted for everyone who has them, times in UTC+4. Updated implementation-plan.md (steps 5 and 9).
- Added POST /api/bookings and GET /api/my-parkings, booking schemas and `formatLotTime`; bookings are announced over SSE. 16 new backend tests (187 in total).
- Added the booking flow on /spaces (details with Close, car selection with Add new car, success and unavailable messages), yellow pulsing highlights of the user's spaces with their dialogs, and highlight refreshes on every SSE update. Replaced the step 5 typing dialog. 15 new frontend tests (104 in total). Checked booking, races, my-parkings, SSE and entering with a booked car through the Vite proxy and the bar post.

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