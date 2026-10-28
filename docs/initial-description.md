# Initial technical and business decisions
## Technologies
- Frontend Main: React, TypeScript
- Backend Main: Node.js (Fastify), TypeScript
- Database: PostgreSQL (Prisma)
- Validation schemas: Zod
- Frontend server-state management: TanStack Query
- Client-server sync approach: server-side events (to discuss)
- Tests: Vitest
- CLI: Commander
- Time-based events: Cron

## Data models
### Space
- id: uuid
- displayName: string (seen by users)
- status: booked / occupied / vacant
- relatedVehicle?: string (registration number)
- updatedAt: timestamp
- createdAt: timestamp
The initial implementation of the app features one parking lot with 6 spaces.
**relatedVehicle** isn't empty when the status is booked or occupied.

### User
- id: uuid
- email: string
- updatedAt: timestamp
- createdAt: timestamp

### Vehicle
- id: uuid
- regNumber: string
- VIN: string
- registrationCertificateNumber: string
- createdAt: timestamp
**VIN** and **registrationCertificateNumber** are required for verificaction: you can't just add any car from the street, you need to have access to this data too – the idea is higher safety, since if anyone could add your car and see its parking status (i.e. currently parked), that would allow the owner to be followed.
**regNumber** is the true identificator since there can be only one vehicle with a particular registration number.

### UserVehicle
- id: uuid
- userId: uuid
- vehicleRegNumber: string
- status: active / inactive
- displayName?: string
- createdAt: timestamp
- updatedAt: timestamp
- latestStatusChange: timestamp
The relationship can be many-to-many: one user can add multiple cars, one car can be added in the app by many users. Multiple users can book spaces for one car and view its current status on the parking lot.
**displayName** is how a particular user chooses this car to be shown in their list of cars – different users can choose different names (say, one user writes "Jeep Wrangler", another uses "MY BRO'S JEEP" for the same car). 
**status** is active when the car is added to the app by the user. It becomes inactive after the user removes it – the row doesn't get removed from the database though so you can still see the user's previous connections through the database.

### Payment
- id: uuid
- parkingId: uuid
- total: number
- status: pending / cancelled / failed / success
- createdAt: timestamp
Payments are made through a terminal before the exit. So they all are made by card. We don't care what user makes them – all that matters is that before a parking is marked as finished, we get an OK response from the payment provider.
One parking can have multiple cancelled / failed payments, but only one that's pending / success. 
**status**:
- *pending* is the default one – payments are created after the user initiated an exit flow by approaching the bar post on their car from the inside.
- *cancelled* is assigned to a payment if the user cancels payment through the terminal UI or the payment session expires (5 min). A final status.
- *failed* is for situations when the response from the payment provider isn't OK. The user can retry payment, but another payment object will be created. A final status.
- *success* is for situations when the response from the payment provider is OK. A final status.


### Parking
- id: uuid
- status: booked / cancelled / active / finished
- vehicleRegNumber: string
- spaceId: uuid
- activeSince: timestamp
- currentRate: number (saved as the variables "day" and "night")
- latestRateChange: timestamp
- total: number
- latestTotalUpdate: timestamp
- createdAt: timestamp
One space can only have one booked / active parking at a time. One car can also have only one booked / active parking at a time.
**activeSince** is set to 15 min ahead (by default) for booked parkings. If the vehicle entered the parking lot before that time, the value is updated to the timestamp of the actual entering.
**currentRate** is determined depending on whether it's daytime or nighttime, according to the business definition of that. By default it's based on the activeSince, but can change: if activeSince is moved back, currentRate relies on it. While the parking is active, it can change if the parking's duration crosses the time point after which one rate turns into another.
**total** is added up gradually.
**latestTotalUpdate** is set to activeSince by default. If activeSince is moved backwards, so does it. Then it updates automatically hourly, following the total's value. The user can trigger an update: when initiating a payment or when clicking their vehicle in the app's UI. 

