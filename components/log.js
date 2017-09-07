module.exports = log;

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
