importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	Link.router(request).mpa('get', '/', /html/, function() {
		if (request.query.url) {
			// edit
			Link.navigator(request.query.url).getText()
				.then(function(res) {
					Link.responder(response).ok('html').end([
						'<form action="httpl://v1.pfraze.text.edit.app" method="post">',
							'<input type="hidden" name="url" value="',request.query.url,'" />',
							'<textarea class="input-block-level" rows="28" name="text">',
								res.body.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
							'</textarea>',
						'</form>'
					].join(''));
				})
				.except(Link.responder(response).cb('badGateway'));
		} else {
			// load
			Link.responder(response).ok('html').end([
				'<form action="httpl://v1.pfraze.text.edit.app" method="get">',
					'<input type="text" name="url" />',
					'<input type="submit" name="Edit" />',
				'</form>'
			].join(''));
		}
	}).mpt('post', '/', /form\-data/, function() {
		Link.responder(response).ok('html').end([
			'<textarea class="input-block-level" rows="28" name="text">',
				JSON.stringify(request.body.parts[2].body).replace(/</g, '&lt;').replace(/>/g, '&gt;'),
			'</textarea>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Edit',
	name     : 'Text',
	author   : 'pfraze',
	version  : 'v1'
});