// index/lunr.js
// ==============
// Search index with lunr.js
var lunr = require('vendor/lunr.min.js');


// Setup
// -

var indexSources =
	local.worker.config.usr.sources ||
	local.worker.config.sources ||
	[
		'httpl://config.env/apps?schema=grimsearch',
		'httpl://feed.rss.usr/items?schema=grimsearch'
	];

// init index
var indexedCategories = [];
var indexedDocs = {};
var idx = lunr(function () {
	this.ref('href');
	this.field('title', 10);
	this.field('href');
	this.field('desc');
});

// read sources and populate index
var buildIndexPromise = local.promise.bundle(
	indexSources.map(function(url) {
		return local.http.dispatch({ method:'get', url:url, headers:{ accept:'application/json' }})
			.then(function(res) { return res.body; }, function() { return []; });
	})
);
buildIndexPromise.succeed(function(sourcesDocs) {
	sourcesDocs.forEach(function(sourceDocs) { sourceDocs.forEach(addDoc); });
});

// subscribe to sources for updates
indexSources.forEach(function(url) {
	var channel = local.http.subscribe(url);
	channel.on('update', function() {
		local.http.dispatch({ method:'get', url:url, headers:{ accept:'application/json' }})
			.then(function(res) { return res.body; }, function() { return []; })
			.succeed(function(docs) {
				docs.forEach(addDoc);
			});
	});
});


// Request Handling
// -

function main(request, response) {
	if (request.path == '/') {
		if (/HEAD|GET/i.test(request.method))
			buildIndexPromise.always(function() { getInterface(request, response); });
		else response.writeHead(405, 'bad method').end();
	}
	else if (request.path == '/.grim/config') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end('<span class="muted">No configuration needed.</span>');
	}
	else response.writeHead(404, 'not found').end();
}

function getInterface(request, response) {
	local.http.resheader(response, 'link', { rel:'self', href:'/' });

	if (request.method == 'HEAD')
		return response.writeHead(200, 'ok').end();

	if (/(text\/html|html-deltas)/.test(request.headers.accept) === false)
		return response.writeHead(406, 'bad accept').end();

	var resultSet = (request.query.q) ?
		idx.search(request.query.q).map(function(hit) { return hit.ref; }) :
		Object.keys(indexedDocs);

	if (/html-deltas/.test(request.headers.accept)) {
		local.http.resheader(response, 'content-type', 'application/html-deltas+json');
		response.writeHead(200, 'ok').end({
			replace: {
				'#search-results': views.docs(request, resultSet),
				'#search-filters': views.filtersNav(request),
				'#search-filterbtn': views.filtersButton(request)
			}
		});
	} else {
		var html;
		if (request.query.columns == 1) {
			html = (
				'<p id="search-filterbtn">'+views.filtersButton(request)+'</p>'+
				'<div>'+views.interface(request, resultSet)+'</div>'
			);
		}
		else {
			html = (
				'<p id="search-filterbtn">'+views.filtersButton(request)+'</p>'+
				'<div class="row-fluid">'+
					'<div class="span2" id="search-filters">'+views.filtersNav(request)+'</div>'+
					'<div class="span10">'+views.interface(request, resultSet)+'</div>'+
				'</div>'
			);
		}
		local.http.resheader(response, 'content-type', 'text/html');
		response.writeHead(200, 'ok').end(html);
	}
}


// Helpers
// -

function addDoc(doc) {
	if (!doc || !doc.title || !doc.href) {
		console.log('Skipped invalid document - `title` and `href` are required', JSON.stringify(doc));
		return;
	}

	indexedDocs[doc.href] = doc;
	idx.add(doc);
	if (doc.category && indexedCategories.indexOf(doc.category) === -1)
		indexedCategories.push(doc.category);
}


// Views
// -

var views = {
	filtersButton: function(request) {
		var query = encodeURIComponent(request.query.q || '');
		var filter = encodeURIComponent(request.query.filter || '');
		var ncolumns = (request.query.columns == 1) ? 2 : 1;
		var active = (request.query.columns != 1) ? 'active' : '';
		return '<a class="btn btn-mini '+active+'" href="httpl://'+local.worker.config.domain+'?columns='+ncolumns+'&filter='+filter+'&q='+query+'">Filters</a>';
	},
	filtersNav: function(request) {
		var query = encodeURIComponent(request.query.q || '');
		var filter = request.query.filter;
		var html = '<li '+((!filter)?'class="active"':'')+'><a href="httpl://lunr.index.usr/?q='+query+'">Everything</a></li>';
		indexedCategories.forEach(function(cat) {
			html += '<li '+((filter==cat)?'class="active"':'')+'><a href="httpl://lunr.index.usr/?q='+query+'&filter='+encodeURIComponent(cat)+'">'+cat+'</a></li>';
		});
		return '<ul class="nav nav-pills nav-stacked">'+html+'</ul>';
	},
	docs: function(request, resultSet) {
		var categoryFilter = request.query.filter;
		var html = [];
		html.push([
			'<table class="table">',
				resultSet
					.map(function(id) { return indexedDocs[id]; })
					.filter(function(doc) {
						if (!doc) return false;
						if (categoryFilter && doc.category != categoryFilter) return false;
						return true;
					})
					.map(function(doc) {
						if (!doc) return '';
						var icon = (doc.icon) ? '<i class="icon-'+doc.icon+'" style="padding-right:2px"></i> ' : '';
						var target = (doc.target == '_top' || doc.target == '_blank') ? 'target="'+doc.target+'"' : '';
						return '<tr><td style="padding:20px">'+
								'<p>'+icon+'<a href="'+doc.href+'" '+target+'>'+doc.title+'</a><br/>'+
								'<span class="muted">'+doc.href+'</span></p>'+
								doc.desc+
							'</td></tr>';
					})
					.join(''),
			'</table>'
		].join(''));
		return html;
	},
	interface: function(request, resultSet) {
		var searchPlaceholder = (request.query.filter) ? 'Search '+request.query.filter : 'Search';
		return [
			'<form class="form-inline" method="get" action="httpl://',local.worker.config.domain,'" accept="application/html-deltas+json">',
				'<input type="text" placeholder="',searchPlaceholder,'..." class="input-xxlarge" name="q" value="'+(request.query.q||'')+'" />',
				'<input type="hidden" name="filter" value="'+(request.query.filter||'')+'" />',
				'<input type="hidden" name="columns" value="'+(request.query.columns||'')+'" />',
				'&nbsp;&nbsp;<button type="submit" class="btn">Search</button>',
			'</form>',
			'<div id="search-results">',views.docs(request, resultSet),'</div>'
		].join('');
	}
};