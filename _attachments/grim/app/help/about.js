importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

var docUrl = 'http://grimwire.com/grim/doc/';
app.onHttpRequest(function(request, response) {
	Link.router(request).mp('get', '/', function() {
		var headers = Link.headerer();
		headers.addLink('http://grimwire.com/grim/app/help/about.js', 'http://grimwire.com/rels/src', { title:'application' });
		Link.responder(response).ok('html', headers).end([
			'<h1 style="margin-top:0">grimwire <small>v0.0.0</small></h1>',
			'<p>Welcome to grimwire, the in-browser online operating system and social computing network. ',
			'Powered by <a target=_top href=//couchdb.apache.org>couchdb&nbsp;1.2</a>, ',
			'<a target=_top href=//twitter.github.com/bootstrap>bootstrap&nbsp;2.2.2</a>, ',
			'and <a target=_top href=/local/>local&nbsp;0.2.0</a>.</p>',
			'<ul>',
				'<li><a href="httpl://v1.pfraze.markdown.convert.app/?url=',docUrl,'intro.md" target="-below">An Introduction</li>',
				'<li><a href="httpl://v1.pfraze.markdown.convert.app/?url=',docUrl,'background.md" target="-below">Technical Background</li>',
				'<li><a href="httpl://v1.pfraze.markdown.convert.app/?url=',docUrl,'overview.md" target="-below">Project Overview</li>',
				'<li><a href="httpl://v1.pfraze.markdown.convert.app/?url=',docUrl,'architecture.md" target="-below">The HTTPLocal Architecture</li>',
				'<li><a href="httpl://v1.pfraze.markdown.convert.app/?url=',docUrl,'plans.md" target="-below">Project Status and Plans</li>',
			'</ul>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	author   : 'pfraze',
	name     : 'About Grimwire',
	category : 'Help',
	version  : 'v1'
});