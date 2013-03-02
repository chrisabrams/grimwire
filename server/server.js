var express = require('express');
var middleware = require('./lib/middleware');
var path = require('path');

var server = module.exports = express();
server.configure('development', function(){
	server.config = require('./config.development.js');
	server.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

server.configure('production', function(){
	server.config = require('./config.production.js');
	server.use(express.errorHandler());
});

server.configure(function(){
	server.use(middleware.setCORSHeaders);
	server.use(middleware.addResponseHelpers);
	server.use(express.bodyParser());
	server.use(express.methodOverride());
	server.use(server.router);
	(function loadServices() {
		for (var serviceName in server.config.services) {
			if (!server.config.services.hasOwnProperty(serviceName)) { continue; }
			var serviceConfig = server.config.services[serviceName];
			server.use(
				'/services/'+serviceName,
				require('./' + path.join('services', serviceName, 'server.js'))(server, serviceConfig)
			);
		}
	})();
	server.use(addStaticLinkHeaders);
	server.use(express.static(__dirname + '/../client'));
});

function addStaticLinkHeaders(req, res, next) {
	res.link('service', '/', 'grimwire');
	var services = server.config.services;
	for (var serviceName in services) {
		if (!services.hasOwnProperty(serviceName)) { continue; }
		res.link('service', '/services/'+serviceName, serviceName);
	}
	next();
}

server.listen(8000);
console.log(server.settings.env, 'mode');
console.log('listening on port 8000');