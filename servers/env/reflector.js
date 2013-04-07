// ReflectorServer
// ===============
// provides tools for services to self-manage
var _root_    = '/';
var _new_     = /^\/_new\/?$/i; // /_new
var _domain_  = /^\/([A-z0-9_\-\.]+)\/?$/i; // /:domain
var _restore_ = /^\/([A-z0-9_\-\.]+)\/restore\/?$/i; // /:domain/restore
var _editor_  = /^\/([A-z0-9_\-\.]+)\/editor\/?$/i; // /:domain/editor
var _delete_  = /^\/([A-z0-9_\-\.]+)\/delete\/?$/i; // /:domain/delete
function ReflectorServer(configService) {
	Environment.Server.call(this);
	this.serversConfigItem = configService.collection('values').item('servers');
}
ReflectorServer.prototype = Object.create(Environment.Server.prototype);

// request router
ReflectorServer.prototype.handleHttpRequest = function(request, response) {
	var router = Link.router(request);
	router.pm (_root_,    /HEAD|GET/i, this.handler('listServers', request, response));
	router.pmt(_root_,    /POST/i,     /form|json/, this.handler('addServer', request, response));
	router.pm (_new_,     /HEAD|GET/i, this.handler('getNewServer', request, response));
	router.pm (_domain_,  /HEAD|GET/i, this.handler('getServer', request, response));
	router.pm (_domain_,  /DELETE/i,   this.handler('deleteServer', request, response));
	router.pm (_restore_, /HEAD|GET/i, this.handler('getServerRestore', request, response));
	router.pm (_restore_, /POST/i,     this.handler('postServerRestore', request, response));
	router.pm (_editor_,  /HEAD|GET/i, this.handler('getServerEditor', request, response));
	router.pmt(_editor_,  /POST/i,     /form|json/, this.handler('postServerEditor', request, response));
	router.pm (_delete_,  /HEAD|GET/i, this.handler('getServerDelete', request, response));
	router.error(response);
};

ReflectorServer.prototype.handler = function(handlerName, request, respond) {
	var self = this;
	var handler = this[handlerName];
	return function(match) { handler.call(self, request, respond, match); };
};

// GET|HEAD /
ReflectorServer.prototype.listServers = function(request, response) {
	var respond = Link.responder(response);
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'self');
	var servers = Environment.servers;
	var configs = [];
	for (var domain in servers) {
		headerer.addLink('/'+domain, 'item', { title:domain });
		configs.push(servers[domain].config);
	}

	if (/GET/i.test(request.method)) {
		if (/html/.test(request.headers.accept))
			return respond.ok('html', headerer).end(this.buildServerListHTML());
		return respond.ok('json', headerer).end(configs);
	}
	respond.ok(null, headerer).end();
};

// POST /
ReflectorServer.prototype.addServer = function(request, response) {
	var respond = Link.responder(response);
	var headerer = Link.headerer();
	headerer.addLink('/', 'self');
	for (var domain in Environment.servers)
		headerer.addLink('/'+domain, 'item', { title:domain });

	// validate
	var errors = {};
	if (!request.body.domain)
		errors.domain = 'Required';
	else if (Environment.getServer(request.body.domain))
		errors.domain = 'Already in use';
	if (!request.body.scriptUrl)
		errors.scriptUrl = 'Required';
	if (Object.keys(errors).length !== 0)
		return respond.badRequest('html', headerer).end(this.buildNewServerHTML(request.body, errors));

	// attempt load
	Environment.addServer(request.body.domain, new Environment.WorkerServer(request.body));
	respond.ok('html', headerer).end('<div class="alert alert-info">Loaded</div>');
	this.updateConfig();
};

ReflectorServer.prototype.buildServerHTML = function(domain) {
	var html = [];
	var server = Environment.getServer(domain);
	if (!server)
		return '';

	html.push(['<dt>Server</dt><dd>',domain,'</dd>'].join(''));
	if (server.config.scriptUrl || server.config.script) {
		html.push([
			'<dt>Source</dt>',
			'<dd>',server.config.scriptUrl || server.config.origScriptUrl,'</dd>'
		].join(''));
		if (server.config.script) {
			html.push('<dt></dt><dd><p><em>Using modified source</em></p></dd>');
		}
		html.push([
			'<dt>Actions</dt>',
			'<dd>',
				'<a class="btn btn-mini" target="',domain,'-workspace" href="httpl://servers.env/',domain,'/editor"><i class="icon-edit"></i> Edit Source</a> ',
				(server.config.script) ? '<a class="btn btn-mini" target="'+domain+'-workspace" href="httpl://servers.env/'+domain+'/restore"><i class="icon-repeat"></i> Restore</a> ' : '',
				'<a class="btn btn-mini btn-danger" target="',domain,'-workspace" href="httpl://servers.env/'+domain+'/delete"><i class="icon-remove-circle icon-white"></i> Delete</a>',
			'</dd>'
		].join(''));
	}

	return [
		'<div id="',domain,'-settings">',
			'<dl>',html.join(''),'</dl>',
			'<div id="',domain,'-workspace"></div>',
			'<hr />',
		'</div>'
	].join('');
};

