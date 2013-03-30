importScripts('lib/local/linkjs-ext/responder.js');
importScripts('lib/local/linkjs-ext/router.js');

// setup config
var defaultSources = [
	'httpl://rss.proxy?url=http://lambda-the-ultimate.org/rss.xml',
	'httpl://rss.proxy?url=http://googleresearch.blogspot.co.uk/feeds/posts/default'
].join("\n");

Link.navigator('httpl://config.env').collection('schemas').item('feed').put({
	sources : { type:'url', label:'Sources', fallback:defaultSources, control:'textarea' }
}, 'application/json');
var feedConfig = Link.navigator('httpl://config.env').collection('values').item('feed');

var feeds = null;
function getAllFeeds() {
	var p = promise();
	if (feeds) {
		p.fulfill(feeds);
		return p;
	}
	feeds = {};
	feedConfig.getJson().then(function(res) {
		var feedUrls = res.body.sources.split("\n");
		if (!Array.isArray(feedUrls) || feedUrls.length === 0)
			return p.fulfill({});

		var numFeedsFetched = 0;
		var inc = function() { if (++numFeedsFetched === feedUrls.length) { p.fulfill(feeds); } };
		feedUrls.forEach(function(url) {
			Link.navigator(url).getJson().then(function(res) {
				feeds[url] = res.body;
				inc();
			}).except(inc);
		});
	});
	return p;
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
		'<table class="table table-striped table-condensed">',
			'<thead><tr><th>Source</th><th>Article</th><th>Published</th></tr></thead>',
			items.map(function(item, index) {
				return [
					'<tr>',
						'<td>',Link.parseUri(item.link).host,'</td>',
						'<td><div id="item-',index,'"><a href="/',index,'/desc" target="item-',index,'">',item.title,'</a></div></td>',
						'<td>',formatDate(item.date),'</td>',
					'</tr>'
				].join('');
			}).join(''),
		'</table>'
	].join('');
}

local.onHttpRequest(function(request, response) {
	var router = Link.router(request);
	router.pma('/', /GET/i, /html/, function() {
		getAllFeeds()
			.then(mergeFeeds)
			.then(function(items) {
				Link.responder(response).ok('html').end(buildListInterface(items));
			});
	}).pma(RegExp('^/([\\d]+)/(desc|link)/?','i'), /GET/i, /html/, function(match) {
		getAllFeeds()
			.then(mergeFeeds)
			.then(function(items) {
				var index = +(match.path[1]);
				var item = items[index];
				if (!item)
					return Link.responder(response).notFound().end();
				
				var link;
				if (match.path[2] == 'link') {
					link = ['<a href="/',index,'/desc" target="item-',index,'">',item.title,'</a>'].join('');
					Link.responder(response).ok('html').end(link);
				} else {
					link = [
						'<strong>',item.title,'</strong>',
						' (<a href="/',index,'/link" target="item-',index,'">close</a>)',
						' <a href="',item.link,'" target="_blank">permalink</a>'
					].join('');
					Link.responder(response).ok('html').end(link + '<br/>' + item.description);
				}
			});
	}).error(response);
});