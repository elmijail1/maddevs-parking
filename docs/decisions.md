# Decisions

Important implementation decisions, newest on top. Each entry: date, decision, reasoning, alternatives considered.

The baseline technical and business decisions made before development started are in [initial-description.md](initial-description.md).

---

## 30.10. Step 11 (booking reminders and automatic expiry)

### One in-memory timer per job, rebuilt on startup
- **Decision:** a small scheduler (`setTimeout` per job, keyed by parking id, `unref`'d so it never keeps the process alive). When a booking is created (from the app or by the bar post for a car without one), two jobs are scheduled at once: the **reminder** 10 minutes before the expiry and the **expiry** 30 seconds after it (e.g. 10:05 and 10:15:30 for a 10:15 booking). Both are cancelled when the car enters, the booking is cancelled, or the car leaves. Every job also re-checks that the parking is still `booked` when it runs.
- **Why:** the plan asks for per-booking scheduling instead of an interval worker. Scheduling the expiry together with the reminder (not from it, as the plan first said) means the expiry never depends on the email service. The 30 s gap gives the system some slack.
- **Restarts:** timers only live in memory, so on startup the backend schedules the jobs of every `booked` parking: overdue expiries run at once, reminders whose time has passed are skipped (there's no record of which were sent, see the notifications idea in future-ideas.md).
- **Alternatives:** an interval worker checking the database (rejected by the plan); a job queue with persistence (overkill for 6 spaces and 15-minute bookings).

### Entering at the last moment
- **Decision:** when `/api/new-entrance` lets a booked car in, its expiry job is postponed to 2 minutes after that moment (`entranceGraceMinutes`), if that's later than the scheduled one. `activeSince` and the shown expiry time don't change.
- **Why:** the 30 s gap alone only moves the edge (a car let in at 10:15:29 would race the 10:15:30 job). With the postponement the booking survives until the entrance is registered; if the car turns back, it still expires soon. The step 10 fallback stays as a safety net (e.g. if the backend restarts during those 2 minutes).

### Who gets the reminder, and the email mock
- **Recipients:** every user who has the car active on their list, also for bookings the bar post made (a car that turns around leaves a real 15-minute booking). Nobody is emailed if nobody has the car. Linking parkings to the user who made them, to notify just them, is in future-ideas.md.
- **Email service:** a separate mock app (`email-service-mock-app`, `POST /emails` with the API key, port 3002) that waits a second, prints the email and answers with success, like the payment terminal mock. The backend calls it through `sendEmail` with a 5 s timeout; a failure (only when the mock is offline) logs a warning and nothing else. A notifications model to track sent and failed emails is in future-ideas.md.
- **Text:** subject "Your booking of A1 expires at 10:15", body "Your booking for AA111AA expires at 10:15. Please enter the parking lot before then."

---

## 30.10. Step 10 (cancelling a booking)

### Cancellation keeps the parking's times
- **Decision:** `POST /api/bookings/:parkingId/cancel` sets the parking to `cancelled` (only while it's still `booked`) and frees its space (only while it's still booked for that car), in one transaction, then announces the change over SSE. `activeSince`, `currentRate`, `latestRateChange` and `latestTotalUpdate` are kept, not nullified as the plan first said (it was updated). The same goes for the automatic expiry in step 11.
- **Why:** the columns are required; making them nullable would add null checks to charging, exits and history for no gain. For a booked parking `activeSince` holds the scheduled time anyway, and a cancelled parking is never reactivated: booking again creates a new parking.
- **Who can cancel:** any user who has the car active on their list (the same rule as booking); others get `404`. A booking that's no longer booked (the car entered, or it was already cancelled) gets `409 booking_not_active`, shown as "This booking can no longer be cancelled.". If the space wasn't booked for the car any more, it's left as it is, with a warning.

### A confirmation before cancelling
- **Decision:** "Cancel booking" opens "Cancel the booking of A1?" with "Keep booking" and "Cancel booking"; success shows "Booking cancelled." with OK. If the car enters while the confirmation is open, it switches to the "can no longer be cancelled" message.
- **Why:** a small guard against accidental clicks, as the user asked; the plan was updated.

### Entering after the booking ended
- **Decision:** if a booked car was let in by the bar post but its booking was cancelled before `/api/new-parking` arrived, the entrance is handled like one without a booking (a vacant space is claimed, with a warning) instead of failing with a `500`. This closes the step 2 "known gap" for manual cancellations.
- **For step 11 (automatic expiry):** when `/api/new-entrance` lets a booked car in, its expiry will be postponed by 1–2 minutes, so a car entering at 10:14:59 for a 10:15 expiry isn't cancelled before its entrance is registered. If the car turns back, the booking still expires soon. The fallback above stays as a safety net.

### Tests follow the configured rates
- **Decision:** charge tests compute the expected amounts from `getRatePerMinuteCents` instead of hard-coding cents.
- **Why:** the base rate was changed in the shared config (10¢ → 2¢ a minute), which broke tests that assumed the old rate; the rate is configuration, the tests check the calculation.

---

## 29.10. Step 9 (booking from the app)

### Booking a specific space
- **Decision:** `POST /api/bookings` with `{ spaceId, carId }`. In one transaction the space goes from `vacant` to `booked` (a conditional update, so two users can't both get it) with `relatedVehicle` set, and a `booked` parking is created with `activeSince` = now + 15 min, as `initial-description.md` describes; for booked parkings that time is the expiry. Answers: `201` with the booking, `409 space_unavailable`, `409 vehicle_busy` (the car already has a booked or active parking, caught by the one-open-parking-per-vehicle index, which rolls everything back), `404 car_not_found`. A successful booking is announced over SSE like any other space change.
- **Only the user's own cars:** `carId` must be an active car on the user's list; typing in any number was dropped (it would let anyone book under someone else's number). The plan was updated.
- **Shared cars:** any user who has the car on their list can book with it and sees its space highlighted, as `initial-description.md` says.

### The user's own spaces
- **Decision:** `GET /api/my-parkings` returns the booked and active parkings of the user's active cars (space, car, status, and `expiresAt` or `activeSince`). The general spaces data still has no car numbers. The frontend refetches it on every SSE update, so highlights follow bookings, entrances, exits and other tabs.
- **Highlight:** the user's spaces are filled yellow and pulse (Tailwind `animate-pulse`), and are clickable: a booked one shows "This space is booked for AA111AA. The booking expires at 10:15." with a Cancel booking button that stays disabled until step 10; a parked one shows "AA111AA is parked here since 10:12." until step 11. Times are 24-hour `HH:mm` in the lot's UTC+4 (`formatLotTime`).

### The booking dialogs
- **Flow:** space details (rates, Close, Book this space) → choose a car (the user's cars that have no booked or active parking, Add new car, Back, "Book for AA111AA") → a success or "This space is unavailable, please try another" message with OK, which closes everything.
- **Adding a car** opens the same `AddCarDialog` as on `/cars`; afterwards the new car is selected.
- **If the space is taken while choosing,** the "unavailable" message appears at once (unless the user's own booking request is in flight), rather than only after clicking Book.
- **A car that got busy in the meantime** (e.g. booked from another tab) shows "AA111AA already has a booking or is in the lot." and the list is refreshed.

---

## 29.10. Step 8 (My cars page)

### UserVehicle: one row per user and car
- **Decision:** `UserVehicle` (`userId`, `vehicleRegNumber`, `status` active/inactive, `displayName`, `latestStatusChange`) with foreign keys to `User` (cascade on delete) and to `Vehicle.regNumber`, unique on `(userId, vehicleRegNumber)`. Removing a car sets it inactive, clears its display name and moves `latestStatusChange`; re-adding it reactivates the same row with a fresh date and the given name or "New car". The list shows active rows, latest `latestStatusChange` first.
- **Why:** the plan's case 6 (re-adding reuses the link), and a foreign key is safe here because a vehicle always exists before it's linked (unlike parkings, which don't reference `Vehicle`).

### Adding a car
- **Decision:** `POST /api/cars` finds or creates the vehicle, then compares the VIN and certificate number. A mismatch answers `409 vehicle_mismatch` with one message ("The VIN or certificate number doesn't match this car.") that doesn't say which value is wrong, so they can't be guessed one at a time. A car already active in the list answers `409 already_added`. Two simultaneous adds of the same new car are safe: a unique violation is treated as "the vehicle exists" / "already added".
- **Routes:** `GET /api/cars`, `POST /api/cars`, `PATCH /api/cars/:id` (display name), `DELETE /api/cars/:id` (deactivate), all behind the login. `:id` is the link's id, scoped to the user from the token, so another user's car answers `404`.

### Validation (shared)
- **Registration and certificate numbers:** 3–15 characters, **VIN:** 5–17, Latin letters and digits only, trimmed and uppercased (so case doesn't matter for matching).
- **Display name:** trimmed, repeated spaces squeezed, 1–20 characters, Latin letters, digits, spaces, apostrophes (`'` and `’`) and hyphens. The plan's "only Latin characters and numbers" was widened since the default "New car" has a space; the plan was updated.

### The page
- **Add car dialog:** its own component (`AddCarDialog`) so step 9's booking dialog can reuse it. Save, Cancel, the cross, Escape and clicking outside behave as the plan says; closing discards the progress; it can't be closed while saving. Server errors are shown inside it.
- **Cards:** display name, registration number, "Added 29 Oct 2026" (the date in the lot's UTC+4 time zone, `formatLotDate` in the shared package), Edit and Delete. Editing works like on the profile page (one editor at a time, disabling the other cards' buttons and Add car; saving overlay; reload on failure). Delete asks for a confirmation.
- **Shared request helper:** `sendRequest` (10 s timeout, `401` → logged out, error codes) is now used by the profile and cars pages. The saving overlays now sit above the app bar too, so the header can't be clicked mid-save.

---

## 29.10. Step 7 (profile page)

### Changing the email or password needs the current password
- **Decision:** `PATCH /api/profile/email` takes `{ email, currentPassword }`, `PATCH /api/profile/password` takes `{ currentPassword, newPassword }`; the user id comes only from the token. A wrong current password gets `403 wrong_password` (not `401`, which means "not logged in" and sends the user to `/authenticate`). An email used by another account gets `409 email_taken`, shown as "Email already in use, try another". The new values follow the signup rules. The password editor also asks to repeat the new password (checked on the frontend).
- **Why:** without it, anyone at an unlocked, logged-in browser could take over the account.
- **The password isn't shown:** only its hash is stored, so outside the editor it's a fixed `••••••••`, and the editor starts with empty fields, each with Show/Hide. The implementation plan was updated to match.

### Saving, errors and editing
- **One editor at a time:** while one is open, the other Edit button is disabled.
- **While saving,** a backdrop with a spinner covers the page. Requests time out after 10 s (`AbortSignal.timeout`).
- **A failed save** (server error, timeout, no connection) hides the profile and shows "Your changes couldn't be saved. Please reload the page." with a Reload button that refetches the user and closes the editor, so the values from before the edit are shown. A wrong current password or a taken email are shown under their fields instead, with the editor still open.
- **Editors live in component state,** so leaving the page or reloading discards them.
- **A `401` from any mutation** (e.g. an expired token) logs the user out on the frontend, like queries already did.

### Logging out and where login leads
- **Decision:** `POST /api/auth/logout` clears the cookie. The frontend then removes every cached query and marks the user as logged out, so `RequireAuth` sends them to `/authenticate`. Logging in always leads to `/spaces`.
- **Why:** remembering the requested page (step 6) raced with logging out: the guard saw the logged-out user first and remembered `/profile`, so the next login reopened the profile. Making the logout's own redirect win would need timing tricks, and the plan only asks for `/spaces`.
- **Other sessions** stay logged in after a password change (JWT trade-off); logging them out is in [future-ideas.md](future-ideas.md).

### Header and shared password field
- **Decision:** protected pages share an `AppLayout` with an MUI app bar: "Parking Diagram" (`/spaces`) and "My Profile" (`/profile`), the current one highlighted (`aria-current`). The Show/Hide password input became a `PasswordField` component, used by the auth forms and the profile editors.

---

## 29.10. Step 6 (user authentication)

### A JWT in an httpOnly cookie
- **Decision:** after signup or login, the backend signs a JWT (`@fastify/jwt`) with only the user id (`sub`) and puts it in the `token` cookie (`@fastify/cookie`): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production. The token and the cookie live **14 days**, with no refresh tokens. Protected routes (`requireUser`) only accept the token from the cookie, never from an `Authorization` header. `GET /api/auth/me` also looks the user up, so a deleted user loses access at once (and their cookie is cleared).
- **Why:** no extra table or lookup per request. The cookie is out of reach of page scripts (XSS), the browser sends it with `EventSource` by itself, and `SameSite=Lax` keeps other sites from sending requests with it (CSRF). The data behind the login isn't valuable enough to need short-lived tokens.
- **Trade-off:** logging out (step 7) deletes the cookie, but a token copied before that stays valid until it expires, since the server keeps no list of tokens.
- **Alternatives:** database sessions (revocable at once, but a table and a lookup per request); a JWT in `localStorage` with an `Authorization` header (readable by scripts, and `EventSource` can't send headers).

### Passwords are hashed with scrypt from Node's `crypto`
- **Decision:** `scrypt` with a random 16-byte salt per password (N=16384, r=8, p=1, 64-byte key), stored as `scrypt$N$r$p$salt$hash`, so the parameters can change later without breaking old hashes. Checking uses `timingSafeEqual`. A login for an unknown email still checks a dummy hash, so the response time doesn't reveal which emails exist.
- **Why:** a slow, salted password hash with no package and no native build.
- **Alternatives:** the `argon2` package (a bit stronger, but compiles native code).

### Validation rules (shared by the frontend and the backend)
- **Email:** trimmed and lowercased (so one account per address in any letter case), at most 100 characters, Zod's email pattern.
- **Signup password:** 8–30 characters, at least one Latin letter, one digit and one special character; only Latin letters, digits and printable ASCII symbols (no spaces).
- **Login:** the frontend checks the email pattern and a password of at least 8 characters; the backend only checks types and lengths (password 1–30), then the credentials.
- **Errors:** wrong credentials always get the same "Wrong email or password" answer (`401 invalid_credentials`), whether the email exists or not. Signup answers `409 email_taken`, since the plan requires telling the user.
- **Rate limiting** of login and signup is out of scope, recorded in [future-ideas.md](future-ideas.md).

### What's protected and how the frontend handles it
- **Backend:** `GET /api/spaces` and the SSE stream need the cookie. Device routes keep using the API key.
- **Frontend:** the current user comes from `GET /api/auth/me` through TanStack Query. A `RequireAuth` layout route sends logged-out users to `/authenticate`; a `GuestOnly` route sends logged-in users from `/authenticate` to `/spaces`, as the plan says. (At first the page the user had asked for was remembered and reopened after login; it was dropped in step 7, see there.) Any query that gets `401` (e.g. an expired token) sets the current user to logged out, which redirects to `/authenticate`.
- **The plan's `/authenticated`** in the step 6 test cases is read as `/authenticate`.

---

## 29.10. Step 5 (parking lot diagram)

### Live updates through SSE
- **Decision:** the diagram gets space changes through Server-Sent Events (`GET /api/spaces/events`). User actions (booking, cancelling) stay regular HTTP calls. The backend sends the whole space list on every change and on every (re)connect, and the frontend writes it into the TanStack Query cache. `GET /api/spaces` serves the initial load. Changes are announced by an in-process emitter, called after each transaction that changes spaces.
- **Why:** updates flow from the server to the browser and happen often (other cars booking, entering, leaving), while user actions are rare one-off requests that need a normal response. `EventSource` reconnects by itself, and the server side needs no package. Sending the whole list (6 spaces) means nothing can arrive out of order.
- **Alternatives:** WebSocket (two-way, which we don't need; more to build); polling (wasted requests, delayed updates). Postgres `LISTEN/NOTIFY` instead of the in-process emitter would also catch other processes' changes (several backend instances, Prisma Studio), but isn't needed with one backend.

### Spaces are public without the related vehicle
- **Decision:** the spaces routes are public for now and return only `id`, `displayName` and `status`. `relatedVehicle` is never sent: whether a space is "yours" will come from the user's own parkings once users exist.
- **Why:** a registration number tied to a space would let anyone follow a car.

### Frontend stack
- **Decision:** Vite + React with React Router (the diagram at `/spaces`), MUI for components (dialogs, buttons, the spinner), Tailwind for layout, TanStack Query for server state. The files are written by hand instead of with `create vite`, to match the other packages. Vite proxies `/api` to the backend, so there's no CORS and the SSE stays same-origin.
- **Spaces are plain rectangles** in two rows facing each other across a driveway. Rows are grouped by the first letter of the display name.
- **MUI and Tailwind together:** MUI's styles go into their own CSS layer (`StyledEngineProvider enableCssLayer`), and the layer order `theme, base, mui, components, utilities` is declared through MUI's `GlobalStyles`, so Tailwind utilities win over MUI and MUI wins over Tailwind's reset. The order has to come from `GlobalStyles`, not `index.css`: MUI inserts its styles at the top of `<head>`, and layers are ordered by first appearance, so otherwise the reset (`border: 0`) removed the input outlines. MUI's `CssBaseline` isn't used.

### Implementation details of the live updates
- **Changes are announced from the device routes** that can change spaces (new-entrance, new-parking, space-vacant-again), after the service finishes, so the transaction is committed. Future booking, cancelling and expiry code will announce the same way.
- **One broadcast at a time:** a change reads the list once for all clients, and changes that arrive during a broadcast cause exactly one more read. Each client remembers the last list it got and only receives a different one, so a request that changed nothing sends nothing. A newly connected client gets the list through the same queue, so it can never receive an older list after a newer one.
- **No DB read while no client is connected**, which also keeps the other backend tests unaffected.
- **A heartbeat comment every 25 s** keeps proxies from closing an idle stream, and `retry: 3000` sets the browser's reconnect delay. `forceCloseConnections` is on so open streams don't block a server restart.
- **The frontend recovers by itself:** the SSE list goes into the same query cache as `GET /api/spaces`, so a failed first load is replaced by the next pushed list. A dialog for a space that stops being vacant closes and doesn't reopen when the space is freed.

---

## 29.10. Step 4 (handleCarExit)

### Freeing the space also closes the car's open parking on it
- **Decision:** `POST /api/space-vacant-again` frees every space where `relatedVehicle` is the leaving car (status `vacant`, `relatedVehicle` null), in one transaction. The car's open parkings on those spaces are closed too:
  - a **booked** parking is cancelled, with a warning
  - an **active** (unpaid) parking gets its total refreshed up to now and becomes `finished`, with a critical log that includes the unpaid total so support can follow up
- **Why:** the one-open-parking-per-space/vehicle indexes would otherwise block the freed space and the car's next entrance. The car has physically left, so a free space reflects the real state and makes room for more cars.
- **Alternatives:** keeping the space occupied while the parking is unpaid (rejected: it blocks a space that's actually free); freeing only the space (rejected: it breaks later claims).

### Response and exit time
- **Decision:** every valid request gets `204`, including "no related space" (a critical log only), since the bar post doesn't need an answer. An invalid regNumber gets `400` with a critical log. The bar post calls the endpoint right after it opens for an exit; a failure is only printed.
- **No `finishedAt` field** on parkings for now: nothing reads the exit time yet.

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
  - **Successful payment:** the parking becomes `finished`, but the space stays `occupied` until the car actually leaves (step 4, `/api/space-vacant-again`).
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
- **Decision:** accept the gap. If a car without a booking gets a "yes" from `/api/new-entrance` (a space gets booked for it) but `/api/new-parking` never arrives, the booking stays until it expires normally after 15 minutes (the expiry worker comes in a later step). (Since step 11 such bookings get the reminder and expire like any other.)
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
- **Known gap:** activation checks that the parking is still `booked` and fails with a 500 if it isn't. Once booking expiry and cancellation exist (steps 6 and 8), an expiry that lands at the same moment as an entrance must be looked at again. (Closed in step 10: such an entrance is now treated as one without a booking.)

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
