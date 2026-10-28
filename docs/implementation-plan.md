# The roadmap for how this app is planned to be built

## Main functions
### Main system's functions
- 1. **allowEntrance**: main sys gets a registration number from the bar post app, checks if the car can enter (booked or available spaces), and returns a boolean to the bar post
- 2. **handleNewParking**: main sys gets an approval of the car's entrance, activates the car's parking, and changes a space's status – to achieve both an accurate representation of the lot's state and start tracking a particular car's parking
- 3. **allowExit**: main sys gets a registration number from the bar post app, calculates the parking total fee, sends it to the payment terminal app, waits for the response, reflects the payment's data in a new object, sends a response to the bar post depending on whether the payment was a success (if it was the parking's status is changed to finished)
- 4. **handleCarExit**: main sys gets an approval of the car's exit and changes the status of the space it occupied to vacant
- 5. **handleNewBooking**: main sys gets a request to book a space from the client. It checks if the space is still vacant, and if it is, changes the status to booked and creates a new booking object, then returns required data to the client.
- 6. **cancelBooking**: main sys gets a request to cancel a booking, so it checks if there's a parking object that can be cancelled, and if there is (i.e. its status is still "booked"), it changes the status to cancelled, and sends back an acknowledgement.
- 7. **handleBookingNotification**: a Cron worker that is scheduled to run 10 minutes before a booking's expiration time. It sends an email notification to the user and schedules another Cron worker to run at the expiration time.
- 8. **checkBookingStatus**: a Cron worker scheduled to run at the expiration time. It checks the specified parking's status, and if it's still booked, changes it to cancelled, and updates the related space's status from booked to vacant.

### Other systems' functions
- 1. [Bar post] **handlePassthrough**: receive a car number from the camera module, send it to the main sys, await decision on whether to let it go, act based on the res., store info about successful passthroughs in a DB
- 2. [Payment terminal] **handlePayment**: receive total from main sys, receive input from the UI, await the payment provider's response, send the response back to main sys


## Order
- 1. allowNewEntrance:
- - models: Vehicle, Space, Parking, Passthrough (bar post).
- - logic:
- - - Bar post: receive a car number and a direction ("in"), send to the main sys (/api/new-entrance), await the response, act on the response: send a certain negative message to the interface or open the bar post and create a passthrough
- - - Main sys: receive a car number, fetch space data (booked for this number & vacant), if possible to let the car in, make sure there's a booked space for it and a related parking object, then send a positive response to the bar post. If you can't let it in, send a negative response.
- - success criteria cases to test:
- - 1. all spaces are vacant, a car approaches, a space gets booked, a parking gets created, the car enters, the space and the parking get updated
- - 2. all spaces are occupied, a car approaches, it's not allowed to enter
- - 3. all spaces are booked for other cars, a car approaches, it's not allowed to enter
- - 4. 5 spaces are occupied, 1 is vacant, a car approaches, a space gets booked, a parking gets created, the car enters, the space and the parking get updated
- - 5. 5 spaces are occupied, 1 is booked for this car, a car approaches, the car enters, the space and the parking get updated

- 2. handleNewParking:
- - models: Vehicle, Space, Parking
- - logic:
- - - Bar Post: send the car's data to the main sys: regNumber, time (/api/new-parking). It doesn't need a response.
- - - Main sys: receive car data, find a parking for this car (status: booked, regNumber) and a space booked for it (status: booked, relatedVehicle: regNumber) and update both if they exist. Parking: status: active + time-related fields. Space: status: occupied.
- - success criteria cases to test:
- - 1. Data comes, both a booked parking and a space associated with the provided car's number exist, they get successfully updated.
- - 2. Data comes, a booked parking does exist, but the space mentioned in it has status: vacant. The parking still gets updated, the space also gets updated to status: occupied, a non-critical log is registered.
- - 3. Data comes, a booked parking does exist, but the space mentioned in it has status: occupied and the relatedCar is the same. The parking gets updated, the space also gets updated to status: occupied, a non-critical log is registered.
- - 4. Data comes, a booked parking does exist, but the space mentioned in it has status: occupied and the relatedCar is different. The parking gets status: cancelled, the space remains as it is, a critical log is registered.
- - 5. Data comes, the space is fine, but a related parking doesn't exist. The parking gets created, the space is updated as expected. A non-critical log is registered.
- - 6. Data comes, the space is fine, but there are several parkings with status: booked and this car's number. The space gets updated, only one parking with this car's number and this parking space is updated. The rest for both this car and space are cancelled and for each a non-critical log is registered. If there are parkings for this car and another space, they also get cancelled and a non-critical log is registered for eaach.
- - 7. Data comes malformed: just the number, but no time or the time contains something other than a timestamp. A non-critical log is registered, the time is set to now. The space and the parking exist – they get updated as expected.
- - 8. Data comes malformed: the time is OK, but there's no number or it contains something other than a string with a length between 1 and 15. A critical log is registered. Neither space, not parking can be found for this car – an immediate response from the support team is expected.

