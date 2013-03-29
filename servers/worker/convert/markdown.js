importScripts('lib/local/linkjs-ext/responder.js');
importScripts('lib/local/linkjs-ext/router.js');
importScripts('servers/worker/convert/lib/marked.js');

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

local.onHttpRequest(function(request, response) {
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
                    '<form action="httpl://v1.pfraze.markdown.convert.app/" method="POST">',
					'<legend>Markdown Converter</legend>',
                    '<p class="muted">powered by marked.js (by Christopher Jeffrey)</p>',
					'<p><textarea name="text" class="input-block-level" rows="10"></textarea></p>',
                    '<p><input type="submit" class="btn" draggable="true" /></p>',
                    '</form>'
				].join(''));
			}
		})
        .mpta('post', '/', /form|json/, /html/, function() {
            if (!request.body.text)
                Link.responder(response).unprocessableEntity('html', stdHeaders).end('`text` is required');
            else
                Link.responder(response).ok('html', stdHeaders).end(marked(request.body.text));
        })
		.mpta('post', '/', /markdown/, /html/, function() {
			Link.responder(response).ok('html', stdHeaders).end(marked(request.body));
		})
		.error(response);
});
local.postMessage('loaded', {
	category : 'Convert',
	name     : 'Markdown',
	author   : 'pfraze',
	version  : 'v1'
});