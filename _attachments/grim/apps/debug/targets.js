importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	Link.router(request).mpa('get', '/', /html/, function() {
		Link.responder(response).ok('html').end([
			'<a href="httpl://', app.config.domain, '" target="-above">above</a>',
			' [<a href="httpl://app/null">',Math.round(Math.random()*100),'</a>] ',
			'<a href="httpl://', app.config.domain, '" target="-below">below</a>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Debug',
	name     : 'Targets',
	author   : 'pfraze',
	version  : 'v1'
});