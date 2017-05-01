var Tesla = require('teslajs');
var MySQL = require('mysql');
var McCrypto = require('@doctormckay/crypto');
var FS = require('fs');
var Zlib = require('zlib');
var Config = require('./config.json');

const POLL_INTERVAL = 1000 * 60;

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

var g_BearerToken;
var g_BearerTokenExpiresTime = Infinity;
var g_DB;

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
			setTimeout(getData, POLL_INTERVAL);
			return;
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
		
		var cols = {
			"timestamp": Math.floor(Date.now() / 1000),
			"charging_state": charge.charging_state,
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
			setTimeout(getData, POLL_INTERVAL);
		});
	}
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