#### status
- **booked** – a user booked a space (spaceId) for a car (vehicleRegNumber).
- **cancelled** – a user cancelled a booked parking or the booking expired before the user entered the lot in the specified car.
- **active** – a user entered the parking lot in the specified car and the car remains in the lot.
- **finished** – a user exited the lot in the car. Under normal circumstances, this means that the parking has been paid for. It can also be used in special cases: e.g. when the terminal is out of order and people can just drive out without paying.

### Passthrough (bar post app)
- id: uuid
- time: timestamp
- vehicleRegNumber: string
- direction: in / out
- createdAt: timestamp

### POSPayment (POS app)
- id: uuid
- status: pending / processing / cancelled / failed / success
- time: timestamp
- updatedAt: timestamp
- createdAt: timestamp

## General flow
1. User1 books space Space1 at 10:00 for Vehicle1
- Space1's status changed from vacant to booked, relatedVehicle is set to Vehicle1's regNumber XX000XX, and updatedAt is set to 10:00 (as a timestamp)
- Parking1 object is created: status: booked, vehicleRegNumber: XX000XX, spaceId: S1, activeSince: 10:15, currentRate: 1 (can be different depending on what values are currently set for day and night rates), latestRateChange: 10:15, latestTotalUpdate: 10:15, total: 0
- Space1 is shown as outlined red in the app's UI to everyone except for User1 – they can't interact with this space since for them it's unavailable
- Space1 is shown as filled yellow and pulsating in the app's UI which means it's somehow related to their vehicle – they can click on it to view booking details: when it expires (10:15), what the rate is (the defined general rate * day/night coefficient), and the cancel button.

2. User1 approaches the parking lot at 10:01 in Vehicle1, stops at the bar post
- The bar post app gets an input from the camera deciphering module – the input contains Vehicle1's registration number read from the photo: XX000XX
- The bar post app sends a request to the main parking app asking to fetch two things: 1. all Spaces with status: booked AND relatedVehicle: XX000XX; 2. all Spaces with status: vacant
- The bar post decides on further actions depending on the response:
- a. The response is not OK (timeout or some error). The bar post remains closed, the UI message reads "The bar post isn't working. Please come again later."
- b. The response is OK, but both bookedSpaces and vacanctSpaces come empty. The bar post remains closed, the UI message reads "There are no vacant spaces. Please come again later."
- c. The response is OK, vacantSpaces isn't empty. The bar post opens, the message reads "Please come in", a Passthrough object is created: time: 10:01, vehicleRegNumber: XX000XX, direction: in.
- d. The response is OK, bookedSpaces isn't empty (the bar post doesn't care about how many bookedSpaces there are for one car – if there are more than one, that's the main parking app's issue, not the bar post's concern). The bar post opens, same message and new object as in c.
- e. The response is OK, both bookedSpaces and vacantSpaces aren't empty. The bar post opens, same message and new object as in c and d. 

3. User1 enters the parking lot at 10:01 in Vehicle1
- On a passthrough object creation by the bar post app, a message is set immediately to the main app system: regNumber: XX000XX, time: 10:01.
- a. The main sys must first see if any space is booked for this regNumber – if there's one, it looks for a Parking object with status: booked and vehicleRegNumber: XX000XX, and updates it: status: active, activeSince: 10:01, latestRateChange: 10:01, latestTotalUpdate: 10:01. The Space's status is changed to occupied.
- b. If there's no booking, the main sys creates a new Parking object and connects it with any vacant Space, changing its status to occupied and adding the relatedVehicle to XX000XX.
- c. If there's no booking and no vacant space, we definitely have an issue: there's no a car in the lot that can't be parked. The function must return an error and trigger a critical lot that could be used to alert the app's support.

