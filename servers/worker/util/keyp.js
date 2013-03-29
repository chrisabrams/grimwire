/***
 * KEYP - Key Extraction Y Proxy
 * takes an object from another source and extracts a given path
 ***/

importScripts('lib/local/linkjs-ext/responder.js');
importScripts('lib/local/linkjs-ext/router.js');
local.onHttpRequest(function(request, response) {
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
function followPath(path, object) {
	if (path.length === 0) return object;
	return (object) ? followPath(path.slice(1), object[path[0]]) : {};
}