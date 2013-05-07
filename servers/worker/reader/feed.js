// setup config
var feedSources =
	local.worker.config.usr.sources ||
	local.worker.config.sources ||
	[
		'http://lambda-the-ultimate.org/rss.xml',
		'http://googleresearch.blogspot.co.uk/feeds/posts/default',
		'http://pfraze.blogspot.com/feeds/posts/default'
	];

// feed data
var feeds = null;
var cachedItems = [], nCachedItems=0;
var feedBroadcast = local.http.broadcaster();

function getAllFeeds() {
	if (feeds)
		return local.promise(feeds);
	feeds = {};

	return local.promise.bundle(
		feedSources.map(function(url) {
			feeds[url] = null; // set the key, for progress-tracking
			var getUrl = url;
			if (getUrl.indexOf('httpl') === -1)
				getUrl = 'httpl://rssproxy.rss.usr?url='+url; // use the proxy on remote urls (solves CORS)
			return local.http.dispatch({ method:'get', url:getUrl, headers:{ accept:'application/json' }})
				.then(
					function(res) {
						feeds[url] = res.body;
						mergeFeedIntoCache(url);
						feedBroadcast.emit('update');
						return res.body;
					},
					function() { return null; }
				);
		})
	).then(function() { return feeds; });
}

function getFetchProgress() {
	if (!feeds) { return 100; }
	var nFetched=0, nFeeds=0;
	for (var k in feeds) {
		if (feeds[k]) nFetched++;
		nFeeds++;
	}
	var prog = Math.round((nFetched / nFeeds) * 100);
	if (prog === 0) prog = 5; // so we have something to look at
	return prog;
}

function mergeFeedIntoCache(feedUrl) {
	var insert = function(item) {
		item.date = new Date(item.date);
		for (var i=0; i < nCachedItems; i++) {
			if (item.date > cachedItems[i].date) {
				cachedItems.splice(i, 0, item);
				nCachedItems++;
				return;
			}
		}
		cachedItems.push(item);
		nCachedItems++;
	};
	feeds[feedUrl].items.forEach(insert);
	return cachedItems;
}

function clearCache() {
	feeds = null;
	cachedItems = [];
	nCachedItems = 0;
}

function pad2(v) {
	if ((''+v).length === 2) return v;
	return '0'+v;
}
function to12hr(hours) {
	if (hours > 12)
		return hours - 12;
	if (hours === 0)
		return 12;
	return hours;
}
function AMPM(hours) {
	if (hours >= 12)
		return 'pm';
	return 'am';
}
var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function toMonth(month, abbrev) {
	month = MONTHS[month] || '';
	if (abbrev)
		return month.slice(0,3);
	return month;
}
var TODAY = new Date();
function formatDate(date) {
	var d = toMonth(date.getMonth())+' '+pad2(date.getDate());
	if (date.getYear() != TODAY.getYear()) {
		d += ' '+date.getFullYear();
	}
	d += ' <span class="muted">'+to12hr(date.getHours())+':'+pad2(date.getMinutes())+AMPM(date.getHours())+'</span>';
	return d;
}

function buildFetchProgressbar() {
	var progress = getFetchProgress();
	if (progress == 100)
		return '<div style="height:40px">&nbsp;</div>';
	return '<div class="progress progress-striped active" style="width:40%"><div class="bar" style="width: '+progress+'%;"></div></div>';
}

function buildFeedInterface() {
	return '<thead><tr><th width=220>Source</th><th>Article</th><th width=220>Published</th></tr></thead>'+
		cachedItems.map(function(item, index) {
			return [
				'<tr>',
					'<td class="muted" style="padding:20px 10px">',local.http.parseUri(item.link).host,'</td>',
					'<td style="padding:20px 10px"><div id="item-',index,'"><a href="/items/',index,'/desc?deltas=1">',item.title,'</a></div></td>',
					'<td style="padding:20px 10px">',formatDate(item.date),'</td>',
				'</tr>'
			].join('');
		}).join('');
}

