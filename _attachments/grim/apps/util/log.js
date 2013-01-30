importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
importScripts('linkjs-ext/broadcaster.js');

var log = [];
var logBroadcast = Link.broadcaster();

function renderHtml() {
	var entriesHtml = log
		.map(function(entry) { return '<p>['+entry.time.toTimeString().slice(0,8)+'] '+entry.msg+'</p>'; })
		.join('');
	var html = [
		'<h5>log</h5>',
		'<form action="httpl://v1.pfraze.log.util.app" data-output="true">',
			entriesHtml,
		'</form>'
	].join('');
	return html;
}

app.onHttpRequest(function(request, response) {
	var router = Link.router(request);
	var respond = Link.responder(response);

	// collection
	router.p('/', function() {
		// build headers
		var headerer = Link.headerer();
		headerer.addLink('/', 'self current');

		// list
		router.ma('GET', /html/, function() {
			respond.ok('html', headerer).end(renderHtml()); // respond with log html
		});
		// subscribe to events
		router.ma('GET', /event-stream/, function() {
			respond.ok('event-stream', headerer);
			logBroadcast.addStream(response); // add the log updates listener
		});
		// add log entry
		router.mt('POST', /html|plain/, function() {
			log.push({ msg:request.body, time:(new Date()) }); // store the entry
			logBroadcast.emit('update'); // tell our listeners about the change
			respond.ok().end();
		});
		router.error(response, 'path');
	});
	router.error(response);
});
app.postMessage('loaded', {
	category : 'Util',
	name     : 'Log',
	author   : 'pfraze',
	version  : 'v1'
});