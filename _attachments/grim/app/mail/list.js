importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

// list
var list = 'grimwire-updates';
// subscription storage
var subscriptionsCollection = Link.navigator('/email/subscriptions');
// we use the same headers every time
var stdHeaders = Link.headerer();
stdHeaders.addLink('http://grimwire.com/grim/app/mail/list.js', 'http://grimwire.com/rels/src', { title:'application' });

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			Link.responder(response).ok('html', stdHeaders).end([
				'<legend>Subscribe to "',list,'"</legend>',
				'<form class="form-inline" action="httpl://v1.pfraze.list.mail.app/" method="POST">',
					'<input type="text" name="email" class="span6" />',
					'<input type="hidden" name="',list,'" />',
					'<input class="btn" type="submit" />',
				'</form>'
			].join(''));
		})
		.mpta('post', '/', /form/, /html/, function() {
			subscriptionsCollection.post({ list:list, email:request.body.email })
				.then(function() {
					Link.responder(response).ok('html', stdHeaders).end([
						'You have been subscribed to "'+list+'." ~pfraze'
					].join(''));
				})
				.except(function() {
					Link.responder(response).noContent().end();
				});
		})
		.error(response);
});
app.postMessage('loaded', {
	category : 'Mail',
	name     : 'List',
	author   : 'pfraze',
	version  : 'v1'
});