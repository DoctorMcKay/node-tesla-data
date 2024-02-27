const McCrypto = require('@doctormckay/crypto');
const ReadLine = require('readline');
const FS = require('fs');
const TeslaJS = require('teslajs');
var Config = require('./config.json');

if (!process.env.ENCRYPTION_KEY) {
	console.log("Encryption key needed");
	process.exit(1);
}

ReadLine.createInterface({"input": process.stdin, "output": process.stdout}).question("Refresh token: ", async (token) => {
	let refreshResult = await TeslaJS.refreshTokenAsync(token);
	if (!refreshResult.authToken) {
		console.error('Error: Unavailable to retrieve auth token');
		process.exit(2);
	}

	// It's a valid token. We can save it to config.json now.
	Config.tesla.encryptedToken = McCrypto.encrypt(McCrypto.Cipher.AES256CTRWithHMAC, process.env.ENCRYPTION_KEY, token).toString('base64');
	FS.writeFileSync(__dirname + '/config.json', JSON.stringify(Config, undefined, "\t"));

	console.log('Token encrypted and saved successfully');
	process.exit(0);
});