4. 11:00 came
- Time passed, no changes came from User1 or Vehicle1 – the car still occupies Space1.
- A Cron worker ran at 11:00 however to do the following:
- a. Are there any Parkings with status: active? Yes, at least Parking1 (the one Space1 and XX000XX are associated with)
- b. Is the current time past 20:00? (an example value for the time at which the day rate switches to the night rate) No, it's 11:00.
- c. So we take Parking1, keep its currentRate and latestRateChange, but change the following: total = currentTotal + (currentRate * generalRatePerMin) * number of minutes from latestTotalUpdate to now = 0 + (1 * 1) * (11:00 - 10:01) = 59. So now: total: 59, latestTotalUpdate: 11:00.
- d. If the rate change would be required, we'd change currentRate to whatever value the night rate has. And we'd do the opposite when the next rate change point comes (say, 8:00). It's not our case right now, though.
- User can open the app and see the parking lot their car is at as filled yellow and pulsating. They can click on it to learn the current total, the current rate, and the starting time. Each time they do so, the current total is forecfully recalculated. This is also true for other users that have Vehicle1 added to the list of their cars in the app.
- The same User can click other vacant spaces in the layout diagram (outlined green) and book them for another vehicle. Also true for other users with this car on their list.
- Users can have multiple cars from their list parked at once, thus having multiple filled yellow and pulsating parking spaces shown in the layout diagram.
- Other Users see the Space1 occupied by Vehicle1 as unavailable (outlined red) and can't interact with this space.

5. User1 is leaving the lot at 11:20 in Vehicle1, they approached the bar post
- The bar post's camera module send the registration number input: XX000XX. It sends the main sys a request saying that this car is attempting an exit.
- The main sys now must calculacte the total and send it to the payment terminal (POS). It does so by changing the Parking1 object: total = currentTotal + (currentRate * generalRatePerMin) * (now - latestTotalUpdate) = 59 + (1 * 1) * (11:20 - 11:00) = 59 + 20 = 79. The main sys sends this value to POS.
- The main sys also creates a Payment1 object: total: 78, status: pending, parking: Parking1.
- The POS receives the total, initiates a payment procedure, and waits for the user's input (using a card to pay). It also creates its own POSPayment1 object: total: 78, status: pending, time: 11:20. Now there are a few scenarios of what comes next:
- a. The user cancels the payment session through POS' UI or doesn't do anything for 5 min. POS updates the POSPayment1 object's status to cancelled and lets the main sys know that. The main sys updates its own Payment1 object by changing its status to cancelled and sends a negative response to the bar post. A non-critical log is emitted. The user can approach the POS again and try once more, thus triggering the creation of Payment2 and POSPayment2.
- b. The user applies a card but the payment provider doesn't return an OK response (either a timeout or an error). POS updates the POSPayment1 object's status to failed and lets the main sys know that, so it does the same to its own Payment1 object and sends a negative response to the bar post. A critical log is emitted to attract the support's attention, because this is an issue to respond to since we now have a car that can't leave the parking lot despite its owner's willingness to do so. The user can approach the POS again and retry, thus triggering the creation of Payment2 and POSPayment2.
- c. The user applies a card and the payment provider returns an OK response. POS updates the POSPayment's status to success, sends a positive response to the main sys. The main sys updates its own Payment's status to success, changes the Parking1's status to finished, and Space1's status to vacant and relatedVehicle to undefined. Then it sends a positive response to the bar post. The bar post opens and creates a Passthrough2 object: time: 11:20, regNumber: XX000XX, direction: out.


