importScripts('lib/local/linkjs-ext/responder.js');

// we use yahoo pipes to deal with single-origin policy
// http://www.badlydrawntoy.com/2008/07/08/yahoo-pipes-and-jquery-same-origin-policy/
var yahooPipeTemplate = Link.UriTemplate.parse('http://pipes.yahoo.com/pipes/pipe.run?_id=c2d940db8f6853ecebe1a522ba11ead5{&_render,url}');
function getFeed(url, format) {
	var opts = {
		url: encodeURIComponent(url),
		_render: format
	};
	return Link.dispatch({ method:'get', url:yahooPipeTemplate.expand(opts) });
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
localApp.onHttpRequest(function(request, response) {
	Link.responder(response).pipe(getFeed(request.query.url, 'json').then(normalizeSchema));
});