function buildMainInterface() {
	return [
		'<div id="grimreader-app" data-subscribe="httpl://',local.worker.config.domain,'/items">',
			'<div class="btn-group pull-right">',
				'<a class="btn btn-small" title="refresh" href="/?refresh=1"><i class="icon-refresh"></i> Refresh</a>',
			'</div>',
			'<div id="fetchprogress">',buildFetchProgressbar(),'</div>',
			'<table class="table">',
				buildFeedInterface(),
			'</table>',
		'</div>'
	].join('');
}

function main(request, response) {
	if (/HEAD|GET/.test(request.method) && request.path == '/') {
		response.setHeader('link', [
			{ rel:'self', href:'/' },
			{ rel:'collection', href:'/items', title:'items' },
			{ rel:'http://grimwire.com/rel/index', href:'/items?schema=grimsearch' }
		]);
		if (request.query.refresh)
			clearCache();
		getAllFeeds(); // initiate the fetch, but send down the interface now
		// ^ will broadcast updates to the interface
		response.writeHead(200, 'ok', {'content-type':'text/html'}).end(buildMainInterface());
		return;
	}
	if (/HEAD|GET/.test(request.method) && request.path == '/items') {
		response.setHeader('link', [
			{ rel:'self', href:'/items' },
			{ rel:'up via', href:'/' }
		]);
		if (/event-stream/.test(request.headers.accept)) {
			feedBroadcast.addStream(response);
			response.writeHead(200, 'ok', {'content-type':'text/event-stream'});
		} else if (/application\/json/.test(request.headers.accept)) {
			response.writeHead(200, 'ok', {'content-type':'application/json'});
			if (request.query.schema == 'grimsearch') {
				var docs = [];
				cachedItems.forEach(function(item, index) {
					docs.push({
						icon: 'list',
						category: 'Blog Posts',
						title: item.title,
						desc: item.content,
						href: item.link,
						target: '_blank'
					});
				});
				response.end(docs);
			} else {
				response.end(cachedItems);
			}
		} else {
			response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'}).end({
				replace: {
					'#grimreader-app > table': buildFeedInterface(),
					'#fetchprogress': buildFetchProgressbar()
				}
			});
		}
		return;
	}
	var match = RegExp('^/items/([\\d]+)/(desc|link)/?','i').exec(request.path);
	if (match && request.method == 'GET') {
		response.setHeader('link', [
			{ rel:'self', href:request.path },
			{ rel:'up', href:'/items' },
			{ rel:'via', href:'/' }
		]);

		var index = +(match[1]);
		var item = cachedItems[index];
		if (!item)
			return response.writeHead(404, 'not found').end();

		var html;
		var deltas = (request.query.deltas) ? '?deltas=1' : '';
		if (match[2] == 'link')
			html = '<a href="/items/'+index+'/desc'+deltas+'">'+item.title+'</a>';
		else {
			html = [
				'<p><a href="/items/',index,'/link'+deltas+'"><strong style="text-decoration:underline">',item.title,'</strong></a>',
				' <a href="',item.link,'" target="_blank">permalink</a></p>',
				item.content
			].join('');
		}

		if (request.query.deltas) {
			// html deltas
			var replace = {};
			replace['#item-'+index] = html;
			response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'}).end({ replace:replace });
		} else {
			// html
			response.writeHead(200, 'ok', {'content-type':'text/html'}).end(html);
		}
		return;
	}
	if (request.path == '/.grim/config') {
		var msg = '';
		if (request.method == 'POST') {
			feedSources = (request.body.sources && typeof request.body.sources == 'string') ?
				request.body.sources.split("\n").filter(function(i) { return i; }) :
				[];
			local.http.dispatch({
				method: 'put',
				url: 'httpl://config.env/workers/'+local.worker.config.domain,
				body: { sources:feedSources },
				headers: { 'content-type':'application/json' }
			});
			msg = '<div class="alert alert-success" data-lifespan="5">Updated</div>';
		}

		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end(
			'<form action="httpl://'+local.worker.config.domain+'/.grim/config" method="post">'+
				msg+
				'<label for="reader-feed-sources">Feed Sources</label>'+
				'<textarea id="reader-feed-sources" name="sources" rows="5" class="span8">'+
					feedSources.join("\n").replace(/</g,'&lt;').replace(/>/g,'&gt;')+
				'</textarea><br/>'+
				'<button class="btn">Submit</button>'+
			'</form>'
		);
		return;
	}
	response.writeHead(404, 'not found').end();
}