## Entering & exiting
### Entering
- 1. Bar post: A car approached from the outside and I got an input from camera module with its regNumber: XX000XX. I must ask the main sys: do I let the car XX000XX in?
- 2. Main sys: I must decide whether to let in the car XX000XX. To determine that I must check if there's a booked space for this car, and if there isn't, I must check if there are vacant spaces. I then must return a boolean to the bar post.
- 3. Main sys to DB: give me all the spaces that meet these criteria: 1. status: booked, relatedVehicle: XX000XX; OR 2. status: vacant. Return them as {bookedSpaces: [...], vacantSpaces: [...]}.
- 4. Main sys got the response
- 4.1. Checking bookedSpaces: OK, so are there bookedSpaces? If there are none, disregard them and move on. If there are, how many? If one, the situation is normal, and I must extract it as bookedSpaces[0]. If multiple, the situation isn't normal, I must emit a critical log because something is wrong with bookings – but I also must allow letting the card in, so I'll extract the first booked space anyway: bookedSpaces[0].
- 4.2. Checking vacantSpaces (only if bookedSpaces are empty): are there any vacant spaces? If there are none, it looks like the lot is full, so we can't let the car in. Send a negative response to the bar post. If there are some (1 or more), we can let the car in – I must extract the first available space (emptySpaces[0]), try changing its status to booked, and if successful, send a positive response to the bar post.
- 4.2.1. Why can the status change be unsuccessful? When the main sys got the array, the Space could be vacant. But just a second later someone could book it. So we can either use an optimistic update approach here, or isolate spaces from changes when they are being retrieved by the main sys.
- 5. Main sys to bar post: so if I found a booked space or just booked one myself, I want to tell the bar post to let the car in. If there's no available space for this car, I want the bar post to not let it in.
- 6. Bar post: OK, if the response is false, I just show the UI saying "No available spaces". But if the response is true, I create a Passthrough object, open the bar post, and send a request to the main sys to update its parking data: {regNumber: XX000XX, time: 10:01}
- 7. Main sys: if the car got in, I also got data about its entrance. Now I find a Parking with: status: booked, regNumber: XX000XX – I change its status to active, and set the provided date to the related fields. I also take the spaceId from this Parking object and update this spaceId's status from booked to occupied.


### Exiting
- 1. Bar post: A car approached from the inside. My camera read its number: XX000XX. I must ask the main sys: do I let it out? I'll send the number to it.
- 2. Main sys: So the car XX000XX is attempting an exit. For it to leave its parking must be paid for first. So first of all, does it have a parking object?
- 3. Main sys to DB: send me all Parking objects with status: active AND regNumber: XX000XX.
- 4. Main sys: if there's no such parking or there are more than 1 such parkings, it's a problem, I must emit a critical log and send a negative response to the bar post – this car can't be let out until we figure it out, the support must respond to the log. If there's just one parking like that, it's OK, I now must calculate the total.
- 5. Main sys: The total = currentTotal + (currentRate * generalRatePerMin) * (now - latestTotalUpdate). Say, we get 90. I update this parking object and create a new payment object: total: 90, status: pending, parking: Parking1. Now I must ask the payment terminal to accept the payment and tell me if it was successful. I must send a total to it.
- 6. Payment terminal: I show the user a payment UI with the total (90). If the user cancels the payment or remains inactive for 5 minutes, I send a negative response to the main sys saying the payment got cancelled – and I'll update my own payment object to reflect that in its status. If the user applies their card, I'll wait for the payment provider's response. If it's negative, I'll change the payment's status to failed and send back a negative response to the main sys. If it's positive, I'll change the payment's status to success and send back a positive response to the main sys.
- 7. Main sys: if I get a negative response, I update the payment object respectively, but won't touch anything else – the parking remains ongoing, the space occupied, and the user can make another payment attempt – and I'm sending a negative response to the bar post. If the response is positive, I update the payment object respectively, change the Parking object's status to finished – and I send a positive response to the bar post.
- 8. Bar post: if I get a negative repsonse, I just show the UI prompting the user to try again or contact the support, the bar post remains closed. If I get a positive response, I open the bar post, create a new passthrough object, and let the main sys know what happened: {regNumber: XX000XX, time: 11:20}.
- 9. Main sys: now I know that the car successfully exited, so I can mark the space it occupied as vacant again. This division of changes is determined by the physical nature of the space: if the car's owner decides not to exit the lot after paying and returns to the space, it will be incorrect to mark it as vacant. So I must make sure the car exited first – the bar post's signal is the only way to do so.


