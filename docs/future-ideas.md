# Future improvement ideas

## Bar post stores the "all's occupied" value
- Bar post currently checks if the car can enter the lot on each approach from the outside.
- It does so by requesting two things from the main app: is there a booking for this registration number? Are there any vacant spaces? (Note: a booked space isn't vacant, so the former can be true, while the latter is false)
- The bar post doesn't store any data to make sure the main app is the sole source of truth
- However, some bar posts have a vacant space counter: say, 5/6 or 1/6, so you can see whether there are any spaces to park at. Due to bookings, we can't fully replicate it.
- What we can do, however, is let the bar post app store a boolean like this: allSpacesOccupied – if it's true, the bar post won't send another request even if a car approaches. If it's false, the usual flow works.
- The idea is to make this value come from the main parking app – it remains the sole source of truth for space data, and when all spaces become occupied, it can let the bar post know. It can even send this value alongside the data the bar post requests. But when a car leaves a fully occupied lot, the bar post doesn't request anything – it must get an incoming request with the updated value (true –> false), so that it can start letting cars in again.
- Possible benefit: avoiding unnecessary "bar post to main app" requests when all spaces are occupied.

## Vehicle data real lookup
- When adding a vehicle, a user must provide three things: VIN number, registration number, and registration certificate number.
- Currently all three are only checked within the app's DB – if the car with this registration number already exists in the DB, the other 2 must match. If they don't, an error is shown.
- The external lookup could be useful here: it would refer to some national DB that stores data for vehicles inside the country. It would make the check stricter.
- Possible benefit: the car's data will be verified as real which adds safety, since people won't be able to just make up the VIN and certificate numbers.

## Rate limiting for login and signup
- Currently anyone can try as many email/password combinations as they like: nothing slows down repeated login or signup attempts.
- `@fastify/rate-limit` on `/api/auth/login` and `/api/auth/signup` could limit attempts per IP (e.g. 5 per minute) and answer `429` after that. A stricter version would also count failed attempts per email.
- Possible benefit: brute-forcing passwords and mass-creating accounts become impractical.

## Logging out other sessions after a password change
- Login tokens are JWTs that the server doesn't keep track of: changing the password doesn't log out other browsers or devices, their tokens stay valid until they expire (14 days).
- A `passwordChangedAt` field on the user, checked on every protected request against the token's issue time, would reject tokens issued before the change. It costs a database lookup per request.
- Possible benefit: if someone else got into the account, changing the password locks them out at once.

## Linking parkings to the user who made them
- Currently a parking only knows its vehicle, and a car can be on several users' lists, so the app can't tell which user made a booking.
- A `userId` on the parking (empty for walk-ins from the bar post) would give each user a precise history of the parkings they made. That isn't the same as "paid by": payments happen at the terminal, so the app never knows who actually paid.
- It would also make notifications precise: the booking reminder could go only to the user who made the booking instead of everyone who has the car on their list.

## A data model for notifications
- Booking reminders are currently sent and forgotten: if the email service is offline, a warning is logged and nothing else remembers that the email wasn't sent.
- A `Notification` model (recipient, type, related parking, status: pending / sent / failed, timestamps) would record every email, much like payments are recorded with their statuses.
- Possible benefit: observability (what was sent, what failed and when) and a basis for retrying failed emails.
