// setup config
var feedSources =
	local.worker.config.usr.sources ||
	local.worker.config.sources ||
	[
		'http://lambda-the-ultimate.org/rss.xml',
		'http://googleresearch.blogspot.co.uk/feeds/posts/default'
	];

var feeds = null;
function getAllFeeds() {
	if (feeds)
		return local.promise(feeds);
	feeds = {};

	return local.promise.bundle(
		feedSources.map(function(url) {
			return local.http.dispatch({ method:'get', url:'httpl://rssproxy.rss.usr?url='+url, headers:{ accept:'application/json' }})
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

function buildListInterface(items) {
	return [
		'<table class="table">',
			'<thead><tr><th width=220>Source</th><th>Article</th><th width=220>Published</th></tr></thead>',
			items.map(function(item, index) {
				return [
					'<tr>',
						'<td class="muted" style="padding:20px 10px">',local.http.parseUri(item.link).host,'</td>',
						'<td style="padding:20px 10px"><div id="item-',index,'"><a href="/',index,'/desc">',item.title,'</a></div></td>',
						'<td style="padding:20px 10px">',formatDate(item.date),'</td>',
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
						'<p><a href="/',index,'/link"><strong style="text-decoration:underline">',item.title,'</strong></a>',
						' <a href="',item.link,'" target="_blank">permalink</a></p>',
						item.description
					].join('');
					response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'}).end({ replace:replace });
				}
			});
	}
	if (request.path == '/.grim/config') {
		var msg = '';
		if (/POST/i.test(request.method)) {
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