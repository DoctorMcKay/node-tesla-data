const McCrypto = require('@doctormckay/crypto');
const ReadLine = require('readline');
const FS = require('fs');
var Config = require('./config.json');

if (!process.env.ENCRYPTION_KEY) {
	console.log("Encryption key needed");
	process.exit(1);
}

ReadLine.createInterface({"input": process.stdin, "output": process.stdout}).question("Refresh token: ", (token) => {
	Config.tesla.encryptedToken = McCrypto.encrypt(McCrypto.Cipher.AES256CTRWithHMAC, process.env.ENCRYPTION_KEY, token).toString('base64');
	FS.writeFileSync(__dirname + '/config.json', JSON.stringify(Config, undefined, "\t"));
	console.log("Done");
	process.exit(0);
});
