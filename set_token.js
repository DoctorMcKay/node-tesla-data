// 6c78e56b55b5f7313633f64b4e46f2512595ae8f5ae3edc561908b7e88e60ce1
var McCrypto = require('@doctormckay/crypto');
var ReadLine = require('readline');
var FS = require('fs');
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
