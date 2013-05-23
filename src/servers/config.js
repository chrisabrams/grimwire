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
		this.storageHost.workerCfgs = storageHost.collection('workercfgs');

		this.hostEnvConfig = {}; // :NOTE: as provided by the host
		this.hostAppConfigs = {}; // :NOTE: as provided by the host
		// ^ to get config with user settings mixed in, use getAppConfig()
		this.activeAppId = null;
		this.openAppIds = ['_apps']; // list of apps which are open
		this.defaultAppId = null; // set to the first enabled app by openEnabledApps

		// add special environment apps
		this.hostAppConfigs['_apps'] = {
			id: '_apps',
			title: 'Applications',
			startpage: 'httpl://config.env/apps'
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
				'/workers/:domain/src': [this, 'WorkerSource'],
				'/apps': [this, 'Apps'],
				'/apps/:id': [this, 'App']
			}
		);
	};

	// api
	// -

	ConfigServer.prototype.loadFromHost = function(url) {
		url = url || '.host.json';
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
					if (!res.body.id) console.error("Invalid application config: `id` is required", res.body);
					self.hostAppConfigs[res.body.id] = res.body;
				});
				// use the getter so we can mix in config from userdata
				return self.getAppConfigs();
			});
	};

	ConfigServer.prototype.openApp = function(appId) {
		var self = this;
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
				if (appCfg.id && appCfg.id.charAt(0) !== '_') { // dont validate environment apps
					var errors = validateAppConfig(appCfg);
					if (errors) throw "Invalid application config for '"+appId+"': "+JSON.stringify(errors);
				}

				if (self.openAppIds.indexOf(appId) !== -1)
					return appCfg; // dont open twice
				self.openAppIds.push(appId);

				// load workers
				if (Array.isArray(appCfg.workers)) {
					var workerLoads = [];
					appCfg.workers.forEach(function(workerCfg) {
						workerCfg = deepClone(workerCfg);
						var errors = validateWorkerConfig(workerCfg);
						if (errors) return console.error('Invalid worker config:', errors, workerCfg);
						prepWorkerConfig(workerCfg, appCfg);
						workerLoads.push(self.getWorkerUserConfig(workerCfg.domain)
							.succeed(function(userCfg) {
								workerCfg.usr = userCfg;
								local.env.addServer(workerCfg.domain, new local.env.WorkerServer(workerCfg));
							}));
					});
					return local.promise.bundle(workerLoads).then(function() { return appCfg; });
				}

				// :TODO: broadcast update or open event on the app?
				return appCfg;
			});
	};

	ConfigServer.prototype.closeApp = function(appId) {
		var self = this;
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
				var index = self.openAppIds.indexOf(appId);
				if (index === -1)
					return appCfg; // dont close twice
				self.openAppIds.splice(index, 1);

				// close all workers
				if (Array.isArray(appCfg.workers)) {
					appCfg.workers.forEach(function(workerCfg) {
						var server = local.env.servers[makeWorkerDomain(workerCfg, appId)];
						if (server instanceof local.env.WorkerServer)
							local.env.killServer(server.config.domain);
					});
				}
				// :TODO: broadcast update or close event on the app?
				return appCfg;
			});
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
				console.error('Failed to set active app to "'+appId+'": not found');
			});
	};

	ConfigServer.prototype.setAppEnabled = function(appId, enabled) {
		var self = this;
		return this.getEnvConfig()
			.succeed(function(envCfg) {
				if (!envCfg.disabled || !Array.isArray(envCfg.disabled))
					envCfg.disabled = [];

				var index = envCfg.disabled.indexOf(appId);
				if (enabled) {
					if (index !== -1)
						envCfg.disabled.splice(index, 1);
				} else {
					if (index === -1)
						envCfg.disabled.push(appId);
				}

				return self.setEnvConfig(envCfg);
			});
	};
	ConfigServer.prototype.enableApp = function(appId) { return this.setAppEnabled(appId, true); };
	ConfigServer.prototype.disableApp = function(appId) { return this.setAppEnabled(appId, false); };

	ConfigServer.prototype.openEnabledApps = function() {
		var self = this;
		var envCfg;
		return this.getEnvConfig()
			.succeed(function(cfg) {
				envCfg = cfg;
				if (!envCfg.disabled || !Array.isArray(envCfg.disabled))
					envCfg.disabled = [];

				return self.getAppIds();
			})
			.succeed(function(appIds) {
				var opens = [];
				appIds.forEach(function(id) {
					if (id.charAt(0) != '_' && id != '.host' && envCfg.disabled.indexOf(id) === -1) {
						if (!self.defaultAppId) self.defaultAppId = id;
						opens.push(self.openApp(id));
					}
				});
				return local.promise.bundle(opens);
			});
	};

	ConfigServer.prototype.getEnvConfig = function() {
		var self = this;
		return this.storageHost.apps.item('.host').getJson()
			.then(
				function(res) {	return res.body; },
				function() { return deepClone(self.hostEnvConfig); }
			)
			.succeed(function(cfg) {
				if (!cfg.disabled || !Array.isArray(cfg.disabled))
					cfg.disabled = [];
				return cfg;
			});
	};

	ConfigServer.prototype.setEnvConfig = function(cfg) {
		return this.storageHost.apps.item('.host').put(cfg, 'application/json');
	};

	ConfigServer.prototype.getAppIds = function() {
		var self = this;
		var appIds = Object.keys(self.hostAppConfigs);
		// read the user's apps collection
		return this.storageHost.apps.getJson()
			.succeed(function(res) {
				var userApps = res.body;
				if (userApps && userApps.length > 0)
					return appIds.concat(userApps.map(function(app) { return app.id; }));
				return appIds;
			})
			.fail(function() {
				return appIds;
			});
	};

	ConfigServer.prototype.getOpenAppIds = function() {
		var self = this;
		var envCfg;
		return this.getEnvConfig()
			.succeed(function(cfg) {
				envCfg = cfg;
				return self.getAppIds();
			})
			.succeed(function(appIds) {
				return appIds.filter(function(id) { return (envCfg.disabled.indexOf(id) === -1); });
			});
	};

	ConfigServer.prototype.getAppConfigs = function() {
		var self = this;
		var appConfigs = deepClone(this.hostAppConfigs);
		for (var id in appConfigs)
			appConfigs[id]._readonly = true;
		// read the user's apps collection
		return this.storageHost.apps.getJson()
			.then(function(res) { return res.body || []; }, function() { return []; })
			.succeed(function(userAppConfigs) {
				// mix user app config & host app config
				userAppConfigs.forEach(function (app, i) {
					if (app.id == '.host')
						return;
					appConfigs[app.id] = app;
				});
				return appConfigs;
			})
			.succeed(function(appConfigs) {
				// add _active flag
				for (var id in appConfigs)
					appConfigs[id]._active = (self.openAppIds.indexOf(id) !== -1);
				return appConfigs;
			});
	};

	ConfigServer.prototype.getOpenAppConfigs = function() {
		var self = this;
		var appCfgs;
		return this.getAppConfigs()
			.succeed(function(cfgs) {
				appCfgs = cfgs;
				return self.getEnvConfig();
			})
			.succeed(function(envCfg) {
				envCfg.disabled.forEach(function(id) {
					if (id in appCfgs)
						delete appCfgs[id];
				});
				return appCfgs;
			});
	};

	ConfigServer.prototype.getAppConfig = function(appId) {
		var promise;

		// given a config object?
		if (appId && typeof appId == 'object')
			promise = local.promise(deepClone(appId));
		// host app?
		else if (appId in this.hostAppConfigs)
			promise = local.promise(patch(deepClone(this.hostAppConfigs[appId]), { _readonly:true }));
		// user app?
		else {
			promise = this.storageHost.apps.item(appId).getJson()
				.succeed(function(res) { return res.body; });
		}

		// add _active flag
		var self = this;
		return promise
			.succeed(function(cfg) {
				cfg._active = (self.openAppIds.indexOf(cfg.id) !== -1);
				return cfg;
			});
	};

	ConfigServer.prototype.loadUserApp = function(cfg) {
		var self = this;
		return this.getAppConfig(cfg.id)
			.succeed(function(collidingAppCfg) {
				// app id in use, increment the trailing # and try again
				cfg.id = (''+cfg.id).replace(/(\d+)?$/, function(v) { return (+v || 1)+1; });
				if (cfg.startpage)
					cfg.startpage = cfg.startpage.replace(/\.([^\/]*)\.usr/, '.'+cfg.id+'.usr');
				return self.loadUserApp(cfg);
			})
			.fail(function() {
				// app id free, save
				// strip private variables
				for (var k in cfg) {
					if (k.charAt(0) == '_')
						delete cfg[k];
				}
				return self.storageHost.apps.item(cfg.id).put(cfg, 'application/json')
					.succeed(function() {
						self.broadcastOpenApps();
					});
			});
	};

	ConfigServer.prototype.unloadUserApp = function(appId) {
		if (appId && typeof appId == 'object')
			appId = appId.id;
		var self = this;
		return this.storageHost.apps.item(appId).delete()
			.succeed(function() {
				self.broadcastOpenApps();
				return self.getEnvConfig();
			})
			.succeed(function(envCfg) {
				// remove from disableds - the id might get reused later
				var index = envCfg.disabled.indexOf(appId);
				if (appId !== -1)
					envCfg.disabled.splice(index, 1);
				return self.setEnvConfig(envCfg);
			});
	};

	ConfigServer.prototype.getWorkerUserConfig = function(domain) {
		return this.storageHost.workerCfgs.item(domain).getJson()
				.then(function(res) { return res.body; }, function() { return {}; });
	};

	ConfigServer.prototype.broadcastOpenApps = function() {
		var self = this;
		self.getOpenAppConfigs().then(function(appCfgs) {
			self.broadcasts.apps.emit('update', appCfgs);
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
			response.writeHead(501, 'not implemented').end();
		} else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpGetWorker = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers' },
				{ rel:'self', href:'/workers/'+domain }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			response.writeHead(200, 'ok', headers).end(views.workerCfg(server.config));
		} else
			response.writeHead(406, 'bad accept type').end();
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
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/json|form/.test(request.headers['content-type'])) {
			var self = this;
			this.getWorkerUserConfig(domain)
				.succeed(function(workerUserCfg) {
					var workerCfg = server.config;
					if (/PATCH/i.test(request.method))
						workerUserCfg = patch(workerUserCfg, request.body);
					else
						workerUserCfg = request.body;
					workerCfg.usr = workerUserCfg;

					self.storageHost.workerCfgs.item(domain).put(workerUserCfg);
					if (!request.query.noreload)
						reloadWorker(server, workerCfg);

					response.writeHead(204, 'no content').end();
				});
		} else
			response.writeHead(415, 'bad content type').end();
	};

	ConfigServer.prototype.httpGetWorkerSource = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers/'+domain },
				{ rel:'self', href:'/workers/'+domain+'/src' }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			this.getAppConfig(server.config.appId).then(function(appCfg) {
				server.getSource().then(function(src) {
					response.writeHead(200, 'ok', headers).end(views.workerSource(server.config, src, appCfg));
				});
			});
		} else
			response.writeHead(406, 'bad accept type').end();
	};

	ConfigServer.prototype.httpSetWorkerSource = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers/'+domain },
				{ rel:'self', href:'/workers/'+domain+'/src' }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/json|form/.test(request.headers['content-type'])) {
			var self = this;
			var appId = server.config.appId;
			this.getAppConfig(appId)
				.succeed(function(appCfg) {
					// validate and prepare
					var src = request.body.src;
					if (!src)
						return response.writeHead(422, 'request errors').end();
					if (/^http/.test(src) === false) {
						// actual source code - convert to a data uri
						src = 'data:application/javascript,'+src;
					}

					// find the worker object in the app's config
					var workerCfg;
					for (var i=0; i < appCfg.workers.length; i++) {
						if (appCfg.workers[i].id == server.config.id) {
							workerCfg = appCfg.workers[i];
							break;
						}
					}
					if (!workerCfg)
						return response.writeHead(404, 'not found').end();

					// update the app config
					workerCfg.src = src;
					self.storageHost.apps.item(appId).put(appCfg, 'application/json');

					// update the worker
					server.config.src = src;
					reloadWorker(server, server.config);

					response.writeHead(200, 'ok').end();
				});
		} else
			response.writeHead(415, 'bad content type').end();
	};

	ConfigServer.prototype.httpGetApps = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/apps' },
				{ rel:'item', href:'/apps/{title}' },
				{ rel:'http://grimwire.com/rel/index', href:'/apps?schema=grimsearch' }
			]
		};
		if (/event-stream/.test(request.headers.accept)) {
			headers['content-type'] = 'text/event-stream';
			response.writeHead(200, 'ok', headers);
			this.broadcasts.apps.addStream(response);
		}
		else if (/json/.test(request.headers.accept)) {
			headers['content-type'] = 'application/json';
			this.getAppConfigs().then(
				function(cfgs) {
					if (request.query.schema == 'grimsearch') {
						var docs = [];
						for (var appId in cfgs) {
							if (appId.charAt(0) == '_')
								continue;
							docs.push({
								icon: 'hand-right',
								category: 'Applications',
								title: cfgs[appId].title,
								desc: (cfgs[appId]._readonly) ? 'Host Application' : 'User Application',
								href: '#'+appId
							});
						}
						response.writeHead(200, 'ok', headers).end(docs);
					} else
						response.writeHead(200, 'ok', headers).end(cfgs);
				},
				function() { response.writeHead(500).end(); }
			);
		}
		else if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			var view = request.query.view;
			this.getAppConfigs()
				.succeed(function(appCfgs) {
					var html;
					if (view == 'summary') html = views.appsSummary(appCfgs, request.query.inner);
					else if (view == 'sidenav') html = views.appsSidenav(appCfgs, request.query.selection);
					else html = views.appsMain(appCfgs);

					headers['content-type'] = 'text/html';
					response.writeHead(200, 'ok', headers).end(html);
				})
				.fail(function() { response.writeHead(500, 'internal error').end(); });
		}
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpAddToApps = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/apps' },
				{ rel:'item', href:'/apps/{title}' }
			]
		};

		var sendErrResponse = function(errs) {
			if (/html/.test(request.headers.accept))
				return response.writeHead(422, 'request errors', {'content-type':'text/html'})
								.end(views.appLoadNew(errs));
			return response.writeHead(422, 'request errors').end(errs);
		};

		if (!request.body || !request.body.config)
			return sendErrResponse({ config:'Required.' });

		var cfg = request.body.config.content;
		if (typeof cfg == 'string') {
			if (cfg.indexOf('data:') === 0) {
				if (cfg.indexOf('data:application/json') !== 0)
					return sendErrResponse({ config:'Invalid file-type - must be JSON.' });

				cfg = atob(cfg.split(',')[1]);
				if (!cfg) // :TODO: not sure this is the right error message
					return sendErrResponse({ config:'Invalid file-type - must be JSON.' });

				try { cfg = JSON.parse(cfg); }
				catch (e) {
					return sendErrResponse({ config:'Failed parsing JSON - '+e.message });
				}
			}
		}

		var errors = validateAppConfig(cfg);
		if (errors)
			return sendErrResponse({ config:errors });

		var self = this;
		this.loadUserApp(cfg)
			.then(function() {
				self.openApp(cfg.id);
				if (/html/.test(request.headers.accept)) {
					headers['content-type'] = 'text/html';
					self.getAppConfigs().succeed(function(appCfgs) {
						response.writeHead(201, 'created', headers);
						response.end(views.appsSummary(appCfgs));
					});
				} else
					response.writeHead(201, 'created', headers).end();
			}, function() {
				response.writeHead(500, 'internal error').end();
			});
	};

	ConfigServer.prototype.httpGetApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active') {
			if (/event-stream/.test(request.headers.accept)) {
				headers['content-type'] = 'text/event-stream';
				response.writeHead(200, 'ok', headers);
				this.broadcasts.activeApp.addStream(response);
				return;
			}
			appId = this.activeAppId; // give the correct id and let handle below
		}

		// "new app" special item
		if (appId == '.new') {
			if (/html/.test(request.headers.accept)) {
				headers['content-type'] = 'text/html';
				return response.writeHead(200, 'ok', headers).end(views.appLoadNew());
			} else
				return response.writeHead(406, 'not acceptable').end();
		}

		// standard app item
		if (/json/.test(request.headers.accept)) {
			headers['content-type'] = 'application/json';
			this.getAppConfig(appId).then(
				function(cfg) { response.writeHead(200, 'ok', headers).end(cfg); },
				function()    { response.writeHead(404, 'not found').end(); }
			);
		}
		else if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			this.getAppConfig(appId).then(
				function(cfg) {
					response.writeHead(200, 'ok', headers).end(views.appCfg(cfg, cfg, null, null));
				},
				function() {
					response.writeHead(404, 'not found', headers).end('<h2 class="muted">App Not Found</h2>');
				}
			);
		}
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpDuplicateApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		var self = this;
		this.getAppConfig(appId).then(
			function(cfg) {
				self.loadUserApp(cfg)
					.then(function() {
						self.openApp(cfg.id);
						if (/html/.test(request.headers.accept))
							response.writeHead(201, 'created', {'content-type':'text/html'}).end(views.appCfg(cfg, cfg, null, null));
						else
							response.writeHead(201, 'created').end();
					}, function() {
						response.writeHead(500, 'internal error').end();
					});
			},
			function() {
				response.writeHead(404, 'not found').end();
			});
	};

	ConfigServer.prototype.httpDeleteApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		var self = this;
		this.getAppConfig(appId).then(
			function(cfg) {
				if (cfg._readonly)
					return response.writeHead(403, 'forbidden').end();
				self.closeApp(appId);
				self.unloadUserApp(appId);

				if (/html/.test(request.headers.accept)) {
					self.getAppConfigs().succeed(function(appCfgs) {
						headers['content-type'] = 'text/html';
						response.writeHead(200, 'ok', headers).end(views.appsSummary(appCfgs));
					});
				} else
					response.writeHead(200, 'ok', headers).end();
			},
			function() {
				response.writeHead(404, 'not found').end();
			});
	};

	function httpEnableDisableApp(enabled) {
		return function (request, response, appId) {
			var headers = {
				link: [
					{ rel:'via service', href:'/' },
					{ rel:'up', href:'/apps' },
					{ rel:'self', href:'/apps/'+appId }
				]
			};

			// "active app" special item
			if (appId == '.active')
				appId = this.activeAppId;

			var self = this;
			this.getAppConfig(appId).then(
				function(cfg) {
					self.setAppEnabled(appId, enabled);
					if (enabled) self.openApp(appId);
					else self.closeApp(appId);
					self.broadcastOpenApps();

					cfg._active = enabled;
					if (/html/.test(request.headers.accept))
						response.writeHead(200, 'ok', {'content-type':'text/html'}).end(views.appCfg(cfg, cfg, null, null));
					else
						response.writeHead(200, 'ok').end();
				},
				function() {
					response.writeHead(404, 'not found').end();
				});
		};
	}
	ConfigServer.prototype.httpEnableApp = httpEnableDisableApp(true);
	ConfigServer.prototype.httpDisableApp = httpEnableDisableApp(false);

	ConfigServer.prototype.httpDownloadApp = function(request, response, appId) {
		response.writeHead(501, 'not implemented').end();
	};

	ConfigServer.prototype.httpAddToApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		if (/form/.test(request.headers['content-type'])) {
			var self = this;
			this.getAppConfig(appId).then(function(cfg) {
				// allow reconfigure of user apps only
				if (cfg._readonly)
					return response.writeHead(403, 'forbidden').end();

				var newCfg = request.body;

				var parseErrors = {};
				try {
					if (!newCfg.common) newCfg.common = '{}';
					newCfg.common = JSON.parse(newCfg.common);
				}
				catch (e) { parseErrors.common = 'Unable to parse JSON -'+e; }
				try { newCfg.workers = JSON.parse(newCfg.workers); }
				catch (e) { parseErrors.workers = 'Unable to parse JSON -'+e; }
				if (Object.keys(parseErrors).length === 0) parseErrors = null;
				var errors = patch(validateAppConfig(newCfg), parseErrors);

				if (errors)
					return response.writeHead(422, 'request errors', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, newCfg, errors));

				self.storageHost.apps.item(appId).put(newCfg, 'application/json').then(
					function() {
						self.reloadApp(appId);
						self.broadcastOpenApps();

						response.writeHead(200, 'ok', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, newCfg, null, '<i class="icon-ok"></i> <strong>Updated!</strong>'));
					},
					function() {
						response.writeHead(502, 'bad gateway', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, request.body.config, { _body:'Failed to save update' }));
					}
				);
			});
		}
		else
			response.writeHead(415, 'bad content-type').end();
	};

	function validateAppConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.id) errors.id = 'required';
		if (!cfg.startpage) errors.startpage = 'required';
		if (typeof cfg.common != 'object' || Array.isArray(cfg.common)) errors.common = 'must be an object';
		if (!cfg.workers) errors.workers = 'required';
		if (!Array.isArray(cfg.workers) || !cfg.workers.length) errors.workers = 'must be an array with at least 1 member';
		return (Object.keys(errors).length > 0) ? errors : null;
	}

	function validateWorkerConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.title) errors.title = 'required';
		if (!cfg.id) errors.id = 'required';
		if (!cfg.src) errors.src = 'required';
		return (Object.keys(errors).length > 0) ? errors : null;
	}

	function prepWorkerConfig(workerCfg, appCfg) {
		if (appCfg.common && typeof appCfg.common == 'object')
			patch(workerCfg, appCfg.common);
		workerCfg.appId = appCfg.id;
		workerCfg.appTitle = appCfg.title;
		workerCfg.appIcon = appCfg.icon;
		workerCfg.domain = makeWorkerDomain(workerCfg, appCfg);
	}

	function makeWorkerDomain(workerId, appId) {
		if (appId && typeof appId == 'object')
			appId = appId.id;
		else if (!appId && workerId && typeof workerId == 'object')
			appId = workerId.appId;
		if (workerId && typeof workerId == 'object')
			workerId = workerId.id;
		return workerId+'.'+appId+'.usr';
	}

	function reloadWorker(server, cfg) {
		// local.env.killServer(domain);
		local.http.unregisterLocal(server.config.domain);
		server.terminate();
		// local.env.addServer(domain, new local.env.WorkerServer(server.config));
		server = local.env.servers[cfg.domain] = new local.env.WorkerServer(cfg);
		server.loadUserScript();
		local.http.registerLocal(cfg.domain, server.handleHttpRequest, server);
		return server;
	}

	var views = {
		appsMain: function(appCfgs, selection) {
			var html = '<div class="row-fluid">'+
					'<div class="well well-small span2" style="padding:9px 0"><form style="margin:0" data-subscribe="httpl://config.env/apps?view=sidenav">'+views.appsSidenav(appCfgs, selection)+'</form></div>'+
					'<div id="cfgappsmain" class="span10" data-client-region="httpl://config.env/apps?view=summary"></div>'+
				'</div>';
			return html;
		},
		appsSidenav: function(appCfgs, selection) {
			selection = selection || '';
			var appIds = Object.keys(appCfgs).join(',');
			var html = '<input type="hidden" name="selection" data-value-valueof=".active" value="'+selection+'">'+
				'<ul class="nav nav-list">';
			html += '<li class="'+((!selection||selection=='undefined') ? 'active' : '')+'"><a href="httpl://config.env/apps?view=summary" target="cfgappsmain" data-toggle="nav"><strong>Applications</strong></a></li>';
			for (var appId in appCfgs) {
				var appCfg = appCfgs[appId];
				if (!appCfg.workers) continue;
				html += views._appsSidenavItem(appCfg, selection);
			}
			html += '</ul>';
			return html;
		},
		_appsSidenavItem: function(appCfg, selection) {
			var appActiveClass = (selection == appCfg.id) ? ' active' : '';
			var html =
				'<li class="nav-header'+appActiveClass+'" value="'+appCfg.id+'">'+
					'<a href="httpl://config.env/apps/'+appCfg.id+'" target="cfgappsmain" data-toggle="nav"><i class="icon-'+appCfg.icon+'"></i> '+appCfg.title+'</a></li>'+
				'</li>';
			if (appCfg._active) {
				html += appCfg.workers
					.map(function(cfg) {
						var domain = makeWorkerDomain(cfg, appCfg.id);
						var cfgUrl = 'httpl://config.env/workers/'+domain;
						var workerActiveClass = (selection == domain) ? 'class="active"' : '';
						return '<li '+workerActiveClass+' value="'+domain+'"><a href="'+cfgUrl+'" target="cfgappsmain" data-toggle="nav">'+cfg.title+'</a></li>';
					})
					.join('');
			}
			return html;
		},
		appsSummary: function(appCfgs, inner) {
			var html = '';
			if (!inner)
				html += '<div data-subscribe="httpl://config.env/apps?view=summary&inner=1">';
			html += '<h4>Applications on '+toUpperFirst(window.location.host)+'</h4><hr/>';
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (!appCfgs[id]._readonly) continue; // readonly only
				html += views._appHeader(appCfgs[id], { nohtml:true })+'<hr/>';
			}
			html += '<br/><br/>'+
				'<h4>Your Applications <small><a href="httpl://config.env/apps/.new"><i class="icon-download-alt"></i> Load New App</a></small></h4>'+
				'<hr/>';
			var userHasApps = false;
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (appCfgs[id]._readonly) continue; // writeable only
				html += views._appHeader(appCfgs[id], { nohtml:true })+'<hr/>';
				userHasApps = true;
			}
			//<h2 class="muted"><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small> <span class="label">inactive</span></h2>
			if (!userHasApps)
				html += '<p class=muted>Nothing yet!</p>';
			if (!inner)
				html += '</div>';
			return html;
		},
		appCfg: function(cfg, values, errors, msg) {
			errors = errors || {};
			msg = (msg) ? '<div class="alert alert-success" data-lifespan="5">'+msg+'</div>' : '';
			var commonValue = ((typeof values.common == 'string') ? values.common : JSON.stringify(values.common,null,4)).replace(/</g,'&lt;').replace(/>/g,'&gt;');
			var workersValue = ((typeof values.workers == 'string') ? values.workers : JSON.stringify(values.workers,null,4)).replace(/</g,'&lt;').replace(/>/g,'&gt;');
			return views._appHeader(cfg)+'<hr/>'+
				((cfg._readonly) ? '<div class="alert alert-info"><i class="icon-info-sign"></i> Host applications are read-only. Click "Copy to Your Applications" to make changes.</div>' : '')+
				'<form class="form-horizontal" action="httpl://config.env/apps/'+cfg.id+'" method="post">'+
					msg+
					((errors._body) ? '<div class="alert alert-error">'+errors._body+'</div>' : '')+
					'<input type="hidden" name="id" value="'+cfg.id+'" />'+
					views._formControl('title', 'Title', 'text', values.title, errors.title, {readonly:cfg._readonly,required:true})+
					views._formControl('icon', 'Icon', 'text', values.icon, errors.icon, {readonly:cfg._readonly,required:true,help:'via <a href="http://twitter.github.io/bootstrap/base-css.html#icons" target="_blank">Glyphicons</a>'})+
					views._formControl('startpage', 'Startpage', 'url', values.startpage, errors.startpage, {width:'span6',required:true,readonly:cfg._readonly})+
					views._formControl('common', 'Common Config', 'textarea', commonValue, errors.common, {width:'span6',readonly:cfg._readonly,help:'^ Settings given to every worker'})+
					views._formControl('workers', 'Workers', 'textarea', workersValue, errors.workers, {width:'span6',rows:15,required:true,readonly:cfg._readonly})+
					((cfg._readonly) ? '' : '<div class="control-group"><div class="controls"><button class="btn">Update</button></div></div>')+
				'</form>';
		},
		appLoadNew: function(errors) {
			var errMsg = '';
			if (errors) {
				if (typeof errors.config == 'string')
					errMsg = '<div class="alert alert-error">Application file: '+errors.config+'</div>';
				else {
					errMsg = '<div class="alert alert-error"><strong>Mistakes were found in the application file:</strong><br/><ul>';
					for (var k in errors.config) {
						errMsg += '<li>`'+k+'`: '+errors.config[k]+'</li>';
					}
					errMsg += '</ul></div>';
				}
			}
			var html = '<h2>Load New Application</h2><hr/>'+
				'<form action="httpl://config.env/apps" method="post">'+
					errMsg+
					'<input type="file" name="config" required />'+
					'<button class="btn"><i class="icon-ok"></i> Load</button>'+
				'</form>';
			return html;
		},
		workerCfg: function(cfg) {
			return '<h3>'+cfg.domain+'</h3>'+
				'<ul class="nav nav-tabs">'+
					'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure" data-toggle="nav"><i class="icon-cog"></i></a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://config.env/workers/'+cfg.domain+'/src" title="Edit Source" data-toggle="nav"><i class="icon-edit"></i></a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Execute" data-toggle="nav"><i class="icon-hand-right"></i></a></li>'+
				'</ul>'+
				'<div id="cfg-'+cfg.domain+'" data-client-region="httpl://'+cfg.domain+'/.grim/config"></div>'+
				'<hr/>';
		},
		workerSource: function(cfg, src, appCfg) {
			var readonly = (appCfg._readonly) ? 'readonly' : '';
			return '<form action="httpl://config.env/workers/'+cfg.domain+'/src" method="patch">'+
					(appCfg._readonly ? '<div class="alert alert-info"><i class="icon-info-sign"></i> Host applications are read-only. Copy the app to Your Applications to edit the worker source.</div>' : '')+
					'<textarea name="src" class="span10" rows="20" '+readonly+'>'+src.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</textarea><br/>'+
					'<button class="btn">Update</button>'+
				'</form>';
		},
		_appHeader: function(cfg, options) {
			options = options || {};
			var muted = (cfg._active) ? '' : 'muted';
			var inactive = (cfg._active) ? '' : '<span class="label">inactive</span>';
			var accept = (options.nohtml) ? 'accept="none"' : 'accept="text/html"';
			var html = '<h2 class="'+muted+'"><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small> '+inactive+'</h2>';
			html += '<form action="httpl://config.env/apps/'+cfg.id+'" '+accept+'>';
			if (cfg._readonly) {
				html +=
					'<ul class="inline">'+
						'<li><button class="btn btn-link" formmethod="download"><i class="icon-download"></i> Save as File</button></li>'+
						'<li><button class="btn btn-link" formmethod="duplicate" formaccept="none"><i class="icon-download-alt"></i> Copy to Your Applications</button></li>'+
						((cfg._active) ?
							'<li><button class="btn btn-link" formmethod="disable"><i class="icon-remove"></i> Disable</button></li>' :
							'<li><button class="btn btn-link" formmethod="enable"><i class="icon-plus"></i> Enable</button></li>'
						)+
					'</ul>';
			} else {
				html +=
					'<ul class="inline">'+
						'<li><button class="btn btn-link" formmethod="download"><i class="icon-download"></i> Save as File</button></li>'+
						'<li><button class="btn btn-link" formmethod="duplicate" formaccept="none"><i class="icon-download-alt"></i> Duplicate</button></li>'+
						'<li><button class="btn btn-link" formmethod="delete"><i class="icon-remove-sign"></i> Unload</button></li>'+
						((cfg._active) ?
							'<li><button class="btn btn-link" formmethod="disable"><i class="icon-remove"></i> Disable</button></li>' :
							'<li><button class="btn btn-link" formmethod="enable"><i class="icon-plus"></i> Enable</button></li>'
						)+
					'</ul>';
			}
			html += '</form>';
			return html;
		},
		_formControl: function(id, label, type, value, error, options) {
			options = options || {};

			var cls = [];
			cls.push(options.width || 'input-large');
			cls = cls.join(' ');

			var readonly = (options.readonly) ? 'readonly' : '';
			var required = (options.required) ? 'required' : '';
			var extraAttrs = readonly+' '+required;

			if (type == 'textarea') {
				var rows = options.rows || 5;
				return '<div class="control-group '+(error?'error':'')+'">'+
						'<label class="control-label" for="'+id+'">'+label+'</label>'+
						'<div class="controls">'+
							'<textarea id="'+id+'" name="'+id+'" class="'+cls+'" rows="'+rows+'" '+extraAttrs+'>'+value+'</textarea>'+
							((error||options.help) ? '<span class="help-block">'+(error||options.help)+'</span>' : '')+
						'</div>'+
					'</div>';
			}
			return '<div class="control-group '+(error?'error':'')+'">'+
					'<label class="control-label" for="'+id+'">'+label+'</label>'+
					'<div class="controls">'+
						'<input type="'+type+'" id="'+id+'" name="'+id+'" class="'+cls+'" placeholder="'+label+'" '+extraAttrs+' value="'+value+'">'+
						((error||options.help) ? '<span class="help-inline">'+(error||options.help)+'</span>' : '')+
					'</div>'+
				'</div>';
		}
	};

	exports.ConfigServer = ConfigServer;
})(window);