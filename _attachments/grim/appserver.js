Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// App Server
	// ============
	// EXPORTED
	// an isolated region of the DOM
	function AppServer(id) {
		Environment.Server.call(this);
		this.serversBroadcast = Link.broadcaster();
	}
	AppServer.prototype = Object.create(Environment.Server.prototype);

	AppServer.prototype.handleHttpRequest = function(request, response) {
		var router = Link.router(request);
		var self = this;
		router.pma('/', /GET/i, 'text/event-stream', function() {
			Link.responder(response).ok('text/event-stream');
			self.serversBroadcast.addStream(response);
		});
		router.pm('/', /HEAD|GET/i, this.$getApps.bind(this, request, response));
		router.pmt('/', /POST/i, /json/i, this.$addApp.bind(this, request, response));
		router.pma(RegExp('/null/?','i'), /HEAD|GET/i, /html/i, this.$getNull.bind(this, request, response));
		router.error(response);
	};

	// GET|HEAD /
	AppServer.prototype.$getApps = function(request, response) {
		var respond = Link.responder(response);
		var router = Link.router(request);

		var apps = Environment.listFilteredServers(function(s) { return (s instanceof Environment.WorkerServer); });

		var headerer = Link.headerer();
		headerer.addLink('/', 'self current');
		Object.keys(apps).forEach(function(domain) {
			headerer.addLink('httpl://'+domain, 'service', { title:domain });
		});

		if (/get/i.test(request.method)) {
			// GET
			var self = this;
			router.a(/html/i, function() {
				respond.ok('html', headerer).end(self.renderAppsHtml(apps));
			});
			router.a(/json/i, function() {
				respond.ok('json', headerer).end(self.renderAppsJson(apps));
			});
			router.error(response, ['path','method']);
		} else {
			// HEAD
			respond.ok(null, headerer).end();
		}
	};

	// POST /
	AppServer.prototype.$addApp = function(request, response) {
		var self = this;
		var respond = Link.responder(response);
		var router = Link.router(request);
		var fail = function(message) {
			if (server) server.terminate();
			return respond.badRequest('text/plain').end(message);
		};

		if (!request.body.scriptUrl && !request.body.script) {
			return fail('Must receive `scriptUrl` or `script');
		}

		var server = new Environment.WorkerServer(request.body);
		server.worker.onMessage('loaded', function(message) {
			if (server.state === Environment.Server.DEAD) { throw "Received 'loaded' message from a dead worker"; }

			var c = message.data || {};

			if (!c.category) return fail('Request body must include `category`');
			if (!c.name) return fail('Request body must include `name`');
			if (!c.author) return fail('Request body must include `author`');
			if (!c.version) return fail('Request body must include `version`');
			c.tld = 'app';

			var domains = [];
			var fields = ['tld','category','name','author','version'];
			for (var i=1; i <= 5; i++) {
				var d = [];
				for (var j=0; j < i; j++) {
					d.unshift(c[fields[j]].replace(/ /g,'_').replace(/\./g,'').toLowerCase());
				}
				domains.push(d.join('.'));
			}
			// domains = [tld, category.tld, name.category.tld, author.name.category.tld, version.author.name.category.tld]
			var domain = domains[4];

			if (Environment.getServer(domain)) {
				return fail('Domain \''+domain+'\' is already in use');
			}

			server.config.domains = domains;
			server.config.category = c.category;
			server.config.name = c.name;
			server.config.author = c.author;
			server.config.version = c.version;
			server.config.startUrl = c.startUrl || ('httpl://'+domain);
			Environment.addServer(domain, server);

			self.serversBroadcast.emit('update');
			respond.ok('application/json').end(server.config);
		});
	};

	// GET /null html
	AppServer.prototype.$getNull = function(request, response) {
		Link.responder(response).ok('text/html').end('');
	};

	// GET|HEAD /:app
	AppServer.prototype.$getApp = function(request, respond, appName) {
	};

	AppServer.prototype.renderAppsHtml = function(apps) {
		var html = [], appsByCategory = {}, domain, category;
		for (domain in apps) {
			category = apps[domain].config.category;
			appsByCategory[category] = (appsByCategory[category] || []).concat(apps[domain]);
		}
		var renderAppItem = function(app) {
			return [
				'<li>',
					'<a target="-bottom" href="', app.config.startUrl, '">',
						app.config.name, '<br/><small>', app.config.author, ', ', app.config.version, '</small>',
					'</a>',
				'</li>'].join('');
		};
		for (category in appsByCategory) {
			html.push([
			'<li class="dropdown">',
				'<a class="dropdown-toggle" data-toggle="dropdown" href="javascript:void(0)">'+category+'</a>',
				'<ul class="dropdown-menu">',
					appsByCategory[category].map(renderAppItem).join(''),
				'</ul>',
			'</li>'
			].join(''));
		}
		return [
		'<form action="httpl://app" data-output="true">',
			'<a class="torch" target="-bottom" href="httpl://app/null" title="Torch"><i class="sigil icon-fire"></i></a>',
			'<a class="freeze" target="-bottom" href="javascript:void(0)" title="Freeze :TODO:"><i class="sigil icon-snowflake"></i></a>',
			//'<a class="reset" target="-bottom" href="javascript:void(0)" title="Reset :TODO:"><i class="sigil icon-leaf-1"></i></a>',
			'<ul class="nav nav-pills">',
				'<li><img src="https://developer.mozilla.org/files/3969/plain_sign_in_blue.png" /></li>',
				html.join(''),
			'</ul>',
		'</form>'
		].join('');
	};

	AppServer.prototype.renderAppsJson = function(apps) {
		var data = {};
		for (var domain in apps) {
			data[domain] = JSON.parse(JSON.stringify(apps[domain].config)); // do this correctly to win a prize
		}
		return data;
	};

	exports.AppServer = AppServer;
})(Grim);