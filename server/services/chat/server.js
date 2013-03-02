module.exports = function createServer(main_server, config) {
	var express = require('express');
	var server = express();

	var channels = {
		all: {
			activity: new (require('events')).EventEmitter(),
			users: {}
		}
	};

	server.get('/', function(req, res) {
		res.link('service', '/', 'grimwire');
		res.link('up', '/services');
		res.link('self', '/services/chat');
		res.link('collection', '/services/chat/messages', 'messages');
		res.send('grimwire chat service');
	});

	server.get('/messages', function(req, res) {
		if (!req.accepts('text/event-stream'))
			return res.send(406); // not acceptable

		// set up channel broadcasting for the stream
		var messageId = 0;
		var broadcast = function(message, author) {
			res.write('id: ' + (messageId++) + '\n');
			res.write('event: broadcast\n');
			res.write('data: ' + JSON.stringify({ message:message, author:author, timestamp:new Date() }) + '\n\n');
		};
		req.socket.setTimeout(Infinity);
		channels.all.activity.on('broadcast', broadcast);

		// send back headers
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		});
		res.write('\n');

		req.on("close", function() {
			channels.all.activity.removeListener('broadcast', broadcast);
		});
	});

	server.post('/messages', function(req, res) {
		if (!req.is('application/json'))
			return res.send(415); // unsupported media type
		channels.all.activity.emit('broadcast', req.body.message, req.body.author);
		res.send(204);
	});

	return server;
};