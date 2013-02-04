importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	Link.router(request).mp('get', '/', function() {
		var headers = Link.headerer();
		headers.addLink('http://grimwire.com/grim/app/help/about.js', 'http://grimwire.com/rels/src', { title:'application' });
		Link.responder(response).ok('html', headers).end([
			'<h1>grimwire <small>v0.0.0</small></h1>',
			'<p>Welcome to the grimwire environment, powered by <a target=_top href=//couchdb.apache.org>couchdb&nbsp;1.2</a>, <a target=_top href=//twitter.github.com/bootstrap>bootstrap&nbsp;2.2.2</a>, and <a target=_top href=/local/>local&nbsp;0.2.0</a>.</p>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Help',
	name     : 'About Grimwire',
	author   : 'pfraze',
	version  : 'v1'
});