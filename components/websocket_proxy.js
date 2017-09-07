const log = require('./log.js');

module.exports = WebSocketProxy;

function WebSocketProxy(browserClient, teslaClient) {
	this.browserClient = browserClient;
	this.teslaClient = teslaClient;

	this.setupDisconnectHandlers();
	this.setupErrorHandlers();
	this.setupProxying();
}

WebSocketProxy.prototype.setupDisconnectHandlers = function() {
	this.browserClient.on('disconnected', (code, reason, initiatedByUs) => {
		log("Browser client disconnected: " + code + " (" + reason + ")");

		if (!initiatedByUs) {
			try {
				this.teslaClient.disconnect(code, reason);
			} catch (ex) {
				// ignore
			}
		}
	});

	this.teslaClient.on('disconnected', (code, reason, initiatedByUs) => {
		log("Tesla client disconnected: " + code + " (" + reason + ")");

		if (!initiatedByUs) {
			try {
				this.browserClient.disconnect(code, reason);
			} catch (ex) {
				// ignore
			}
		}
	});
};

WebSocketProxy.prototype.setupErrorHandlers = function() {
	this.browserClient.on('error', (err) => {
		log("Browser client errored: " + err.message);
		try {
			this.teslaClient.disconnect();
		} catch (ex) {
			// ignore
		}
	});

	this.teslaClient.on('error', (err) => {
		log("Tesla client errored: " + err.message);
		try {
			this.browserClient.disconnect();
		} catch (ex) {
			// ignore
		}
	});
};

WebSocketProxy.prototype.setupProxying = function() {
	this.browserClient.on('message', (type, data) => {
		this.teslaClient.send(data);
	});

	this.teslaClient.on('message', (type, data) => {
		this.browserClient.send(data.toString('utf8'));
	});
};
