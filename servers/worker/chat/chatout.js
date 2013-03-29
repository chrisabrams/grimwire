// ChatOut.js
// ==========
// kai's default message-stream decorator

importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

local.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			Link.responder(response).ok('html').end('');
		})
		.mpta('post', '/', /json/, /html/, function() {
			Link.responder(response).ok('html').end(request.body.message);
		})
		.error(response);
});