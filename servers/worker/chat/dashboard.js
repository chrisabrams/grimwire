// Dashboard.js
// ============
// kai's default control-suite

importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

var urls = {
	app: 'httpl://'+local.config.domain,
	formatter: 'httpl://'+local.config.domain+'/formatter',
	profile: 'httpl://'+local.config.domain+'/profile'
};

local.onHttpRequest(function(request, response) {
	Link.router(request)
		.p('/', function() {
			var headers = Link.headerer();
			headers.addLink(urls.app, 'self');
			headers.addLink(urls.formatter, 'service', { title:'formatter' });
			headers.addLink(urls.profile, 'service', { title:'profile' });
			if (/head/i.test(request.method))
				Link.responder(response).ok(null, headers).end();
			else
				Link.responder(response).ok('html', headers).end([
					'<a href="',urls.profile,'">Update Profile</a>'
				].join(''));
		})
		.pm('/formatter', /post|head/i, function() {
			var headers = Link.headerer();
			headers.addLink(urls.app, 'up');
			headers.addLink(urls.formatter, 'self');

			if (/head/i.test(request.method))
				return Link.responder(response).ok(null, headers).end();

			Link.router(request).pmta('/formatter', /post/i, /text/, /html/, function() {
				promise(request.body || '')
					.then(replaceURLWithHTMLLinks)
					.then(addBrToNewlines)
					.then(quickStrong)
					.then(quickEm)
					.then(quickStrike)
					.then(function(text) {
						Link.responder(response).ok('html', headers).end(text);
					});
			}).error(response);
		})
		.pm('/profile', /get|head/i, function() {
			var headers = Link.headerer();
			headers.addLink(urls.app, 'up');
			headers.addLink(urls.profile, 'self');

			if (/head/i.test(request.method))
				return Link.responder(response).ok(null, headers).end();

			Link.router(request).pma('/profile', /get/i, /html/, function() {
				Link.responder(response).ok('html').end([
					'<form class="form-inline" action="httpl://session" method="post" target="-self">',
						'<label>Identify yourself, user &nbsp;',
							'<input type="text" name="username" placeholder="anon" />',
							'<input type="submit" class="btn" />',
						'</label>',
					'</form>'
				].join(''));
			}).error(response);
		})
		.error(response);
});
local.postMessage('loaded');

// thanks to Sam Hasler and Peter Mortensen
// http://stackoverflow.com/a/37687
var replaceURLWithHTMLLinksRE = /(\b(https?|ftp|file):\/\/[\-A-Z0-9+&@#\/%?=~_|!:,.;]*[\-A-Z0-9+&@#\/%=~_|])/ig;
function replaceURLWithHTMLLinks(text) {
	return text.replace(replaceURLWithHTMLLinksRE, '<a href="$1">$1</a>');
}
var addBrToNewlinesRE = /\n/ig;
function addBrToNewlines(text) {
	return text.replace(addBrToNewlinesRE, "<br/>\n");
}
var quickStrongRE = /\*\*(.*)\*\*/ig;
function quickStrong(text) {
	return text.replace(quickStrongRE, '<strong>$1</strong>');
}
var quickEmRE = /\*(.*)\*/ig;
function quickEm(text) {
	return text.replace(quickEmRE, '<em>$1</em>');
}
var quickStrikeRE = /\-\-(.*)\-\-/ig;
function quickStrike(text) {
	return text.replace(quickStrikeRE, '<strike>$1</strike>');
}