ReflectorServer.prototype.buildServerListHTML = function() {
	var html = [];
	for (var domain in Environment.servers)
		html.push(this.buildServerHTML(domain));
	return html.join('') +
		'<div id="new-server"></div>' +
		'<a class="btn btn-primary btn-small" href="httpl://servers.env/_new" target="new-server"><i class="icon-plus icon-white"></i> Add Server</a>';
};

// GET|HEAD /_new
ReflectorServer.prototype.getNewServer = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];

	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/_new', 'self');

	if (/GET/i.test(request.method)) {
		respond.ok('html', headerer).end(this.buildNewServerHTML());
	} else
		respond.ok(null, headerer).end();
};

ReflectorServer.prototype.buildNewServerHTML = function(values, errors) {
	values = values || {};
	errors = errors || {};

	return [
	'<div class="well">',
		'<form class="nomargin" action="httpl://servers.env" method="post" target="new-server">',
			'<p><strong>Load Server</strong></p>',
			'<div class="control-group ',(errors.domain) ? 'error' : '','">',
				'<label class="control-label">Domain:</label>',
				'<div class="controls">',
					'<input type="text" name="domain" value="',values.domain,'" />',
					(errors.domain) ? ' <span class="help-inline">'+errors.domain+'</span>' : '',
				'</div>',
			'</div>',
			'<div class="control-group ',(errors.scriptUrl) ? 'error' : '','">',
				'<label class="control-label">Script URL:</label>',
				'<div class="controls">',
					'<input type="text" name="scriptUrl" value="',values.scriptUrl,'" />',
					(errors.scriptUrl) ? ' <span class="help-inline">'+errors.scriptUrl+'</span>' : '',
				'</div>',
			'</div>',
			'<button type="submit" class="btn btn-primary">Load</button> ',
			'<a class="btn" href="httpl://noop" target="new-server">Cancel</a>',
		'</form>',
	'</div>'
	].join('');
};

// GET|HEAD /:domain
ReflectorServer.prototype.getServer = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var router = Link.router(request);
	// headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	// find
	var server = Environment.getServer(domain);
	if (server) {
		// add links
		headerer.addLink('/'+domain, 'self current');
		if (/GET/i.test(request.method)) {
			// respond with data
			router.a(/json/i, function() {
				respond.ok('json', headerer).end(server.config);
			});
			router.a(/javascript/i, function() {
				// retrieve source
				Local.promise(server.getSource())
					.then(function(source) {
						respond.ok('application/javascript', headerer).end(source);
					}, function(err) { respond.badGateway(headerer).end(); });
			});
			router.error(response, ['path','method']);
		} else {
			// respond with headers
			respond.ok(null, headerer).end();
		}
	} else {
		respond.notFound().end();
	}
};

// DELETE /:domain
ReflectorServer.prototype.deleteServer = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var server = Environment.getServer(domain);
	if (!server)
		return respond.notFound().end();

	var headerer = Link.headerer();
	headerer.addLink('/', 'up');

	if (server instanceof Environment.WorkerServer) {
		Environment.killServer(domain);
		respond.ok(null, headerer).end();
		this.updateConfig();
	} else {
		// can't live-update environment servers (...yet?)
		respond.respond([400, 'only worker servers can be hot-swapped'], headerer).end();
	}
};

// GET /:domain/restore
ReflectorServer.prototype.getServerRestore = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var server = Environment.getServer(domain);
	if (!server)
		respond.notFound().end();
	
	var headerer = Link.headerer();
	headerer.addLink('/', 'via service');
	headerer.addLink('/'+domain, 'up item');
	headerer.addLink('/'+domain+'/restore', 'self');
	if (/GET/i.test(request.method)) {
		respond.ok('html').end([
		'<div class="well">',
			'<form class="nomargin" method="post" action="httpl://servers.env/',domain,'/restore" target="',domain,'-settings">',
				'<p><strong>Restore server from source URL?</strong></p>',
				'<button type="submit" class="btn btn-primary">Restore</button> ',
				'<a class="btn" href="httpl://noop" target="',domain,'-workspace">Cancel</a>',
			'</form>',
		'</div>'
		].join(''));
	} else
		respond.ok(null, headerer).end();
};

