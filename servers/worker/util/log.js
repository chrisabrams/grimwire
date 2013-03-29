importScripts('lib/local/linkjs-ext/responder.js');
importScripts('lib/local/linkjs-ext/router.js');
importScripts('lib/local/linkjs-ext/broadcaster.js');

var log = [];
var logBroadcast = Link.broadcaster();

function renderHtml() {
	var style = 'width:60px; text-align:center; background:#eee; color:#808080';
	var entriesHtml = log
		.slice(-10)
		.map(function(entry) { return '<tr'+((entry.type)?' class="'+entry.type+'"':'')+'><td style="'+style+'">'+entry.time.toTimeString().slice(0,8)+'</td><td>'+entry.msg+'</td></tr>'; })
		.join('');
	var html = [
		'<style>.log-entries td { max-width: 400px;white-space: nowrap;overflow: hidden; }</style>',
		'<form action="httpl://v1.pfraze.log.util.app" data-output="true" data-intents="none">',
			'<table class="log-entries table table-condensed table-bordered">',
				entriesHtml,
			'</table>',
		'</form>'
	].join('');
	return html;
}

local.onHttpRequest(function(request, response) {
	var router = Link.router(request);
	var respond = Link.responder(response);

	// collection
	router.p('/', function() {
		// build headers
		var headers = Link.headerer();
		headers.addLink('/', 'self current');
		headers.addLink('http://grimwire.com/grim/app/util/log.js', 'http://grimwire.com/rels/src', { title:'application' });

		router.m('HEAD', function() {
			respond.ok('html', headers).end(renderHtml()); // respond with log html
		});
		// list
		router.ma('GET', /html/, function() {
			respond.ok('html', headers).end(renderHtml()); // respond with log html
		});
		// subscribe to events
		router.ma('GET', /event-stream/, function() {
			respond.ok('event-stream', headers);
			logBroadcast.addStream(response); // add the log updates listener
			logBroadcast.emitTo(response, 'update'); // resync for any changes that might've occurred
		});
		// add log entry
		router.mt('POST', /html|plain/, function() {
			log.push({ msg:request.body, time:(new Date()) }); // store the entry
			//console.log(request.body);
			logBroadcast.emit('update'); // tell our listeners about the change
			respond.ok().end();
		});
		// add log entry
		router.mt('POST', /json/, function() {
			log.push({ msg:request.body.message, type:request.body.type, time:(new Date()) }); // store the entry
			//console.log(request.body);
			logBroadcast.emit('update'); // tell our listeners about the change
			respond.ok().end();
		});
		router.error(response, 'path');
	});
	router.error(response);
});
local.postMessage('loaded', {
	author   : 'pfraze',
	name     : 'Log',
	category : 'Util',
	version  : 'v1'
});
