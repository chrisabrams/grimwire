(function(exports) {
	// ConfigServer
	// ============
	// EXPORTED
	// interfaces over host and userdata config
	// - loads host's static configs, then merges userdata config over it
	// - provides UIs and APIs for reading static and read/writing userdata
	// - embeds worker-provided config interfaces in UI
	function ConfigServer(storageHost) {
		local.env.Server.call(this);

		this.storageHost = storageHost;
		this.storageHost.apps = storageHost.collection('apps');

		this.hostEnvConfig = {}; // :NOTE: as provided by the host
		this.hostAppConfigs = {}; // :NOTE: as provided by the host
		// ^ to get config with user settings mixed in, use getAppConfig()
		this.activeAppId = null;
		this.defaultAppId = null; // as inferred from the ordering of "applications" in .hosts.json

		this.broadcasts = {
			apps: local.http.broadcaster(),
			activeApp: local.http.broadcaster()
		};
	}
	ConfigServer.prototype = Object.create(local.env.Server.prototype);

	ConfigServer.prototype.handleHttpRequest = function(request, response) {
		// construct the name of the function to handle the request based on:
		// - path, with a /:collection/:item structure
		// - method, with methods mapping to Get, Set, AddTo, or Delete
		// eg
		// - POST /applications -> "httpAddToCollection" 
		// - DELETE /applications/mail -> "httpDeleteItem"

		var handler;
		if (/HEAD|GET/i.test(request.method))       handler = 'httpGet';
		else if (/PATCH|PUT/i.test(request.method)) handler = 'httpSet';
		else if (/POST/i.test(request.method))      handler = 'httpAddTo';
		else if (/DELETE/i.test(request.method))    handler = 'httpDelete';
		else return response.writeHead(405, 'bad method').end();

		path = request.path.split('/').filter(function(part) { return !!part; });
		if (!path[0])                 handler += 'Service';
		else if (path[0] && !path[1]) handler += 'Collection';
		else if (path[0] && path[1])  handler += 'Item';
		else return response.writeHead(404, 'not found').end();

		var handlerFn = this[handler];
		if (!handlerFn)
			return response.writeHead(405, 'bad method').end();
		handlerFn.call(this, request, response, path[0], path[1]);
	};

	// api
	// -

	ConfigServer.prototype.loadFromHost = function(url) {
		url = url || '/.host.json';
		var self = this;
		// load json at given url
		return local.http.navigator(url).getJson()
			.succeed(function(res) {
				self.hostEnvConfig = res.body;

				// may still be a string if the host didnt give an accurate content-type header
				if (typeof self.hostEnvConfig == 'string')
					self.hostEnvConfig = JSON.parse(self.hostEnvConfig);

				// load application configs
				var appConfigGETs = self.hostEnvConfig.applications.map(function(url) { return local.http.navigator(url).getJson(); });
				return local.promise.bundle(appConfigGETs);
			})
			.succeed(function(responses) {
				// save app configs
				responses.forEach(function(res) {
					if (!res.body) return;
					// may still be a string if the host didnt give an accurate content-type header
					if (typeof res.body == 'string')
						res.body = JSON.parse(res.body);
					if (!res.body.id) throw "Invalid application config: `id` is required";
					self.hostAppConfigs[res.body.id] = res.body;
				});
				// use the getter so we can mix in config from userdata
				return self.getAppConfigs();
			})
			.succeed(function(appCfgs) {
				// broadcast that the loaded apps have changed
				self.broadcasts.apps.emit('update', appCfgs);
				return appCfgs;
			});
	};

	ConfigServer.prototype.openApp = function(appId) {
		var self = this;
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
				if (!appCfg.startpage) throw "Invalid application config: `startpage` is required";
				if (!appCfg.workers) throw "Invalid application config: `workers` is required";
				if (!appCfg.workers.length) throw "Invalid application config: `workers` must be an array with at least 1 member";

				// load workers
				appCfg.workers.forEach(function(workerCfg) {
					// :TODO: mix in app common
					workerCfg = deepClone(workerCfg);
					if (!workerCfg.title) return console.error('Invalid worker config: `title` is required', workerCfg);
					if (!workerCfg.id) return console.error('Invalid worker config: `id` is required', workerCfg);
					if (!workerCfg.src) return console.error('Invalid worker config: `src` is required', workerCfg);
					workerCfg.scriptUrl = workerCfg.src;
					workerCfg.domain = workerCfg.id+'.'+appCfg.id+'.usr';
					local.env.addServer(workerCfg.domain, new local.env.WorkerServer(workerCfg));
				});

				// :TODO: broadcast update or open event on the app?
			});
	};

	ConfigServer.prototype.closeApp = function(appId) {
		// :TODO: get app config to do unloading
		for (var domain in local.env.servers) {
			var server = local.env.servers[domain];
			if (server instanceof local.env.WorkerServer)
				local.env.killServer(domain);
		}
		// :TODO: broadcast update or close event on the app?
	};

	ConfigServer.prototype.reloadApp = function(appId) {
		this.closeApp(appId);
		this.openApp(appId);
	};

	ConfigServer.prototype.setActiveApp = function(appId) {
		var self = this;
		if (!appId)
			appId = this.defaultAppId;
		this.getAppConfig(appId).then(
			function(appCfg) {
				self.activeAppId = appId;
				self.broadcasts.activeApp.emit('update', appCfg);
			},
			function() {
				console.log('Failed to set active app to "'+appId+'": not found');
			});
	};

	ConfigServer.prototype.getEnvConfig = function(appId) {
		var config = deepClone(this.hostEnvConfig);

		// mix in the .host config from the user storage
		return this.storageHost.apps.item('.host').getJson()
			.then(function(res) { return res.body; }, function() { return {}; })
			.succeed(function(userConfig) {
				config = patch(config, userConfig);
				if (!config) config = {};
				if (!config.applications) config.applications = [];
				return config;
			});
	};

	ConfigServer.prototype.getAppIds = function() {
		var self = this;
		// read the user's apps collection
		return this.storageHost.apps.getJson()
			.succeed(function(res) {
				if (!res.body || res.body.length === 0)
					throw "No user application settings, falling back to host's defaults";
				return Object.keys(res.body);
			})
			.fail(function() {
				return Object.keys(self.hostAppConfigs); // fall back to host-defined
			});
	};

	ConfigServer.prototype.getAppConfigs = function() {
		var self = this;
		var envAppIds;
		var hostAppConfigs = deepClone(this.hostAppConfigs);
		// get env app ids
		return this.getAppIds()
			.succeed(function(appIds) {
				envAppIds = appIds;
				self.defaultAppId = appIds[0]; // let the first in the list be the default
				// get user storage app configs
				var appConfigGETs = appIds.map(function(appId) { return self.storageHost.apps.item(appId).getJson(); });
				return local.promise.bundle(appConfigGETs);
			})
			.succeed(function(userCfgResponses) {
				var appConfigs = {
				};
				// mix user app config & host app config
				userCfgResponses.forEach(function (userCfgResponse, i) {
					var appId = envAppIds[i];
					appConfigs[appId] = patch(hostAppConfigs[appId], userCfgResponse.body || {});
				});
				return appConfigs;
			});
	};

	ConfigServer.prototype.getAppConfig = function(appId) {
		var self = this;
		var hostCfg;

		// given a config object?
		if (appId && typeof appId == 'object') {
			hostCfg = deepClone(appId);
			appId = hostCfg.id;
		} else
			hostCfg = (this.hostAppConfigs[appId]) ? deepClone(this.hostAppConfigs[appId]) : {};

		// get user cfg and mix with host cfg
		return this.storageHost.apps.item(appId).getJson()
			.then(function(res) { return res.body; }, function() { return {}; })
			.succeed(function(userCfg) {
				return patch(hostCfg, userCfg);
			});
	};

	// handlers
	// -

	ConfigServer.prototype.httpGetService = function(request, response) {
		var headers = {
			link: [
				{ rel:'self', href:'/' },
				{ rel:'collection', href:'/apps', title:'apps' },
				{ rel:'collection', href:'/{title}' }
			]
		};
		if (/html/.test(request.headers.accept))
			response.writeHead(501, 'not implemented').end(); // :TODO:
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpGetCollection = function(request, response, cid) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/'+cid },
				{ rel:'item', href:'/'+cid+'/{title}' }
			]
		};
		var forEvents = /event-stream/.test(request.headers.accept);
		var forJson = /json/.test(request.headers.accept);
		switch (cid) {
			case 'apps':
				if (forEvents) {
					headers['content-type'] = 'text/event-stream';
					response.writeHead(200, 'ok', headers);
					this.broadcasts.apps.addStream(response);
				} else if (forJson) {
					headers['content-type'] = 'application/json';
					this.getAppConfigs().then(
						function(cfgs) { response.writeHead(200, 'ok', headers).end(cfgs); },
						function() { response.writeHead(500).end(); }
					);
				} else if (/head/i.test(request.method))
					response.writeHead(200, 'ok', headers).end();
				else
					response.writeHead(406, 'not acceptable').end();
				break;
			default:
				response.writeHead(404, 'not found').end();
				break;
		}
	};

	ConfigServer.prototype.httpAddToCollection = function(request, response, cid) {
		var headers = {
			link:[] // :TODO:
		};
		switch (cid) {
			case 'apps':
				// :TODO:
				response.writeHead(501, 'not implemented').end();
				break;
			default:
				response.writeHead(404, 'not found').end();
				break;
		}
	};

	ConfigServer.prototype.httpGetItem = function(request, response, cid, iid) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/'+cid },
				{ rel:'self', href:'/'+cid+'/'+iid }
			]
		};
		var forEvents = /event-stream/.test(request.headers.accept);
		var forJson = /json/.test(request.headers.accept);
		switch (cid) {
			case 'apps':
				// "active app" special item
				if (iid == '.active') {
					if (forEvents) {
						headers['content-type'] = 'text/event-stream';
						response.writeHead(200, 'ok', headers);
						this.broadcasts.activeApp.addStream(response);
						return;
					}
					iid = this.activeAppId; // give the correct id and let handle below
				}

				// fetch item config
				if (forJson) {
					headers['content-type'] = 'application/json';
					this.getAppConfig(iid).then(
						function(cfg) { response.writeHead(200, 'ok', headers).end(cfg); },
						function()    { response.writeHead(404, 'not found').end(); }
					);
				} else if (/head/i.test(request.method))
					response.writeHead(200, 'ok', headers).end();
				else
					response.writeHead(406, 'not acceptable').end();
				break;
			default:
				response.writeHead(404, 'not found').end();
				break;
		}
	};

	ConfigServer.prototype.httpSetItem = function(request, response, cid, iid) {
		var headers = {
			link:[] // :TODO:
		};
		switch (cid) {
			case 'apps':
				if (iid == '.active')
					return response.writeHead(405, 'bad method').end();
				// :TODO:
				response.writeHead(501, 'not implemented').end();
				break;
			default:
				response.writeHead(404, 'not found').end();
				break;
		}
	};

	ConfigServer.prototype.httpDeleteItem = function(request, response, cid, iid) {
		var headers = {
			link:[] // :TODO:
		};
		switch (cid) {
			case 'apps':
				if (iid == '.active')
					return response.writeHead(405, 'bad method').end();
				// :TODO:
				response.writeHead(501, 'not implemented').end();
				break;
			default:
				response.writeHead(404, 'not found').end();
				break;
		}
	};

	// helpers
	// -

	// http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
	function toTitleCase(str) {
		return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
	}

	// brings updates into org value
	// :NOTE: mutates its first parameter out of laziness
	function patch(org, update) {
		if (update === null) { return null; }
		if (org === null) { org = {}; }
		for (var k in update) {
			if (typeof org[k] == 'object' && typeof update[k] == 'object')
				org[k] = patch(org[k], update[k]);
			else
				org[k] = update[k];
		}
		return org;
	}

	function deepClone(obj) {
		// :TODO: not this
		return JSON.parse(JSON.stringify(obj));
	}

	exports.ConfigServer = ConfigServer;
})(window);