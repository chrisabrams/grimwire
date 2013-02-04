importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
importScripts('/grim/app/convert/lib/marked.js');

// we use the same headers every time
var stdHeaders = Link.headerer();
stdHeaders.addLink('http://grimwire.com/grim/app/convert/markdown.js', 'http://grimwire.com/rels/src', { title:'application' });

marked.setOptions({ gfm: true, tables: true });
function headerRewrite(headers) {
	headers['content-type'] = 'text/html';
	headers.link = stdHeaders.link;
	return headers;
}
function bodyRewrite(md) { return (md) ? marked(md) : ''; }

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			if (request.query.url) {
				var mdRequest = Link.dispatch({
					method  : 'get',
					url     : request.query.url,
					headers : { accept:'text/plain' }
				});
				Link.responder(response).pipe(mdRequest, headerRewrite, bodyRewrite);
			} else {
				Link.responder(response).ok('html', stdHeaders).end([
					'Markdown Converter, powered by marked.js (link :TODO:)',
					'interface :TODO:'
				].join(''));
			}
		})
		.mpta('post', '/', /markdown/, /html/, function() {
			Link.responder(response).ok('html', stdHeaders).end([
				'accept markdown string :TODO:'
			].join(''));
		})
		.error(response);
});
app.postMessage('loaded', {
	category : 'Convert',
	name     : 'Markdown',
	author   : 'pfraze',
	version  : 'v1'
});