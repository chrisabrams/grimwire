/***
 * KEYP - Key Extraction Y Proxy
 * takes an object from another source and extracts a given path
 ***/

importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');
app.onHttpRequest(function(request, response) {
	Link.router(request).mp('get', '/', function() {
		var path = (request.query.path || '').split(request.query.separator || '.');
		var proxyRequest = Link.dispatch({
			method  : 'get',
			url     : request.query.url,
			headers : { accept:'application/json' }
		});
		Link.responder(response).pipe(proxyRequest,
			function(headers) {
				headers = Link.headerer(headers);
				headers.addLink('http://grimwire.com/grim/app/util/keyp.js', 'http://grimwire.com/rels/src', { title:'application' });
				headers['content-type'] = request.headers.accept;
				return headers;
			},
			function(body) {
				return followPath(path, (body && typeof body == 'object') ? body : {});
			}
		);
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Util',
	name     : 'Keyp',
	author   : 'pfraze',
	version  : 'v1'
});
function followPath(path, object) {
	if (path.length === 0) return object;
	return (object) ? followPath(path.slice(1), object[path[0]]) : {};
}