// POST /:domain/restore
ReflectorServer.prototype.postServerRestore = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var server = Environment.getServer(domain);
	if (!server)
		return respond.notFound().end();

	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/'+domain, 'self current');

	if (server instanceof Environment.WorkerServer) {
		var config = server.config;
		if (config.script && config.origScriptUrl) {
			// restore config to pull from url
			config.scriptUrl = config.origScriptUrl;
			delete config.script; delete config.origScriptUrl;

			// recreate
			Environment.killServer(domain);
			Environment.addServer(domain, new Environment.WorkerServer(config));
		}
		if (/html/.test(request.headers.accept))
			return respond.ok('html', headerer).end(this.buildServerHTML(domain));
		respond.ok(null, headerer).end();
	} else {
		// can't live-update environment servers (...yet?)
		respond.respond([400, 'only worker servers can be hot-swapped'], headerer).end();
	}
};

// GET /:domain/editor
ReflectorServer.prototype.getServerEditor = function(request, response, match) {
	var self = this;
	var respond = Link.responder(response);
	var domain = match.path[1];
	// headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'via service');
	// find
	var server = Environment.getServer(domain);
	if (server) {
		// add links
		headerer.addLink('/'+domain, 'up item');
		headerer.addLink('/'+domain+'/editor', 'self current');
		if (/GET/i.test(request.method)) {
			// retrieve source
			Local.promise(server.getSource())
				.then(function(source) {
					respond.ok('html').end(self.renderServerEditorHtml(domain, source));
				}, function(err) { respond.badGateway(headerer).end(); });
		} else {
			// respond with headers
			respond.ok(null, headerer).end();
		}
	} else {
		respond.notFound().end();
	}
};

ReflectorServer.prototype.renderServerEditorHtml = function(domain, source) {
	source = source.replace(/</g,'&lt;').replace(/>/g,'&gt;');
	return [
	'<div class="well">',
		'<p><strong>Editing ',domain,'</strong></p>',
		'<form class="nomargin" action="httpl://',this.config.domain,'/',domain,'/editor" method="post" target="',domain,'-settings">',
			'<textarea name="source" class="input-block-level" rows="20">',source,'</textarea>',
			'<button type="submit" class="btn btn-primary">Reload</button> ',
			'<a class="btn" href="httpl://noop" target="',domain,'-workspace">Cancel</a>',
		'</form>',
	'</div>'
	].join('');
};

// POST /:domain/editor
ReflectorServer.prototype.postServerEditor = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var self = this;
	// headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'via service');
	// find
	var server = Environment.getServer(domain);
	if (server) {
		// add links
		headerer.addLink('/'+domain, 'up item');
		headerer.addLink('/'+domain+'/editor', 'self');
	
		if (server instanceof Environment.WorkerServer) {
			// shutdown the server
			Environment.killServer(domain);
			// load a new server in-place with the given source
			var config = server.config;
			config.script = request.body.source;
			config.origScriptUrl = config.scriptUrl || config.origScriptUrl; delete config.scriptUrl;
			Environment.addServer(domain, new Environment.WorkerServer(config));
			// respond with the new config section
			respond.ok('html').end(this.buildServerHTML(domain));
		} else {
			// can't live-update environment servers (...yet?)
			respond.respond([400, 'only worker servers can be hot-swapped']).end();
		}
	} else {
		respond.notFound().end();
	}
};

// GET /:domain/delete
ReflectorServer.prototype.getServerDelete = function(request, response, match) {
	var respond = Link.responder(response);
	var domain = match.path[1];
	var server = Environment.getServer(domain);
	if (!server)
		respond.notFound().end();
	
	var headerer = Link.headerer();
	headerer.addLink('/', 'via service');
	headerer.addLink('/'+domain, 'up item');
	headerer.addLink('/'+domain+'/delete', 'self');
	if (/GET/i.test(request.method)) {
		respond.ok('html').end([
		'<div class="well">',
			'<form class="nomargin" method="delete" action="httpl://servers.env/',domain,'" target="',domain,'-settings">',
				'<p><strong>Remove server from the session?</strong></p>',
				'<button type="submit" class="btn btn-danger">Delete</button> ',
				'<a class="btn" href="httpl://noop" target="',domain,'-workspace">Cancel</a>',
			'</form>',
		'</div>'
		].join(''));
	} else
		respond.ok(null, headerer).end();
};

ReflectorServer.prototype.updateConfig = function() {
	var apps = {};
	for (var domain in Environment.servers) {
		var server = Environment.servers[domain];
		if (server instanceof Environment.WorkerServer)
			apps[domain] = server.config.origScriptUrl || server.config.scriptUrl;
	}
	this.serversConfigItem.patch({apps:JSON.stringify(apps)}, 'application/json');
};