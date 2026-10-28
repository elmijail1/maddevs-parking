# The assignment's details
## Technical features
- The app's client and server aprts must be separate and communicate through network
- Credential-based authentication and a user account
- External services can be mocked (email services, APIs, etc)
- The app works properly when opened in two tabs at once locally

## Business features
- The app is a paid parking service: a user books a parking space in a lot for the specified time (starting from), drives in, and pays before driving out
- User profile: email, related cars, parking & payment history
- Parking lot layout diagram with spaces and their status: vacant, booked, occupied.
- Post bar: lets cars in and out based on whether they have a booking (entering) or whether they've paid for parking (leaving)
- Fee rate: pay by minute, day & night rates differ. The user pays once before leaving

## Behavior requirements
- Parking lot layout diagram's data updates without reloading
- Multiple users can't simultaneously book one space
- If a user books a space and doesn't enter the lot within 15 minutes, the booking cancels
- A user gets an approaching booking expiration notification by email 10 minutes ahead of it (i.e. 5 min after the specified time: e.g. the booking is for 10:00, at 10:15 it expires, so the user that hasn't entered the lot after 10:00 gets an email at 10:10)
- You can enter the lot without a booking if there are vacant spaces
- The rate switches between day and night rates automatically for parked cars
- Leaving the lot without entering it or entering the lot twice (say, you entered, then left, then entered it twice) should be handled correctly

## Technical stack
- Backend: Node.js
- Frontend: React
- Database: PostgreSQL

## Results must include
- A repo with clear instructions on how to run the app locally
- A log of used prompts or decisions: they must explain why the app is arranged in this particular way, why these particular packages and approaches were used, and when each decision was made (to give a better idea of how long it took)
- A clear description of the app's state: what works (features), what doesn't (limitations), what wasn't included and why (scope notes & future improvement ideas)