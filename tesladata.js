const Tesla = require('teslajs');
const MySQL = require('mysql');
const McCrypto = require('@doctormckay/crypto');
const FS = require('fs');
const HTTP = require('http');
const Config = require('./config.json');

const DOOR_DRIVER = 1 << 0;
const DOOR_PASSENGER = 1 << 1;
const DOOR_REAR_LEFT = 1 << 2;
const DOOR_REAR_RIGHT = 1 << 3;
const DOOR_FRUNK = 1 << 4;
const DOOR_LIFTGATE = 1 << 5;
const DOOR_SUNROOF = 1 << 6;
const DOOR_LOCKED = 1 << 7;

const CLIMATE_ON = 1 << 0;
const CLIMATE_PRECONDITIONING = 1 << 1;
const CLIMATE_BATTERY_HEATER = 1 << 2;

const VehicleState = {
	"Unknown": 0,
	"Charging": 1,
	"Supercharging": 2,
	"Driving": 3,
	"Parked": 4,
	"Awoken": 5,
	"ClimateOn": 6
};

const g_VehicleCommands = {
	"lock": function(callback) {
		Tesla.doorLock({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	},
	"unlock": function(callback) {
		Tesla.doorUnlock({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	},
	"start_climate": function(callback) {
		Tesla.climateStart({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	},
	"stop_climate": function(callback) {
		Tesla.climateStop({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	},
	"flash_lights": function(callback) {
		Tesla.flashLights({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	},
	"honk_horn": function(callback) {
		Tesla.honkHorn({"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId}, callback);
	}
};

const g_VehicleCommandsWithRefresh = ["lock", "unlock", "start_climate", "stop_climate"];

var g_VehicleStateInterval = {}; // these are in minutes
g_VehicleStateInterval[VehicleState.Unknown] = 1;
g_VehicleStateInterval[VehicleState.Charging] = 5;
g_VehicleStateInterval[VehicleState.Supercharging] = 1;
g_VehicleStateInterval[VehicleState.Driving] = 1;
g_VehicleStateInterval[VehicleState.Parked] = 30;
g_VehicleStateInterval[VehicleState.Awoken] = 1;
g_VehicleStateInterval[VehicleState.ClimateOn] = 1;

var g_BearerToken;
var g_BearerTokenExpiresTime = Infinity;
var g_DB;
var g_CurrentState = VehicleState.Unknown;
var g_LastState = VehicleState.Unknown;
var g_LastStateChange = 0;
var g_PollTimer;

function log(msg) {
	var date = new Date();
	var time = date.getFullYear() + "-" +
		(date.getMonth() + 1 < 10 ? '0' : '') + (date.getMonth() + 1) + "-" +
		(date.getDate() < 10 ? '0' : '') + date.getDate() + " " +
		(date.getHours() < 10 ? '0' : '') + date.getHours() + ":" +
		(date.getMinutes() < 10 ? '0' : '') + date.getMinutes() + ":" +
		(date.getSeconds() < 10 ? '0' : '') + date.getSeconds();
	
	console.log(time + " - " + msg);
}

if (!process.env.ENCRYPTION_KEY) {
	log("Encryption key needed");
	process.exit(1);
}

g_DB = MySQL.createConnection(Config.mysql);
g_DB.connect((err) => {
	if (err) {
		throw err;
	}
	
	log("Connected to MySQL with thread ID " + g_DB.threadId);
	auth();
});

function auth() {
	log("Decrypting refresh token");
	var refreshToken = McCrypto.decrypt(process.env.ENCRYPTION_KEY, new Buffer(Config.tesla.encryptedToken, 'base64'));
	
	log("Obtaining new bearer token...");
	Tesla.refreshToken(refreshToken, (err, res) => {
		if (err) {
			throw err;
		}
		
		var body = JSON.parse(res.body);
		
		if (!body || !body.access_token || !body.refresh_token || !body.expires_in) {
			throw new Error("Got malformed response");
		}
		
		log("Got new refresh token " + body.refresh_token.substring(0, 6) + "...");
		g_BearerToken = body.access_token;
		Config.tesla.encryptedToken = McCrypto.encrypt(McCrypto.Cipher.AES256CTRWithHMAC, process.env.ENCRYPTION_KEY, body.refresh_token).toString('base64');
		FS.writeFileSync(__dirname + '/config.json', JSON.stringify(Config, undefined, "\t"));
		
		g_BearerTokenExpiresTime = Date.now() + (1000 * (body.expires_in - (60 * 60)));
		getData();
	});
}

function getData() {
	clearTimeout(g_PollTimer);

	if (g_BearerTokenExpiresTime <= Date.now()) {
		g_BearerTokenExpiresTime = Infinity;
		auth();
		return;
	}
	
	log("Requesting data");
	var options = {"authToken": g_BearerToken, "vehicleID": Config.tesla.vehicleId};
	
	Tesla.vehicleData(options, function(err, result) {
		if (err) {
			log("Can't get vehicle data: " + (err.message || err));
			enqueueRequest();
			return;
		}

		let state = getState(result);
		if (state != g_CurrentState) {
			log("State is now " + state + " (was " + g_CurrentState + ")");
			g_LastState = g_CurrentState;
			g_CurrentState = state;
			g_LastStateChange = Date.now();
		}
		
		var charge = result.charge_state;
		var climate = result.climate_state;
		var drive = result.drive_state;
		var vehicle = result.vehicle_state;
		
		var climateFlags = flagify(climate, {"is_climate_on": CLIMATE_ON, "smart_preconditioning": CLIMATE_PRECONDITIONING});
		if (charge.battery_heater_on) {
			climateFlags |= CLIMATE_BATTERY_HEATER;
		}
		
		var doorFlags = flagify(vehicle, {"df": DOOR_DRIVER, "pf": DOOR_PASSENGER, "dr": DOOR_REAR_LEFT, "pr": DOOR_REAR_RIGHT, "ft": DOOR_FRUNK, "rt": DOOR_LIFTGATE, "locked": DOOR_LOCKED});
		if (vehicle.sun_roof_percent_open > 0) {
			doorFlags |= DOOR_SUNROOF;
		}

		let chargeState = charge.charging_state;
		if (chargeState === null) {
			chargeState = charge.charge_port_door_open ? 'Complete' : 'Disconnected';
		}
		
		var cols = {
			"timestamp": Math.floor(Date.now() / 1000),
			"charging_state": chargeState,
			"battery_level": charge.battery_level,
			"battery_range": charge.battery_range,
			"charge_rate": charge.charge_rate,
			"inside_temp": climate.inside_temp,
			"outside_temp": climate.outside_temp,
			"climate_flags": climateFlags,
			"speed": drive.speed,
			"latitude": drive.latitude,
			"longitude": drive.longitude,
			"heading": drive.heading,
			"gps_as_of": drive.gps_as_of,
			"door_flags": doorFlags,
			"odometer": vehicle.odometer,
			"charge_state": JSON.stringify(charge),
			"climate_state": JSON.stringify(climate),
			"drive_state": JSON.stringify(drive),
			"vehicle_state": JSON.stringify(vehicle)
		};
		
		g_DB.query("INSERT INTO `tesla_data` SET ?", [cols], (err) => {
			if (err) {
				throw err;
			}
			
			log("Recorded data in database at time " + cols.timestamp);
			enqueueRequest();
		});
	});
}

function enqueueRequest() {
	clearTimeout(g_PollTimer);

	let timeout = g_VehicleStateInterval[g_CurrentState];
	let usingLast = false;

	if (Date.now() - g_LastStateChange < 1000 * 60 * 10) {
		timeout = Math.min(timeout, g_VehicleStateInterval[g_LastState]);
		usingLast = true;
	}

	log("Enqueueing next request in " + timeout + " minute(s) due to state " + g_CurrentState + (usingLast ? " (and previous " + g_LastState + ")" : ""));
	g_PollTimer = setTimeout(getData, 1000 * 60 * timeout);
}

function getState(response) {
	if (response.charge_state && response.charge_state.charging_state == "Charging" && response.charge_state.fast_charger_present) {
		return VehicleState.Supercharging;
	}

	if (response.charge_state && response.charge_state.charging_state == "Charging") {
		return VehicleState.Charging;
	}

	if (response.drive_state && response.drive_state.shift_state) {
		return VehicleState.Driving;
	}

	if (response.climate_state && response.climate_state.is_climate_on) {
		return VehicleState.ClimateOn;
	}

	return VehicleState.Parked;
}

function flagify(obj, flags) {
	var out = 0;
	
	for (var flag in flags) {
		if (flags.hasOwnProperty(flag) && obj.hasOwnProperty(flag) && obj[flag]) {
			out |= flags[flag];
		}
	}
	
	return out;
}

HTTP.createServer((req, res) => {
	if (req.method == 'GET' && req.url == '/vehicle_state') {
		req.on('data', () => {});
		res.setHeader("Content-Type", "application/json; charset=UTF-8");
		res.end(JSON.stringify({"current_state": g_CurrentState, "last_state": g_LastState, "now": Date.now(), "last_change": g_LastStateChange}));
	} else if (req.method == 'POST' && req.url == '/awake') {
		log("Awoken from external input");

		g_LastState = g_CurrentState;
		g_CurrentState = VehicleState.Awoken;
		g_LastStateChange = Date.now();
		getData();

		req.on('data', () => {});
		res.statusCode = 204;
		res.statusMessage = "No Content";
		res.end();
	} else if (req.method == 'POST' && req.url.match(/^\/command\/[a-z_]+$/) && g_VehicleCommands[req.url.substring(9)]) {
		let command = req.url.substring(9);
		log("Received command " + command);

		res.setHeader("Content-Type", "application/json; charset=UTF-8");
		g_VehicleCommands[command]((err) => {
			if (err) {
				log("Cannot send command " + command + ": " + err.message);
				res.end(JSON.stringify({"success": false, "error": err.message}));
			} else {
				log("Sent command " + command + " successfully");
				res.end(JSON.stringify({"success": true}));

				if (g_VehicleCommandsWithRefresh.includes(command)) {
					setTimeout(getData, 1000);
				}
			}
		});
	} else {
		log("Internal URL not found: " + req.method + " \"" + req.url + "\"");
		res.statusCode = 404;
		res.statusMessage = "Not Found";
		res.setHeader("Content-Type", "text/plain; charset=UTF-8");
		res.end("Not Found");
	}
}).listen(2019, "127.0.0.1");
