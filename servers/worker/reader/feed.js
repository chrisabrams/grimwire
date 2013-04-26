// setup config
var defaultSources = [
	'httpl://rssproxy.rss.usr?url=http://lambda-the-ultimate.org/rss.xml',
	'httpl://rssproxy.rss.usr?url=http://googleresearch.blogspot.co.uk/feeds/posts/default'
];

var feeds = null;
function getAllFeeds() {
	if (feeds)
		return local.promise(feeds);
	feeds = {};

	var sources = defaultSources; // :DEBUG:
	return local.promise.bundle(
		sources.map(function(url) {
			return local.http.dispatch({ method:'get', url:url, headers:{ accept:'application/json' }})
				.then(
					function(res) {
						feeds[url] = res.body;
						return res.body;
					},
					function() { return null; }
				);
		})
	).then(function() { return feeds; });
}

var mergedItems = null;
function mergeFeeds(feeds) {
	if (mergedItems)
		return mergedItems;
	mergedItems = []; var itemCount = 0;
	var insert = function(item) {
		item.date = new Date(item.date);
		for (var i=0; i < itemCount; i++) {
			if (item.date > mergedItems[i].date) {
				mergedItems.splice(i, 0, item);
				itemCount++;
				return;
			}
		}
		mergedItems.push(item);
		itemCount++;
	};
	for (var url in feeds)
		feeds[url].items.forEach(insert);
	return mergedItems;
}

function pad2(v) {
	if ((''+v).length === 2) return v;
	return '0'+v;
}
function formatDate(date) {
	return date.getFullYear()+'/'+pad2(date.getMonth()+1)+'/'+pad2(date.getDate())+' '+date.getHours()+':'+pad2(date.getMinutes())+':'+pad2(date.getSeconds());
}

function buildListInterface(items) {
	return [
		'<table class="table table-striped">',
			'<thead><tr><th>Source</th><th>Article</th><th>Published</th></tr></thead>',
			items.map(function(item, index) {
				return [
					'<tr>',
						'<td>',local.http.parseUri(item.link).host,'</td>',
						'<td><div id="item-',index,'"><a href="/',index,'/desc">',item.title,'</a></div></td>',
						'<td>',formatDate(item.date),'</td>',
					'</tr>'
				].join('');
			}).join(''),
		'</table>'
	].join('');
}

function main(request, response) {
	if (/^\/?$/.test(request.path) && /GET/i.test(request.method)) {
		return getAllFeeds()
			.then(mergeFeeds)
			.then(function(items) {
				response.writeHead(200, 'ok', {'content-type':'text/html'}).end(buildListInterface(items));
			});
	}
	var match = RegExp('^/([\\d]+)/(desc|link)/?','i').exec(request.path);
	if (match && /GET/i.test(request.method)) {
		return getAllFeeds()
			.then(mergeFeeds)
			.then(function(items) {
				var index = +(match[1]);
				var item = items[index];
				if (!item)
					return response.writeHead(404, 'not found').end();

				var replace = {};
				if (match[2] == 'link') {
					replace['#item-'+match[1]] = '<a href="/'+index+'/desc">'+item.title+'</a>';
					response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'}).end({ replace:replace });
				} else {
					replace['#item-'+match[1]] = [
						'<strong>',item.title,'</strong>',
						' (<a href="/',index,'/link">close</a>)',
						' <a href="',item.link,'" target="_blank">permalink</a>',
						'<br/>', item.description
					].join('');
					response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'}).end({ replace:replace });
				}
			});
	}
	response.writeHead(404, 'not found').end();
}