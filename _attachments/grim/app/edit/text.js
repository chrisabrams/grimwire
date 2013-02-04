importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	var headers = Link.headerer();
	headers.addLink('http://grimwire.com/grim/app/edit/text.js', 'http://grimwire.com/rels/src', { title:'application' });
	Link.router(request).mpa('get', '/', /html/, function() {
		if (request.query.url) {
			// edit
			Link.navigator(request.query.url).getText()
				.then(function(res) {
					Link.responder(response).ok('html', headers).end([
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
			Link.responder(response).ok('html', headers).end([
				'<form action="httpl://v1.pfraze.text.edit.app" method="get">',
					'<input type="text" name="url" />',
					'<input type="submit" name="Edit" />',
				'</form>'
			].join(''));
		}
	}).mpt('post', '/', /form\-data/, function() {
		var contextData = request.body.parts[2].body;
		var content = (typeof contextData != 'string') ? //
							JSON.stringify(contextData) :
							contextData;
		Link.responder(response).ok('html', headers).end([
			'<form>', // intents can use the form
				'<textarea class="input-block-level" rows="10" name="text">',
					content.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
				'</textarea>',
			'</form>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Edit',
	name     : 'Text',
	author   : 'pfraze',
	version  : 'v1'
});