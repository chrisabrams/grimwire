var express = require('express');

// App setup

function rawBody(req, res, next) { // thanks to JP Richardson
	req.setEncoding('utf8');
	req.rawBody = '';
	req.on('data', function(chunk) {
		req.rawBody += chunk;
	});
	req.on('end', next);
}

function setCORSHeaders(req, res, next) {
	// this function open-sourced by Goodybag, Inc
	res.setHeader('Access-Control-Allow-Origin', req.headers['origin'] || '*');
	res.setHeader('Access-Control-Allow-Credentials', true);
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, HEAD, GET, PUT, PATCH, POST, DELETE');
	res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
	res.setHeader('Access-Control-Expose-Headers', req.headers['access-control-request-headers']);

	// intercept OPTIONS method, this needs to respond with a zero length response (pre-flight for CORS).
	if (req.method === 'OPTIONS') return res.send(200);
	next();
}

var app = module.exports = express();
app.configure(function(){
	// app.use(rawBody);
	app.use(setCORSHeaders);
	app.use(express.bodyParser());
	app.use(express.methodOverride());
	app.use(app.router);
	app.use(express.static(__dirname + '/../client'));
});

app.configure('development', function(){
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.configure('production', function(){
	app.use(express.errorHandler());
});

var channels = {
	all: {
		activity: new (require('events')).EventEmitter(),
		users: {}
	}
};

// Routes

app.get('/messages', function(req, res) {
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

app.post('/messages', function(req, res) {
	if (!req.is('application/json'))
		return res.send(415); // unsupported media type
	channels.all.activity.emit('broadcast', req.body.message, req.body.author);
	res.send(204);
});

app.listen(8000);
console.log(app.settings.env, 'mode');
console.log('listening on port 8000');