- 3. allowExit:
- - models: Vehicle, Space, Parking, Payment, POSPayment (POS), Passthrough
- - logic:
- - - Bar post: receive a car number and a direction ("out"), send to the main sys (/api/new-exit), await the response, act on the response: send a certain negative message to the interface or open the bar post and create a passthrough 
- - - Main sys: receive the car number, fetch parkings that have: status: active, regNumber: received car number; calculate the final total, create a payment object, and send it to the payment terminal, await the response, handle the response accordingly, send a response to the bar post.
- - - Payment terminal: receive a total, create a payment object, await input from the user, send a request to the payment provider, await the response, handle the response (update the payment object accordingly), send the respponse back to the main sys.
- - success criteria cases to test:
- - - 1. Main sys receives a regNumber, fetches parkings that have status: active and regNumber, there's just one parking like that, the final total is calculated, a payment object is created (status: pending), the total is sent to the mocked payment app, the payment app returns a success, main sys updates the related parking object (status: active –> finished) and payment object (status: pending –> success), then sends a positive response to the bar post.
- - - 2. Main sys receives an invalid regNumber (not a string or a string the length of which isn't between 1 and 15 characters), can't fetch related parkings, sends back a negative response to the bar post.
- - - 3. Main sys receives a valid regNumber, fetches parkings that have status: active and regNumber, doesn't get any, registers a critical log to attract support, sends back a negative response to the bar post.
- - - 4. Main sys receives a valid regNumber, fetches related parkings, gets more than one, registers a critical log to attract support, sends back a negative response to the bar post.
- - - 5. Main sys receives a valid regNumber, fetches related parkings, there's just one, the final total is calculated, a payment object is created (status: pending), the total si sent to the mocked payment app, the payment app returns "cancelled", the main sys updates the payment object (status: pending –> cancelled), a non-critical log is registered, sends back a negative response to the bar post.
- - - 6. Same as 5, but with "failed" instead of "cancelled". The payment object is updated (status: pending –> failed), a critical log is registered, the main sys sends back a negative response to the bar post.

- 4. handleCarExit
- - models: Vehicle, Space
- - logic:
- - - Bar post: when the bar post is closed after an exiting car, it sends the exiting car's regNumber to the main logic (/api/space-vacant-again). It doesn't need a response.
- - - Main sys: receives the regNumber, gets the space with relatedVehicle === regNumber, nullifies relatedVehicle, changes the status to vacant. It doesn't need to respond.
- - success criteria cases to test:
- - - 1. Main sys receives a valid regNumber, fetches a space where relatedVehicle === regNumber, the status is occupoed, the sys changes its status to vacant and its relatedVehicle to null.
- - - 2. Main sys receives an invalid regNumber (not a string or a string with a length not between 1 and 15), registers a critical log to attract support.
- - - 3. Main sys receives a valid regNumber, tries to fetch a space where relatedVehicle === regNumber, but there's none, so it registers a critical log to attract support.
- - - 4. Main sys receives a valid regNumber, fetches spaces where relatedVehicle === regNumber, gets more than 1, updates all to status: vacant, relatedVehicle: null, registers a critical log to attract support.
- - - 5. Main sys receives a valid regNumber, fetches a space where relatedVehicle === regNumber, the status is booked, the sys changes its status to vacant and cleans up the rleatedVehicle, and registers a non-critical log (you can't book a second space for the same car when you're parked, and you can't book a space before this cleanup happens even if you've already left the parking lot)
- - - 6. Main sys receives a valid regNumber, fetches a space where relatedVehicle === regNumber, the status is vacant, the sys cleans up the relatedVehicle, and registers a non-critical log (vacant spaces can't have relatedVehicle)

- 5. Parking log layout diagram interface
A frontend feature at /spaces. While it must be available only to authenticated users, at first it can be accessed freely. What it includes:
- a rectangle with 2 rows of 3 horse-shaped components
- loading state: a spinner inside the rectangle instead of the rows
- error state: a red centered text + a button inside the rectangle instead of the rows. Text: An error occurred when loading spaces. Button: Try again (and it sends another request to fetch space data).
- available spaces: all spaces with status: vacant are available in the interface. They have a green outline and they are clickable: on click a window is shown: header (the display name of the space like "A1"), subheader (rates per hour at day and night: 8:00-20:00: day rate value, next line: 20:00-8:00: night rate value), button (Book this space).
- - Clicking the Book this space button opens another dialog window (the previous one is closed). The user is expected to enter a vehicle number or select it from the list of saved numbers (UserVehicle related to the current User, at this stage the list is empty, since we don't have a user), then click `Book for ${specified car number}` (no logic for it at this stage yet, so it's ok for it to not work by now).
- unavailable spaces: spaces with status: occupied or booked (can't happen yet) that have relatedVehicle referring to a car not from the current user's car list (at this stage it means all occupied or booked spaces). They have red outline and they are not clickable.
- this interface must be updated every time the server updates any of the spaces.
- success criteria cases to test:
- - 1. The parking lot is empty (all spaces are vacant, i.e. green and clickable). A car enters, one space is assigned to it – it becomes red and unclickable. 
- - 2. The parking lot is full (all spaces are occupied, i.e. red and unclickable). A car exits, one space becomes vacant – it becomes green and clickable.