## Booking flow
### Booking
- 1. User: I enter the app at 10:00, see the parking lot layout diagram with 6 spaces. 1 is green, i.e. available. I click it, click the "Book this space" button, select a saved car number (XX000XX), and click "Book"
- 2. Client to server: the User wants to Book Space1 for XX000XX. Is it still available? Lock the row when you get to it so no one else can modify it while you're reading it.
- 3. Server to client: if Space1's status is still "vacant", I change it to "booked" and set relatedVehicle: XX000XX. I also create a Parking1 object that mentions the vehicle and the space, and set its activeSince to 15 min ahead (10:15). I send back this data to the client: a success signal, an updated space data, and an activeSince timestamp. If the Space1's status isn't "vacant" anymore, I send back a negative signal. Also, I must schedule a Cron worker to check the parking status 10 minutes before the expirtion – if it's still booked by then, send an email notification.
- 4. Client: if the response is negative, I show an error message: "This space is already occupied, try another". If the response is positive, I show a success message. Either way I update the diagram and take the user back to it after the dialog window. The space the user's booked is now filled with yellow and pulsating.
- 5. User: if all's good, I now can click the pulsating space. I click it.
- 6. Client: show the user the expiration time of their booking (10:15). It must be based on the received activeSince data for them to be in sync. Also show the Cancel booking button.
- 7. 10:05 comes: if the user still hasn't entered the lot (Parking1's status is still booked), send an email and schedule another Cron worker at 10:15.
- 8. User enters the lot at 10:12: the booking is still there, Parking1 still has the booked status, so Space1 remains unoccupied, and the user can enter the lot and start a parking. Parking1's status will change to active and a related Cron worker will get cancelled.
- 9. User fails to show up before 10:15: a Cron worker runs at 10:15, sees that the status of the parking is still booked, not active, so it changes it to cancelled, and the space's status changes to vacant and its relatedVehicle cleans up.


### Cancelling a booking
If the user cancels a booking manually, here's what happens:
- The related parking object's status changes to cancelled.
- The related space's status changes to vacant, its relatedVehicle changes to null.
This doesn't prevent the user from booking a space right after for this or another car (they can even book the same space for the same car) or entering the lot on any car without a booking if there's a vacant space.


## Parking lot diagram in the app
- a square with two rows with three spaces in each
- each space is stylized as a horse shape (SVG-drawn)
- vacant spaces are white inside and with a green outline, clickable (shows a window with: current rate, the book button)
- unavailable spaces (i.e. spaces that are occupied or booked by other users) are white inside and with a red outline, unclickable
- spaces occupied by or booked for the current user's vehicles: filled with yellow and pulsating, clickable (for occupied: current total, current rate, time parked, the contact support button; for booked: the expiration time, the cancel booking button)

## Other UI
### Header
Contains links to:
- Parking spaces (/spaces)
- My cars (/cars)
- Profile (/profile)

### Pages
- **Parking spaces**: the main screen, shows the layout diagram. URL: /spaces
- **Profile**: the user's profile, they can change their email or password there. Also has the Log out button. URL: /profile.
- **My cars**: the user's added cars in a list. Each card in a list shows: header (display name if specified or a default name like My car 1), sub-header (registration number), italicized paragraph (added on = latestStatusChange from the respective UserVehicle's object) + buttons: delete and edit. Also there's an **Add new car** button above the list. URL: /cars
- a. What the **Delete button** does is it removes the car's card from the client and changes the respective UserVehicle object's status to inactive. Neither UserVehicle, not Vehicle objects get deleted – just the connection is marked as inactive which enough to prevent the user from seeing it in the app, but it keeps the connection in the DB.
- b. The **edit button** lets the user change the display name.
- c. **Add new car** shows a dialog window with a form that expects the user to enter the registration number, the VIN number, and the registration certificate number, and an optional display name. The first three are required. The user clicks "Add" and the registration number is checked against the DB – if a matching vehicle already exists, the other two values are compares, and if the three match, a new UserVehicle is created if there's still none for this pair of user and vehicle. If there is, the status is changed to active. If VIN and certificate numbers don't match, an error is shown. If no car with this registration number exists in the DB, a new object is added for it, and a new connection UserVehicle is added too.
- **Authenticate**: lets you log in or sign up with email and password. URL: /authenticate