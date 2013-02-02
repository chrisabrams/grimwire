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
		Link.router(request)
			.pma('/', /GET/i, 'text/event-stream', (function() {
				Link.responder(response).ok('text/event-stream');
				this.serversBroadcast.addStream(response);
			}).bind(this))
			.pm('/', /HEAD|GET/i, $getApps.bind(this, request, response))
			.pmt('/', /POST/i, /json/i, $addApp.bind(this, request, response))
			.pa(RegExp('/null/?','i'), /html/i, $null.bind(this, request, response))
            .pa(RegExp('/echo/?','i'), /html/i, $echo.bind(this, request, response))
			.error(response);
	};

	// GET|HEAD /
	function $getApps(request, response) {
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
	}

	// POST /
	function $addApp(request, response) {
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
	}

	// /null html
	function $null(request, response) {
		Link.responder(response).ok('text/html').end('');
	}

    // /echo html
    function $echo(request, response) {
        var content = request.body;
        if (/post/i.test(request.method) && /multipart\/form\-data/.test(request.headers['content-type']))
            content = content.parts[2].body;
        if (typeof content === 'object')
            content = content.text || JSON.stringify(content);
        Link.responder(response).ok('text/html').end(content);
    }

	// GET|HEAD /:app
	function $getApp(request, respond, appName) {
		Link.responder(response).notImplemented().end();
	}

	AppServer.prototype.renderAppsHtml = function(apps) {
		var html = [], appsByCategory = {}, domain, category;
		for (domain in apps) {
			category = apps[domain].config.category;
			appsByCategory[category] = (appsByCategory[category] || []).concat(apps[domain]);
		}
		var renderAppItem = function(app) {
			return [
				'<li>',
					'<a target="-blank" href="', app.config.startUrl, '">',
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
			'<intent class="freeze" action="http://grimwire.com/intents/freeze" draggable="true"><i class="intent icon-snowflake" title="Freeze"></i></intent>',
			//'<a class="reset" target="-bottom" href="javascript:void(0)" title="Reset :TODO:"><i class="intent icon-leaf-1"></i></a>',
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