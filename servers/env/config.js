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

		// add special environment apps
		this.hostAppConfigs['_workers'] = {
			id: '_workers',
			title: 'Active Workers',
			startpage: 'httpl://config.env/workers'
		};

		this.broadcasts = {
			apps: local.http.broadcaster(),
			activeApp: local.http.broadcaster()
		};
	}
	ConfigServer.prototype = Object.create(local.env.Server.prototype);

	ConfigServer.prototype.handleHttpRequest = function(request, response) {
		routeMap(request, response,
			{ _prefix:'http', head:'get', patch:'set', put:'set', post:'addTo' },
			{
				'/': [this, 'Service'],
				'/workers': [this, 'Workers'],
				'/workers/:domain': [this, 'Worker'],
				'/:collection': [this, 'Collection'],
				'/:collection/:item': [this, 'Item']
			}
		);
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
					var errors = validateWorkerConfig(workerCfg);
					if (errors) return console.error('Invalid worker config:', errors, workerCfg);
					prepWorkerConfig(workerCfg, appCfg);
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
				self.defaultAppId = appIds[1]; // let the first in the list (after "_workers") be the default
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

	ConfigServer.prototype.httpGetWorkers = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/workers' },
				{ rel:'item', href:'/workers/{title}' }
			]
		};
		if (/html/.test(request.headers.accept)) {
			var workerCfgs = Object.keys(local.env.servers)
				.filter(function(domain) { return (local.env.servers[domain] instanceof local.env.WorkerServer); })
				.map(function(domain) { return local.env.servers[domain].config; });

			var html = '<h3>Active Workers</h3><hr/>';
			html += workerCfgs.map(workerHtmlSidetabs).join('');

			headers['content-type'] = 'text/html';
			response.writeHead(200, 'ok', {'content-type':'text/html'}).end(html);
		} else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpSetWorker = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers' },
				{ rel:'self', href:'/workers/'+domain }
			]
		};

		var server = local.env.servers[domain];
		if (!server) // :TODO: should we create the worker in this case?
			return response.writeHead(404, 'not found').end();

		if (/json|form/.test(request.headers['content-type'])) {
			var workerCfg;
			if (/PATCH/i.test(request.method))
				workerCfg = patch(deepClone(server.config), request.body);
			else
				workerCfg = request.body;

			var errors = validateWorkerConfig(workerCfg);
			if (errors)
				return response.writeHead(422, 'semantic errors').end(errors);

			this.getAppConfig(workerCfg.appId).then(
				function(appCfg) {
					prepWorkerConfig(workerCfg, appCfg);

					// :NOTE: replace in-place so that ordering is maintained in the Workers page
					// local.env.killServer(workerCfg.domain);
					local.http.unregisterLocal(workerCfg.domain);
					server.terminate();
					// local.env.addServer(workerCfg.domain, new local.env.WorkerServer(workerCfg));
					server = local.env.servers[workerCfg.domain] = new local.env.WorkerServer(workerCfg);
					server.loadUserScript();
					local.http.registerLocal(workerCfg.domain, server.handleHttpRequest, server);

					response.writeHead(204, 'no content').end();
				},
				function() {
					response.writeHead(422, 'semantic errors').end({ appId:'invalid app id' });
				}
			);
		} else
			response.writeHead(415, 'bad content type').end();
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

	function validateWorkerConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.title) errors.title = 'required';
		if (!cfg.id) errors.id = 'required';
		if (!cfg.src) errors.src = 'required';
		return (Object.keys(errors).length > 0) ? errors : null;
	}

	function prepWorkerConfig(workerCfg, appCfg) {
		workerCfg.appId = appCfg.id;
		workerCfg.scriptUrl = workerCfg.src;
		workerCfg.domain = workerCfg.id+'.'+appCfg.id+'.usr';
	}

	// :DEBUG: choose one of these
	function workerHtmlSidetabs(cfg) {
		return '<h4>'+cfg.title+' <small>'+cfg.domain+'</small></h4>'+
			'<div class="tabbable tabs-left">'+
				'<ul class="nav nav-tabs">'+
					'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure"><i class="icon-cog"></i> Configure</a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Edit Source"><i class="icon-edit"></i> Edit</a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Run"><i class="icon-hand-right"></i> Execute</a></li>'+
				'</ul>'+
				'<div id="cfg-'+cfg.domain+'" class="tab-content" data-grim-layout="replace httpl://'+cfg.domain+'/.grim/config"></div>'+
			'</div><hr/>';
	}
	function workerHtmlToptabs(cfg) {
		return '<h4>'+cfg.title+' <small>'+cfg.domain+'</small></h4>'+
			'<ul class="nav nav-tabs">'+
				'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure"><i class="icon-cog"></i></a></li>'+
				'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Edit Source"><i class="icon-edit"></i></a></li>'+
				'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Run"><i class="icon-hand-right"></i></a></li>'+
			'</ul>'+
			'<div id="cfg-'+cfg.domain+'" data-grim-layout="replace httpl://'+cfg.domain+'/.grim/config"></div>'+
			'<hr/>';
	}

	exports.ConfigServer = ConfigServer;
})(window);