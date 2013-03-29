importScripts('lib/local/linkjs-ext/responder.js');
importScripts('lib/local/linkjs-ext/router.js');
local.onHttpRequest(function(request, response) {
	Link.router(request).mpa('get', '/', /html/, function() {
		Link.responder(response).ok('html').end([
			'<a href="httpl://',local.config.domain,'" target="-above">above</a>',
			' [<a href="httpl://app/null">',Math.round(Math.random()*100),'</a>] ',
			'<a href="httpl://',local.config.domain,'" target="-below">below</a>'
		].join(''));
	}).error(response);
});