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
		var respond = Link.responder(response);
		router.pm('/', /HEAD|GET/i, this.$getApps.bind(this, request, respond));
		router.pm('/', /POST/i, this.$addApp.bind(this, request, respond));
		router.pma(RegExp('/null/?','i'), /HEAD|GET/i, /html/i, this.$getNull.bind(this, request, respond));
		router.error(response);
	};

	// GET|HEAD /
	AppServer.prototype.$getApps = function(request, respond) {
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
	AppServer.prototype.$addApp = function(request, respond) {
	};

	// GET /null html
	AppServer.prototype.$getNull = function(request, respond) {
		respond.ok('text/html').end('');
	};

	// GET|HEAD /:app
	AppServer.prototype.$getApp = function(request, respond, appName) {
	};

	exports.AppServer = AppServer;
})(Grim);