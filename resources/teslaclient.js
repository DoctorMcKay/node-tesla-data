/**
 This is a client *for the browser*. It is to connect to your server which then proxies the connection directly to Tesla.
 */

/**
 * Create a new TeslaStreamingClient.
 * @param {string} url - In format wss://yourhost.com/something/
 * @param {string} vehicleId - The ID (not VIN) of the vehicle you want to connect to
 * @param {string} password - Your WebSocket password
 * @constructor
 */
function TeslaStreamingClient(url, vehicleId, password) {
	if (!url.match(/\/$/)) {
		url += "/";
	}

	this._ws = new WebSocket(url + vehicleId + "?password=" + encodeURIComponent(password));
	this._ws.addEventListener('open', this._onOpen.bind(this));
	this._ws.addEventListener('close', this._onClose.bind(this));
	this._ws.addEventListener('message', this._onMessage.bind(this));
	this._ws.addEventListener('error', this._onError.bind(this));
}

TeslaStreamingClient.prototype.disconnect = function() {
	this._ws.close(1000);
};

TeslaStreamingClient.prototype.onopen = noop;
TeslaStreamingClient.prototype.onclose = noop;
TeslaStreamingClient.prototype.onerror = noop;
TeslaStreamingClient.prototype.onhomelinkstatus = noop;
TeslaStreamingClient.prototype.onhomelinkresult = noop;
TeslaStreamingClient.prototype.ongps = noop;
TeslaStreamingClient.prototype.onautoparkstatus = noop;

TeslaStreamingClient.prototype._onOpen = function(e) {
	console.log("Now connected to Tesla Streaming API");
	this.onopen();
};

TeslaStreamingClient.prototype._onClose = function(e) {
	console.log("Now disconnected from Tesla Streaming API: " + e.code + " (" + e.reason + ")");
	this.onclose(e.code, e.reason);
};

TeslaStreamingClient.prototype._onMessage = function(e) {
	if (typeof e.data !== 'string') {
		console.log("Got unrecognized data type from Tesla Streaming API");
		return;
	}

	if (this.spew) {
		console.log(e.data);
	}

	var msg;
	try {
		msg = JSON.parse(e.data);
	} catch (ex) {
		console.log("Got malformed JSON from Tesla Streaming API");
		return;
	}

	switch (msg.msg_type) {
		case 'control:hello':
			if (msg.autopark && msg.autopark.heartbeat_frequency) {
				this._autoparkHeartbeatFrequency = msg.autopark.heartbeat_frequency;
			}

			if (msg.connection_timeout) {
				this._connectionHeartbeatInterval = setInterval(() => {
					this.send("control:ping", {"timestamp": Date.now()});
				}, msg.connection_timeout / 2);
			}

			break;

		case 'control:pong':
			break;

		case 'homelink:status':
			this.onhomelinkstatus(msg.homelink_nearby);
			break;

		case 'homelink:cmd_result':
			this.onhomelinkresult(msg.result, msg.reason);
			break;

		case 'internal:gps':
			this.ongps(msg.latitude, msg.longitude, msg.heading);
			break;

		case 'autopark:status':
			this.onautoparkstatus(msg.autopark_state);
			break;

		default:
			console.log("Got unknown Tesla Streaming API message type " + msg.msg_type);
	}
};

TeslaStreamingClient.prototype.triggerHomelink = function(latitude, longitude) {
	this.send("homelink:cmd_trigger", {"latitude": latitude, "longitude": longitude});
};

TeslaStreamingClient.prototype.send = function(command, data) {
	data.msg_type = command;
	this._ws.send(JSON.stringify(data));
};

TeslaStreamingClient.prototype._onError = function(e) {
	console.log("Error with Tesla Streaming API");
	this.onerror();
};

TeslaStreamingClient.prototype._cleanup = function() {
	if (this._connectionHeartbeatInterval) {
		clearInterval(this._connectionHeartbeatInterval);
	}

	if (this._autoparkHeartbeatInterval) {
		clearInterval(this._autoparkHeartbeatInterval);
	}
};

function noop() {}
