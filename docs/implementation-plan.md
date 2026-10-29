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

- 6. User authentication
Now that we have the parking layout diagram, we need to add user-exclusive capabilities. First of all, we need the authentication system and page (/authenticate).
- One page for two actions: log in and sign up. What's shown is controlled by a state. The state is changed with a tab switch: one tab for log in, one for sign up.
- The login has 2 text inputs, the signup has three (confirm your password).
- Logging in sends data to the server to check the correctness of the credentials. The password is not stored as plain text – it's safely cyphered. The input is validated first at the frontend (empty fields are errors, so are emails that don't match an email pattern and passwords shorter than 8 characters), then at the backend (to make sure they are of the right type and length (1-30 characters)).
- Signup performs similar frontend and backend validations, it just also compares two passwords. Obviously, a user can't be created for an email that another user already uses, so that is a backend check. Passwords must be 8-30 characters long, they must include one Latin character, one number, and one special character (nothing fancy, just the ordinary things allowed) – other characters aren't allowed.
- On successful authentication, the user is taken to the diagram layout (/spaces). Now that we have authentication, you can't access /spaces without it.
- success criteria cases to test:
- - 1. /spaces redirects to /authenticate if the user isn't authenticated
- - 2. /authenticate automatically redirects the user to /spaces on successful authentication
- - 3. /authenticate redirects to /spaces for authenticated users
- - 4. Signing up creates a new user object and stores its password as a cypher.
- - 5. Entering passwords and emails that fail to validate won't let you create an account or log in.

- 7. Profile page
Now that we have authentication, we can add the page that has the opposite action – logging out. It also features more settings.
- URL: /profile.
- It's only accessible for authenticated users. The URL is the same for all users, the right profile data is loaded thanks to the stored user ID (in an authentication token most likely). We must make sure that the sender of the request to achieve a certain user's ID is the same user that's requesting it – this is for safety reasons to achieve users getting someone else's data.
- Profile's layout: a simple page with three main elements: email, password, and log out.
- - Email: displayed in full, has a label (Your email), and an Edit button. Clicking Edit lets you edit the email and asks for your current password – then you can click Save. The new email must not be used by another user: if it is, the change fails with the message "Email already in use, try another". For simplicity, we won't make it more sophisticated than this. Clicking "Save" updates the DB entry. Before we receive a confirmation, there's a loading element shown + the page's data isn't accessible. If there's an error or a timeout, an error is shown with the suggestion to reload the page. There's also a Cancel button to exit the editor without saving changes.
- - Password: displayed as asterisks (a fixed placeholder: only a hash of the password is stored, so the real one can't be shown). Also has a label (Your password), and an Edit button. Clicking Edit opens three empty fields: the current password, the new password, and its confirmation. Each has a Show button that shows what's typed instead of asterisks – obviously, it flips to "Hide" after clicking Show. Also, there's a Save button that works similarly to that of the email field. And there's also a Cancel button that exits the editor without saving changes.
- - The same validations apply to both as they would on sign up.
- - Log out button: logs the user out and automatically redirects them to /authenticate. All protected routes start redirecting the user to /authenticate until they authenticate again.
- Since we now have two pages, we need a header navigation too: Parking Diagram (/spaces) and My Profile (/profile).
- success criteria cases to test:
- - 1. /profile redirects to /authenticate if the user isn't authenticated
- - 2. Clicking the logout button redirects to /authenticate and prevents from further access to protected routes until the user logs back in.
- - 3. Changing the email and password does change them on the server.
- - 4. If the server returns an error, retrying a data load shows email and password values before edition.
- - 5. If you switch to another page (/spaces e.g.) or reload the page while editing any field, the changes are discarded and the editor isn't active.
- - 6. You can't change email or password to an empty string. You also can't make it longer than allowed, neither can you enter charcaters other than Latin characters and numbers.
- - 7. You can't change your email to one that another user already uses: the change fails with the message "Email already in use, try another" and the email stays the same.
- - 8. You can't change your email or password without entering the right current password.


- 8. My cars page
This is where you can add and remove associated cars when authenticated.
- URL: /cars
- At first, when there are no associated cars, the user only sees the button "Add car" (it remains at the top of the page after cars are added). Clicking it opens a dialog window that prompts you to enter three required values: registration number, VIN, certificate number – and one optional: display name. There are three buttons: Save, Cancel (both at the bottom), and a cross button (top right). Cancel and a cross button do the same thing – they hide the window and discard the progress. Clicking off the dialog window does the same (should work for all dialog windows across the app).
- Clicking "Save" first runs frontend validation: all three required fields must have values, and they should pass a RegEx check: registration number and certificate number must be from 3 characters to 15, VIN number is expected to be from 5 to 17 characters. All must only allow Latin characters and numbers. Then the data goes to the server where it's checked whether an entry with this car already exists (there can't be more than one car with one unique registration number), if there's already a car with this registration number, its VIN and certificate numbers are checked – if they are wrong, the user gets an error and nothing is created. If the vehicle object with this regNumber exists and the VIN and certificate number are correct, a new UserVehicle object is created. If there's no vehicle object for this regNumber, a new one is created, VIN and certificate number are added without a check (that's a huge simpliciation, of course), and a UserVehicle object is created right after.
- If the display name hasn't been specified, a placeholder is automatically added: New car. It's saved in the database as well.
- If the car is successfully added, it's displayed as a card in the /cars below the Add new button. The card shows the display name, the registration number, the date added (since its latest addition to the list, not since its first addition to the list – there's a described latestStatusChange field for that in initial-description). It also has two buttons: Edit and Delete.
- Edit lets you change the display name. The functionality is the same as with email / password on the Profile change. Limitations: only Latin characters, numbers, spaces, apostrophes and hyphens, trimmed, 1-20 characters.
- Delete asks for a confirmation first. It doesn't really delete anything: it just changes the status of the related UserVehicle to inactive and clears its display name (re-adding the car without a name gives it the default one again).
- Only active UserVehicle relations are displayed here. We know the user ID from the token, so we search for UserVehicle with this user's ID and with status: active. We list them here from latest to earliest (based on latestStatusChange).
- success criteria cases to test:
- - 1. /cars redirects to /authenticate if the user isn't authenticated
- - 2. Adding a car creates a new Vehicle object with the passed data if there wasn't one before and a UserVehicle object connecting the current user and the vehicle.
- - 3. Adding a car creates only a new UserVehicle object if there already is a Vehicle object and the three required values match those in it.
- - 4. Adding a car doesn't create anything if the Vehicle object with the specified registration number already exists but the other two fields don't match.
- - 5. Deleting a car from the list doesn't delete the Vehicle object – it only changes the status of the UserVehicle object. The "deleted" car also doesn't appear in the car list.
- - 6. Deleting a car and re-adding it doesn't create a new Vehicle object or a UserVehicle object – it finds the existing Vehicle, checks the required fields, if they match, it looks up a UserVehicle object before creating a new one, and changes status and latestStatusChange. The car is now visible again in the list and is the first car in it.
- - 7. Editing the car's display name and reloading the page or navigating elsewhere and coming back discards the edition progress and the editor isn't active when you come back.
- - 8. You can't edit a few car cards simultaneously. You can only edit one at a time – others' buttons are disabled while an editor is active for one car.


