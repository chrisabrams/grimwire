Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// App Server
	// ============
	// EXPORTED
	// an isolated region of the DOM
	function AppServer(id) {
		Environment.Server.call(this);
	}
	AppServer.prototype = Object.create(Environment.Server.prototype);

	AppServer.prototype.handleHttpRequest = function(request, response) {
		var router = Link.router(request);

		router.pm('/', /HEAD|GET/i, this.$getApps.bind(this, request, response));
		router.pm('/', /POST/i, this.$addApp.bind(this, request, response));
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
	};

	// GET /null html
	AppServer.prototype.$getNull = function(request, response) {
		Link.responder(response).ok('text/html').end('');
	};

	// GET|HEAD /:app
	AppServer.prototype.$getApp = function(request, respond, appName) {
	};

	AppServer.prototype.renderAppsHtml = function(apps) {
		var html = [], appsByTask = {}, domain, task;
		for (domain in apps) {
			task = apps[domain].config.task;
			appsByTask[task] = (appsByTask[task] || []).concat(apps[domain]);
		}
		for (task in appsByTask) {
			html.push([
			'<li class="dropdown">',
				'<a class="dropdown-toggle" data-toggle="dropdown" href="javascript:void(0)">'+task+'</a>',
				'<ul class="dropdown-menu">',
					appsByTask[task].map(function(app) {
						return ['<li><a target="-bottom" href="', app.config.startUrl,'">'+app.config.name+'</a></li>'].join('');
					}).join(''),
				'</ul>',
			'</li>'
			].join(''));
		}
		return [
			'<a class="torch" target="-bottom" href="httpl://app/null" title="Torch :TODO: reimplement as a sigil"><i class="sigil icon-fire"></i></a>',
			'<a class="freeze" target="-bottom" href="javascript:void(0)" title="Freeze :TODO:"><i class="sigil icon-snowflake"></i></a>',
			'<a class="reset" target="-bottom" href="javascript:void(0)" title="Reset :TODO:"><i class="sigil icon-leaf-1"></i></a>',
			'<ul class="nav nav-pills">',
				'<li><img src="https://developer.mozilla.org/files/3969/plain_sign_in_blue.png" /></li>',
				html.join(''),
			'</ul>'
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