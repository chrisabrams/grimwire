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
        router.a(/html/i, function() {
            respond.ok('html').end('ok');
        });
        router.a(/json/i, function() {
            respond.ok('json').end('["ok"]');
        });
        router.error(response, ['path','method']);
		// build headers
		// var headerer = Link.headerer();
		// headerer.addLink('/', 'self current');
		// Object.keys(this.collections).forEach(function(cid) {
		// 	headerer.addLink('/'+cid, 'collection', { title:cid });
		// });

		// if (/get/i.test(request.method)) {
		// 	// respond with data
		// 	respond.ok('json', headerer).end(this.collections);
		// } else {
		// 	// respond with headers
		// 	respond.ok(null, headerer).end();		
		// }
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

	exports.AppServer = AppServer;
})(Grim);