# The Parking app
This is a parking app built as a test assignment. It lets users book parking spaces and track their booking and parking status. It communicates with mocked apps: a bar post, a payment terminal, and a mailing system.

## 🛠️ Technologies
- Language: TypeScript 7.0
- Frontend: React 19.3, React Router 8.5, MUI 9.5, Tailwind CSS 4.3
- Backend: Node.js 26, Fastify 5.12 (`@fastify/jwt` 10, `@fastify/cookie` 11)
- Database: PostgreSQL 18 (in Docker) + Prisma ORM 7.10
- AI Agent: Claude Code Opus 5.5 Medium
- Tests: Vitest 5.0, Testing Library (React 16.3)
- Bundler: Vite 8.3
- Validator: Zod 4.6
- Server state: TanStack Query 5.105
- Live updates: Server-Sent Events (no library)
- Time-based workers: an in-process scheduler built on `setTimeout` (no Cron library), one timer per booking plus an hourly job
- Mock apps' CLI: Commander 15
- Package manager: pnpm 11 (workspace)

## 🚀 Run it locally
You need **Node.js 26**, **pnpm 11** and **Docker**.

1. Install the dependencies:
   ```bash
   pnpm install
   ```
2. Create the env file and fill in the two secrets (any long random strings, e.g. the output of `openssl rand -hex 32`):
   ```bash
   cp .env.example .env
   ```
   Set `SERVICE_API_KEY` and `JWT_SECRET` in `.env`. The other values work as they are.
3. Start PostgreSQL (a development database on port 5432 and a test database on port 5433):
   ```bash
   pnpm db:up
   ```
4. Create the tables, generate the Prisma client and add the parking spaces:
   ```bash
   pnpm --filter @parking/backend db:migrate
   pnpm --filter @parking/backend db:generate
   pnpm --filter @parking/backend db:seed
   ```
5. Start the apps, each in its own terminal:
   ```bash
   pnpm --filter @parking/backend dev   # main backend, http://localhost:3000
   pnpm frontend                        # web app, http://localhost:5173
   pnpm payment-terminal                # payment terminal mock: type the payment result when asked
   pnpm email-service                   # email service mock: prints the booking reminders
   ```
6. Open http://localhost:5173, sign up, add a car on **My Cars** and book a space on **Parking Diagram**.
7. Drive a car in and out with the bar post mock:
   ```bash
   pnpm -s bar-post --reg AA111AA --direction in
   pnpm -s bar-post --reg AA111AA --direction out   # then type "success" in the payment terminal
   ```

To run the tests (they use the test database, so step 3 must be done): `pnpm test`.

## ✅ 5 important features
1. **A live parking lot diagram.** Vacant, booked and occupied spaces update without reloading, through Server-Sent Events, in every open tab. The user's own bookings and parked cars are highlighted with the car's name and number.
2. **Safe bookings that expire on their own.** Two users can't book the same space: the database only lets a booking through while the space is still vacant. A booking cancels itself 15 minutes after it was made if the car hasn't entered, and an email reminder goes out 10 minutes before that.
3. **A bar post that knows who may pass.** A car gets in with its booking, or without one if a space is free. Cars that are already inside, cars leaving without a parking, and repeated entrances and exits are handled and logged.
4. **Per-minute billing with day and night rates.** Only full minutes are charged, each at the rate in effect when it started. The rate switches automatically at 08:00 and 20:00, and the driver pays once at the terminal before the bar opens.
5. **A user account.** Sign-up and login use credentials, with hashed passwords and an httpOnly cookie. The account includes a profile (email and password), a list of cars checked by VIN and certificate number, and the parking and payment history.

## ⚠️ 3 limitations to know about
1. **Only one backend instance is supported.** The booking reminders and expiries, the hourly total refresh and the live-update broadcaster all live in the backend's memory. Jobs are rebuilt from the database on restart, but reminders that fell due while the backend was down are skipped, and running several instances would duplicate jobs and split the live updates.
2. **Sessions can't be revoked.** Logins are 14-day JWTs that the server doesn't track. Logging out clears the cookie, and other tabs log out too, but a copied token stays valid until it expires, even after a password change.
3. **Car ownership isn't really verified.** The VIN and certificate number are only compared with what the app already stores, so made-up cars can be added. There's also no limit on simultaneous bookings, and anyone who has a car on their list can cancel its bookings. So in theory one user could keep the whole lot booked.

More details: [decisions](docs/decisions.md), [future ideas](docs/future-ideas.md), [log](docs/log.md).
