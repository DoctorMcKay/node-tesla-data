# Tesla Data Recorder

This application will pull data for a Tesla vehicle and store it in a MySQL database periodically. How frequently it
pulls data is dependent on the "state" of the vehicle. If the state changed within the past 10 minutes, then the minimum
of the current and previous state will be used (that is, whichever prescribes more frequent polling).

The states are:

- 0 = Unknown (the default state on startup): 1 minute
- 1 = AC charging: 5 minutes
- 2 = DC charging (Supercharger, CHAdeMO, etc): 1 minute
- 3 = Driving: 1 minute
- 4 = Parked and not charging: 30 minutes
- 5 = Awoken via external input: 1 minute
- 6 = Parked with HVAC on: 1 minute
- 7 = Asleep: 6 hours

Data is recorded to a MySQL table. The query you should use to create the table is in `create_table.sql`.

### Sleepy Cars

If you have "always connected" disabled, then your Tesla will "go to sleep" after some time when not charging (and
probably only when energy saving is active, not sure). In this case, when a data pull is scheduled, the application will
wake the vehicle first.

When a vehicle is awoken, the next data pull will not be for 6 hours, to minimize battery drain. It's recommended that
you only disable "always connected" when you will be away from your vehicle for a long time, to minimize phantom drain.

# Installation

1. **You will need Node.js v6 or later.** Clone the repository and run `npm install` in it to download dependencies.
2. Copy `config.sample.json` to `config.json` and enter your MySQL credentials. Leave the `tesla` section alone for now.
3. Generate an encryption key. This should be a rather long random string of characters. You will need to supply this key to all invocations through the `ENCRYPTION_KEY` environment variable. On Linux, you can do this using `ENCRYPTION_KEY=keyhere node script.js` 
4. Run `node auth.js` and enter your MyTesla username and password when prompted. This will save your encrypted refresh token to `config.json`, and will display a list of all your vehicles.
5. Pick the ID (not the VIN) of the vehicle you want to track, and put it in `config.json`.
6. Now all you need to do is run `tesladata.js`, being sure to supply your `ENCRYPTION_KEY`. If you want to run it as a daemon, [forever](https://www.npmjs.com/package/forever) is a good way to do that.
    - Install forever with: `npm install -g forever` (run with `sudo` or an elevated command prompt)
    - To run on Linux with an encryption key: `ENCRYPTION_KEY=keyhere forever start tesladata.js`
    - Once invoked with the key, you can restart it without supplying the key: `forever restart tesladata.js`

# Flags

Two types of data are stored in the database as bitwise flags.

### climate_flags

- `CLIMATE_ON` = 1 << 0 (1)
- `CLIMATE_PRECONDITIONING` = 1 << 1 (2)
- `CLIMATE_BATTERY_HEATER` = 1 << 2 (4)

### door_flags

- `DOOR_DRIVER` = 1 << 0 (1) [indicates driver's door is open]
- `DOOR_PASSENGER` = 1 << 1 (2)
- `DOOR_REAR_LEFT` = 1 << 2 (4)
- `DOOR_REAR_RIGHT` = 1 << 3 (8)
- `DOOR_FRUNK` = 1 << 4 (16)
- `DOOR_LIFTGATE` = 1 << 5 (32)
- `DOOR_SUNROOF` = 1 << 6 (64)
- `DOOR_LOCKED` = 1 << 7 (128)

# External Input

The app creates an HTTP server on localhost (127.0.0.1) port 2019. You can use these URLs:

### GET /vehicle_state

This returns a JSON response containing the vehicle's `current_state`, its `last_state`, `now` (the current Unix time with milliseconds), and `last_change` (when the state last changed as Unix time with milliseconds).

The numbers correspond to the states at the top of this document.

### POST /awake

"Wakes up" the app. This does not send any wake-up command to the car. Instead, it changes the vehicle's internal state
to `Awoken` (5) which makes it start polling every 1 minute. The state will immediately change to something else, so this
effectively makes polls happen every minute for 10 minutes (unless a state change happens again).

It might be useful to trigger this whenever you get in the car (for example, using Tasker when you connect to Bluetooth)
so that data is pulled immediately when you start driving instead of waiting for the next data pull to realize that the
state should change.

Response is 204 No Content.

### POST /command/[command]

Execute a command on the car. Available commands are:

- lock
- unlock
- start_climate
- stop_climate
- flash_lights
- honk_horn
- start_charge
- stop_charge
- open_charge_port (also unlocks the charge port if a cable is plugged in and charging has been stopped)
- close_charge_port (if equipped with a motorized charge port)
- wake_up
- vent_sunroof (if equipped)
- close_sunroof (if equipped)
- trigger_homelink (requires you to set your MyTesla email in config.json)

Response is JSON with a boolean `success` parameter. In event of failure, there is also a string `error`.

# Frontend UI

There isn't one. You'll need to write one yourself.
