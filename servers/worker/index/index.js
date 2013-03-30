// index/index.js
// ==============
// Clientside search with lunr.js

importScripts('lib/lunr/lunr.min.js');
// importScripts('lib/local/linkjs-ext/broadcaster.js');
importScripts('lib/local/linkjs-ext/router.js');
importScripts('lib/local/linkjs-ext/responder.js');

function LunrServer(configService) {
	this.sidenavBroadcast = Link.broadcaster();
	this.serversConfigItem = Link.navigator('httpl://config.env').collection('values').item('servers');

	var self = this;
	this.serversConfigItem.resolve()
		.then(function(url) {
			var serversConfigUpdates = Link.subscribe(url);
			serversConfigUpdates.on('update', function(e) {
				self.sidenavBroadcast.emit('update');
			});
		});
}
LunrServer.prototype = Object.create(local.Server.prototype);

// request router
LunrServer.prototype.handleHttpRequest = function(request, response) {
	var self = this;
	var router = Link.router(request);
	router.pma('/', /GET/i, /html/, this.handler('getInterface', request, response));
	router.pma('/', /GET/i, /event-stream/, this.handler('getEventStream', request, response));
	router.error(response);
};

LunrServer.prototype.handler = function(handlerName, request, response) {
	var self = this;
	var handler = this[handlerName];
	return function(match) { handler.call(self, request, response, match); };
};

function addLI(url, label, activeUrl) {
	return [
		'<li ', (url == activeUrl) ? 'class="active"' : '', '>',
			'<a href="',url,'" target="content">',label,'</a>',
		'</li>'
	].join('');
}

LunrServer.prototype.getInterface = function(request, response) {
	var self = this;
	Link.responder(response).pipe(
		this.serversConfigItem.getJson(),
		function(headers) {
			headers['content-type'] = 'text/html';
			return headers;
		},
		function(body) {
			if (body && typeof body == 'object') {
				var activeUrl = request.query.active || body.index;
				var ul = [
					'<input type="hidden" name="active" value="',activeUrl,'" />',
					'<ul class="nav nav-pills nav-stacked">',
						addLI(body.index, 'Index', activeUrl),
						addLI('httpl://servers.env', 'Local Servers', activeUrl),
						addLI('httpl://config.env', 'Config', activeUrl),
					'</ul>'
				].join('');
				if (request.query.output == 'ul')
					return ul;
				return [
				'<form action="httpl://',self.config.domain,'">',
					'<output name="ul">',
						ul,
					'</output>',
				'</form>'
				].join('');
			}
			return 'Error: server config would not load';
		}
	);
};

LunrServer.prototype.getEventStream = function(request, response) {
	Link.responder(response).ok('event-stream');
	this.sidenavBroadcast.addStream(response);
};

local.setServer(LunrServer);