- 9. Booking from the app and seeing differently spaces associated with your car
Now that we have all the frontend we need, we can finally get to bookings through the app's display.
- An authenticated user can click an available space, then click the Book this space button (there's also a Close button to close the window), and get to enter their car's registration number. They have 2 options: choose a car from the list of added cars or add a new one. Adding a new one works the same as on the My car page. After adding a car the user is taken back to the dialog where they must choose a car and see the same thing: choose a car from the list or add a new one.
- After choosing a car, the user can click "Book for [car number]". There's also a "Back" button that takes the user to the previous window. If the user clicks "Book for [car number]", the client sends a request to do the following: change the selected space's status to booked and add the vehicle's registration number to relatedVehicle, and create a parking with status: booked for this space and this vehicle. The space must be checked beforehand: someone could've booked it a second ago, after the user opened the dialog window for this space but before they clicked Book for this car.
- If the space suddenly turns out to be booked or occupied (i.e. unavailable), the user is shown a respective message ("This space is unavailable, please try another") and upon clicking "OK" they are taken to /spaces with no dialog windows open and with the newly unavailable car space marked as red and unclickable.
- If the user succeeds at booking, they are shown a success message ("You've just booked space A1 for XXOOOXX! Please enter the parking lot within 15 minutes before your booking expires" and the button OK). Clicking OK takes the user to /spaces without an open dialog window, and the space they've booked is now filled with yellow and is pulsating.
- User-related occupied spaces are highlighted not with just the data coming from the usual diagram data fetch – it comes from checking whether the user has associated cars with active or booked parkings. They both are highlighted equally (but show different windows on click, for now we're only working on booked spaces).
- Clicking the space now shows the booking expiration time ("This space is booked for XXOOOXX. The booking expires at xx:xx"). There's also the Cancel button.
- For now Cancelling doesn't work. The expiration time doesn't affect anything yet – the parking and the space remain in the booked status so far.
- success criteria cases to test:
- - 1. A user without associated cars doesn't have anything on the list to choose from, so they can only see the Add new car button.
- - 2. After adding a new car the user is taken back to the car selection window.
- - 3. Booking a space successfully: a space is updated properly (status and relatedVehcile), a parking is created with the right values in its fields, the user is taken back to the diagram, and the right space is highlighted with yellow and is clickable.
- - 4. Reloading a page or navigating elsewhere and returning still shows the highlighted space you booked for your car.


- 10. Cancelling the booking manually
Now we need to add booking cancellation.
- The user opens the diagram (/spaces), clicks a highlighted space they booked, click "Cancel booking".
- This does the following: the space is updated (status: vacant, relatedVehicle: undefined), the parking is updated (status: cancelled, time-related values are nullified).
- On success, the user is shown a message "Booking cancelled" and the OK button. Clicking OK takes the user back to the layout diagram, but now the previously booked space isn't highlighted, it's just green.
- success criteria cases to test:
- - 1. A user cancels a booking and both related objects get updated properly.
- - 2. A user cancels a booking, comes back to the diagram, and the previously booked space isn't highlighted anymore, and it's available (green and clickable).

- 11. Booking behavior as time elapses and automatic cancellation
Now we must make use of time-related mechanisms that control bookings.
- The user has booked the car and hasn't showed up. 10 minutes before the expiration (i.e. 5 minutes after the booking started in our case), an email is sent to the user's email.
- The email service must be mocked: we just send a request and get a positive response after a 1-second timeout or something.
- This email dispatch must happen at a certain scheduled moment, so we'll need Cron or something similar to do that. We know the exact dispatch time from the beginning: 10 minutes before the expiration time. Since the duration of a booking isn't long (just 15 minutes) and we don't have many spaces (just 6), it will be an overkill to have some interval-based Cron workers that would check if it's time to dispatch a newsletter. So we can just schedule the dispatch for each booking indivdually upon creation of a booking.
- As soon as we changed the space's status to booked and created a related parking, we also schedule a worker at "expiration time - 10 minutes".
- The contents of the email don't matter.
- We deliberately aren't making a separate data model for it for simpliciation, although I would make one for a real-life case.
- The email worker ran, now it must schedule another worker: the one that actually cancels the booking at the expiration time. It must be scheduled right at the expiration time taken from the related parking object. What it does: changes the space's status to vacant and nullifies the relatedVehicle, then cancels the booking and nullifies its time-related fields.
- The server sends an update on this change just as it would with any other space update.
- success criteria cases to test:
- - 1. A user booked a space but hasn't showed up for 5 minutes – an email was sent to them (we got a response from the mocked email service).
- - 2. A user booked a space but hasn't showed up for 15+ minutes – the booking got cancelled automatically and they now don't see any highlighted space in the diagram.

- 11. Tracing a parking
How does a user interact with the space and the parking when their parking is active?
- When the parking is active, the user sees the related space as highlighted (yellow and pulsating). It looks the same as a booked parking from the diagram.
- Clicking it shows another window: it shows the total charge, since when the parking is active, and what the current rate is.
- Each opening of this window triggers a total calculation with the respective update of the parking object.
- success criteria cases to test:
- - 1. A user clicks a space occupied by their car and sees the current total and rate

- 12. UI for parking history
Another page: /history. Must also be added to the header. Only available to authenticated users.
- Shows a list of cards (similar to those for cars in My cars) with parkings.
- Each card: Car's display name, date, car number, total, status.
- By default: 10 latest parkings. No sorting or limit options in the client (for simplicity).
- The list has pagination: it's shown at the top and bottom of the page (the same element placed at two places for convenience). It shows numbers for pages with 1 for the initial page + arrows: left to go to a previous page, right to go to a next one.
- Clicking a card with history does nothing, since all the info is already shown in the card. A user can't edit or delete these cards, so they can just view them in the list form.
- What parkings must be shown? Ideally it should work like this: only parkings for active associated cars with the date after the lastStatusChanged in the related UserVehicle. That is, if the user adds a car, then removes it, the history won't show related parkings. If the user adds the car back, only new parkings associated to it will be shown. If the car the user has added already had parkings before they added it, they won't see them.
- success criteria cases to test:
- - 1. /history redirects to /authenticate for unauthenticated users
- - 2. Up to 10 latest parkings are shown to the user on the initial load of this page.
- - 3. Pagination appears and works correctly for 11 and more parkings.
- - 4. Removing a car affects the parking list: associated parkings aren't shown anymore
- - 5. Returning the car back doesn't bring back parkings made before the removal – but new ones are shown

- 13. Managing multiple bookings and occupations
The user can have multiple cars on the list.
- They can book multiple spaces for different cars. This should work properly: both spaces are highlighted, clicking both shows the expected dialog and allows cancelling, both make it clear which car is associated (the registration number).
- They can have one space book while another occupied. Both spaces are highlighted, clicking them shows the expected dialog (booking for one, occupation for the other), the former allows cancelling, the latter triggers a total update.
- They can have two or more spaces occupied by associated cars too.
- success criteria cases to test:
- - 1. Booking two or more spaces from one account works as expected: multiple spaces become highlighted, show the expected dialog on click, can be cancelled, and the related objects get updated respectively (spaces and parkings)
- - 2. Occupying two or more spaces from one account works as expected: multiple spaces become highlighted, show the expected dialog on click, trigger a total and rate update, and the related objects get updated respectively (spaces and parkings)
- - 3. Having some spaces booked and some occupied from the same account works as expected: multiple spaces become highlighted, show the expected dialog on click, can be cancelled OR trigger a total and rate update, and the related objects get updated respectively (spaces and parkings)


- 14. Concurrency control
The task explicitly requires to handle multiple tabs. So we must make sure the app works stably for that.
- success criteria cases to test:
- - 1. Booking a space in one tab updates the space in both tabs (two different users): in the one it was booked it becomes highlighted, in the other – unavailable.
- - 2. Booking a space in one tab updates the space in both tabs (one user with two tabs): both tabs now have the car highlighted.
- - 3. Cancelling a booking in one tab updates the space in both (two different users): in both the space becomes available.