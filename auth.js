const ReadLine = require('readline');
const TeslaJS = require('teslajs');
const McCrypto = require('@doctormckay/crypto');
const FS = require('fs');
var Config = require('./config.json');

if (!process.env.ENCRYPTION_KEY) {
	process.stderr.write("ENCRYPTION_KEY environment variable must be set\n");
	process.exit(1);
}

var iface = ReadLine.createInterface(process.stdin, process.stdout);
iface.question("MyTesla Email: ", (email) => {
	iface.question("MyTesla Password: ", (pass) => {
		iface.question("MyTesla Auth Code (blank for none): ", (otp) => {
			TeslaJS.login({
				username: email,
				password: pass,
				mfaPassCode: otp
			}, (err, results) => {
				if (err) {
					process.stderr.write(err.message + "\n");
					process.exit(2);
				} else if (!results.refreshToken || !results.authToken) {
					process.stderr.write("Malformed response from MyTesla login server. Was your password wrong?\n");
					process.exit(3);
				} else {
					Config.tesla.encryptedToken = McCrypto.encrypt(McCrypto.Cipher.AES256CTRWithHMAC, process.env.ENCRYPTION_KEY, results.refreshToken).toString('base64');
					FS.writeFileSync(__dirname + "/config.json", JSON.stringify(Config, undefined, "\t"));
					console.log("Authenticated successfully. Refresh token has been encrypted and saved to config.json");
					
					TeslaJS.vehicles({"authToken": results.authToken}, (err, vehicles) => {
						if (err) {
							process.stderr.write("Cannot retrieve list of vehicles: " + err.message + "\n");
							process.exit(4);
						} else {
							console.log("===== YOUR VEHICLES =====");
							vehicles.forEach((car) => {
								console.log("Vehicle ID " + car.id_s + " - VIN " + car.vin + " (" + (car.display_name || "unnamed") + ")");
							});
							
							process.exit(0);
						}
					});
				}
			});
		});
	});
});
