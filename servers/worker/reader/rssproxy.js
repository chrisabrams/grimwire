// we use yahoo pipes to deal with single-origin policy
// http://www.badlydrawntoy.com/2008/07/08/yahoo-pipes-and-jquery-same-origin-policy/
var yahooPipeId = local.worker.config.usr.yahooPipeId || local.worker.config.yahooPipeId || 'c2d940db8f6853ecebe1a522ba11ead5';
var yahooPipeTemplate = local.http.UriTemplate.parse('http://pipes.yahoo.com/pipes/pipe.run?_id='+yahooPipeId+'{&_render,url}');
function getFeed(url, format) {
	var opts = {
		url: encodeURIComponent(url),
		_render: format
	};
	return local.http.dispatch({ method:'get', url:yahooPipeTemplate.expand(opts) });
}
function getLink(item) {
	if (item['feedburner:origLink']) { return item['feedburner:origLink']; }
	if (item.link) { return item.link; }
}
function getDate(item) {
	if (item['y:published']) {
		var d = item['y:published'];
		return new Date(d.year, parseInt(d.month, 10) - 1, d.day, d.hour, d.minute, d.second);
	}
	if (item.published) { return new Date(item.published); }
	if (item.pubDate) { return new Date(item.pubDate); }
}
function normalizeSchema(res) {
	// Firefox has a bug that keeps it from enumerating its headers during CORs
	// This means that the HTTP layer didnt get a content-type, so the body hasnt been parsed
	// Go ahead and parse now with the assumption that it's json
	if (typeof res.body == 'string') {
		try { res.body = JSON.parse(res.body); } catch (e) {}
	}
	res.body.value.items.forEach(function(item) {
		item.link = getLink(item);
		item.date = getDate(item);
	});
	res.body = { items:res.body.value.items };
	return res;
}
function main(request, response) {
 if (request.path == '/.grim/config') {
		var msg = '';
		if (/POST/i.test(request.method)) {
			if (!request.body.yahooPipeId) {
				msg = '<div class="alert alert-error">All fields are required.</div>';
			} else {
				yahooPipeId = request.body.yahooPipeId;
				local.http.dispatch({
					method: 'patch',
					url: 'httpl://config.env/workers/'+local.worker.config.domain,
					body: { yahooPipeId:yahooPipeId },
					headers: { 'content-type':'application/json' }
				});
				msg = '<div class="alert alert-success" data-lifespan="5">Updated</div>';
			}
		}

		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end(
			'<form action="httpl://'+local.worker.config.domain+'/.grim/config" method="post">'+
				msg+
				'<label for="reader-rssproxy-sources">Yahoo Pipes ID</label>'+
				'<div class="controls"><input id="reader-rssproxy-sources" name="yahooPipeId" class="input-xxlarge" type="text" required value="'+yahooPipeId+'"></div>'+
				'<button class="btn">Submit</button>'+
			'</form>'
		);
	}
	else {
		setTimeout(function() {
			local.http.pipe(response, getFeed(request.query.url, 'json').then(normalizeSchema));
		}, Math.random() * 1000);
	}
}