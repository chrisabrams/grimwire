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
		this.defaultAppId = 'rss'; // :TODO:

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
				'/apps': [this, 'Apps'],
				'/apps/:id': [this, 'App']
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
					if (!res.body.id) console.error("Invalid application config: `id` is required", res.body);
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
				if (appCfg.id && appCfg.id.charAt(0) !== '_') { // dont validate environment apps
					var errors = validateAppConfig(appCfg);
					if (errors) throw "Invalid application config for '"+appId+"': "+JSON.stringify(errors);
				}

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
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
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

	ConfigServer.prototype.getEnvConfig = function() {
		var self = this;
		return this.storageHost.apps.item('.host').getJson()
			.then(
				function(res) {	return res.body; },
				function() { return deepClone(self.hostEnvConfig); }
			);
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
					appConfigs[app.id] = app;
				});
				return appConfigs;
			});
	};

	ConfigServer.prototype.getAppConfig = function(appId) {
		// given a config object?
		if (appId && typeof appId == 'object')
			return local.promise(deepClone(appId));

		// host app?
		if (appId in this.hostAppConfigs)
			return local.promise(patch(deepClone(this.hostAppConfigs[appId]), { _readonly:true }));

		// user app?
		return this.storageHost.apps.item(appId).getJson()
			.succeed(function(res) { return res.body; });
	};

	ConfigServer.prototype.installUserApp = function(cfg) {
		var self = this;
		return this.getAppConfig(cfg.id)
			.succeed(function(collidingAppCfg) {
				// app id in use, increment the trailing # and try again
				cfg.id = (''+cfg.id).replace(/(\d+)?$/, function(v) { return (+v || 1)+1; });
				return self.installUserApp(cfg);
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
						// broadcast that the loaded apps have changed
						self.getAppConfigs().then(function(appCfgs) {
							self.broadcasts.apps.emit('update', appCfgs);
						});
					});
			});
	};

	ConfigServer.prototype.getWorkerUserConfig = function(domain) {
		return this.storageHost.workerCfgs.item(domain).getJson()
				.then(function(res) { return res.body; }, function() { return {}; });
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
			var html;
			var view = request.query.view;
			if (view == 'kill') {
				html = '<form action="httpl://config.env/workers/'+server.config.domain+'" method="delete">'+
						'<p><strong>Shut down this worker?</strong></p>'+
						'<p>Workers are pieces of Grimwire applications. Shutting this one down will affect the "'+server.config.appTitle+'" app.</p>'+
						'<button class="btn btn-danger"><i class="icon-ok icon-white"></i> Remove</button>'+
					'</form>';
			}
			else
				html = workerHtmlToptabs(server.config);
			response.writeHead(200, 'ok', headers).end(html);
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
		if (!server) // :TODO: should we create the worker in this case?
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

					// :NOTE: replace in-place so that ordering is maintained in the Workers page
					// :TODO: can we simplify this to recycling the worker inside the WorkerServer?
					// local.env.killServer(domain);
					local.http.unregisterLocal(domain);
					server.terminate();
					// local.env.addServer(domain, new local.env.WorkerServer(server.config));
					server = local.env.servers[domain] = new local.env.WorkerServer(workerCfg);
					server.loadUserScript();
					local.http.registerLocal(domain, server.handleHttpRequest, server);

					response.writeHead(204, 'no content').end();
				});
		} else
			response.writeHead(415, 'bad content type').end();
	};

	ConfigServer.prototype.httpGetApps = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/apps' },
				{ rel:'item', href:'/apps/{title}' }
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
				function(cfgs) { response.writeHead(200, 'ok', headers).end(cfgs); },
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
					else if (view == 'sidenav') html = views.appsSidenav(appCfgs);
					else html = views.appsMain(appCfgs);

					headers['content-type'] = 'text/html';
					response.writeHead(200, 'ok', {'content-type':'text/html'}).end(html);
				})
				.fail(function() { response.writeHead(500, 'internal error').end(); });
		}
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
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
					response.writeHead(200, 'ok', headers).end(views.appCfg(cfg, JSON.stringify(cfg, null, 4)));
				},
				function() { response.writeHead(404, 'not found').end(); }
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
				self.installUserApp(cfg)
					.then(function() {
						self.openApp(cfg.id);
						response.writeHead(201, 'created').end();
					}, function() {
						response.writeHead(500, 'internal error').end();
					});
			},
			function() {
				response.writeHead(404, 'not found').end();
			});
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
			if (request.body.config) {
				var self = this;
				this.getAppConfig(appId).then(function(cfg) {
					// allow reconfigure of user apps only
					if (appId in self.hostAppConfigs) {
						return response.writeHead(403, 'forbidden', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, request.body.config, { _body:'Host applications are read-only. Please copy the app into Your Applications first.' }));
					}

					var newCfg;
					try { newCfg = JSON.parse(request.body.config); }
					catch (e) {
						return response.writeHead(422, 'semantic errors', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, request.body.config, { _body:'Unable to parse JSON -'+e }));
					}

					var errors = validateAppConfig(newCfg);
					if (errors)
						return response.writeHead(422, 'semantic errors', { 'content-type':'text/html' })
								.end(views.appCfg(cfg, request.body.config, errors));

					self.storageHost.apps.item(appId).put(newCfg, 'application/json').then(
						function() {
							self.reloadApp(appId);

							self.getAppConfigs().then(function(appCfgs) {
								// broadcast that the loaded apps have changed
								self.broadcasts.apps.emit('update', appCfgs);
							});

							response.writeHead(200, 'ok', { 'content-type':'text/html' })
								.end(views.appCfg(newCfg, request.body.config, null, 'Updated'));
						},
						function() {
							response.writeHead(502, 'bad gateway', { 'content-type':'text/html' })
								.end(views.appCfg(cfg, request.body.config, { _body:'Failed to save update' }));
						}
					);
				});
			} else
				return response.writeHead(422, 'semantic errors').end('`config` is required');
		}
		else
			response.writeHead(415, 'bad content-type').end();
	};

	function validateAppConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.id) errors.id = 'required';
		if (!cfg.startpage) errors.startpage = 'required';
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
		workerCfg.scriptUrl = workerCfg.src;
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

	var views = {
		appsMain: function(appCfgs) {
			var html = '<div class="row-fluid">'+
					'<div class="well well-small span2" data-subscribe="httpl://config.env/apps?view=sidenav">'+views.appsSidenav(appCfgs)+'</div>'+
					'<div id="cfgappsmain" class="span10" data-grim-layout="replace httpl://config.env/apps?view=summary"></div>'+
				'</div>';
			return html;
		},
		appsSidenav: function(appCfgs) {
			var html = '<ul class="nav nav-list">';
			html += '<li class="active"><a href="httpl://config.env/apps?view=summary" target="cfgappsmain"><strong>Applications</strong></a></li>';
			for (var appId in appCfgs) {
				var appCfg = appCfgs[appId];
				if (!appCfg.workers) continue;
				html +=
					'<li class="nav-header">'+
						'<a href="httpl://config.env/apps/'+appCfg.id+'" target="cfgappsmain"><i class="icon-'+appCfg.icon+'"></i> '+appCfg.title+'</a></li>'+
					'</li>';
				html += appCfgs[appId].workers
					.map(function(cfg) {
						var cfgUrl = 'httpl://config.env/workers/'+makeWorkerDomain(cfg, appId);
						return '<li><a href="'+cfgUrl+'" target="cfgappsmain">'+cfg.title+'</a></li>';
					})
					.join('');
			}
			html += '</ul>';
			return html;
		},
		appsSummary: function(appCfgs, inner) {
			var html = '';
			if (!inner)
				html += '<div data-subscribe="httpl://config.env/apps?view=summary&inner=1">';
			html += '<h4>Applications on '+toUpperFirst(window.location.hostname)+'</h4><hr/>';
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (!appCfgs[id]._readonly) continue; // readonly only
				html += views._appHeader(appCfgs[id])+'<hr/>';
			}
			html += '<br/><br/>'+
				'<h4>Your Applications <small><a href=#><i class="icon-download-alt"></i> Install New App</a></small></h4>'+
				'<hr/>';
			var userHasApps = false;
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (appCfgs[id]._readonly) continue; // writeable only
				html += views._appHeader(appCfgs[id])+'<hr/>';
				userHasApps = true;
			}
			//<h2 class="muted"><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small> <span class="label">inactive</span></h2>
			if (!userHasApps)
				html += '<p class=muted>Nothing yet!</p>';
			if (!inner)
				html += '</div>';
			return html;
		},
		appCfg: function(cfg, cfgText, errors, msg) {
			errors = errors || {};
			msg = (msg) ? '<div class="alert alert-success" data-lifespan="5">'+msg+'</div>' : '';
			return views._appHeader(cfg) +
				'<form action="httpl://config.env/apps/'+cfg.id+'" method="post">'+
					msg+
					((errors._body) ? '<div class="alert alert-error">'+errors._body+'</div>' : '')+
					// '<textarea name="config" class="span8" rows="15">'+
					// 	cfgText.replace(/</g,'&lt;').replace(/>/g,'&gt;')+
					// '</textarea><br/>'+
					// '<button class="btn">Update</button>'+
				'</form>';
		},
		_appHeader: function(cfg) {
			var html = '<h2><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small></h2>';
			html += '<form action="httpl://config.env/apps/'+cfg.id+'">';
			if (cfg._readonly) {
				html += '<ul class="inline">'+
						'<li><i class="icon-download"></i> <a href="#">Save as File</a></li>'+
						'<li><button class="btn btn-link" formmethod="duplicate"><i class="icon-download-alt"></i> Copy to Your Applications</button></li>'+
						'<li><a href="#"><i class="icon-remove"></i> Disable</a></li>'+
					'</ul>';
			} else {
				html += '<ul class="inline">'+
						'<li><a href="#"><i class="icon-download"></i> Save as File</a></li>'+
						'<li><a href="#"><i class="icon-edit"></i> Edit</a></li>'+
						'<li><a href="#"><i class="icon-remove-sign"></i> Uninstall</a></li>'+
						'<li><a href="#"><i class="icon-ok"></i> Enable</a></li>'+
					'</ul>';
			}
			html += '</form>';
			return html;
		}
	};

	// :DEBUG: choose one of these
	function workerHtmlSidetabs(cfg) {
		return '<h2>'+cfg.title+' <small>'+cfg.domain+'</small></h2>'+
			'<div class="tabbable tabs-left">'+
				'<ul class="nav nav-tabs">'+
					'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure"><i class="icon-cog"></i> Configure</a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Edit Source"><i class="icon-edit"></i> Edit</a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="View Worker Interface"><i class="icon-hand-right"></i> Execute</a></li>'+
				'</ul>'+
				'<div id="cfg-'+cfg.domain+'" class="tab-content" data-grim-layout="replace httpl://'+cfg.domain+'/.grim/config"></div>'+
			'</div>';
	}
	function workerHtmlToptabs(cfg) {
		return '<h3>'+cfg.domain+'</h3>'+
			'<ul class="nav nav-tabs">'+
				'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure"><i class="icon-cog"></i></a></li>'+
				'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Edit Source"><i class="icon-edit"></i></a></li>'+
				'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Execute"><i class="icon-hand-right"></i></a></li>'+
				'<li><a target="cfg-'+cfg.domain+'" href="httpl://config.env/workers/'+cfg.domain+'?view=kill" title="Remove Worker"><i class="icon-remove-sign"></i></a></li>'+
			'</ul>'+
			'<div id="cfg-'+cfg.domain+'" data-grim-layout="replace httpl://'+cfg.domain+'/.grim/config"></div>'+
			'<hr/>';
	}

	exports.ConfigServer = ConfigServer;
})(window);