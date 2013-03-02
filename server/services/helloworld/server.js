module.exports = function createServer(main_server, config) {
	var express = require('express');
	var server = express();

	server.get('/', function(req, res, next) {
		res.link('service', '/', 'grimwire');
		res.link('up', '/services');
		res.link('self', '/services/helloworld');
		res.send('Hello, World');
	});

	return server;
};