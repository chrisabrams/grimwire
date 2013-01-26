importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	Link.router(request).mpa('get', '/', /html/, function() {
		Link.responder(response).ok('html').end([
			'[<a href="httpl://app/null">X</a>] ',
			'<form method="post" action="httpl://', app.config.domain, '">',
				'<input type="text" name="foo" />',
				'<input class="btn" draggable=true type="submit" />',
			'</form>'
		].join(''));
	}).mpa('post', '/', /html/, function() {
		Link.responder(response).ok('html').end(JSON.stringify(request.body));
	}).error(response);
});
app.postMessage('loaded');