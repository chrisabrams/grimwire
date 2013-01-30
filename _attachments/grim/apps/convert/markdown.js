importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
importScripts('/grim/apps/convert/lib/marked.js');

marked.setOptions({ gfm: true, tables: true });
function headerRewrite(headers) {
	headers['content-type'] = 'text/html';
	return headers;
}
function bodyRewrite(md) { return (md) ? marked(md) : ''; }

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			Link.responder(response).ok('html').end([
				'Markdown Converter, powered by marked.js (link :TODO:)',
				'interface :TODO:'
			].join(''));
		})
		.mpta('post', '/', /markdown/, /html/, function() {
			Link.responder(response).ok('html').end([
				'accept markdown string :TODO:'
			].join(''));
		})
		.mpta('post', '/', /json/, /html/, function() {
			if (!request.body || !request.body.url) {
				return Link.responder(response).badRequest('html').end('request body: `url` is required');
			}
			var mdRequest = Link.dispatch({
				method  : 'get',
				url     : request.body.url,
				headers : { accept:'text/plain' }
			});
			Link.responder(response).pipe(mdRequest, headerRewrite, bodyRewrite);
		})
		.error(response);
});
app.postMessage('loaded', {
	category : 'Convert',
	name     : 'Markdown',
	author   : 'pfraze',
	version  : 'v1'
});