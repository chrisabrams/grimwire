// index/lunr.js
// ==============
// Search index with lunr.js
var lunr = require('vendor/lunr.min.js');

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

function main(request, response) {
	if (/^\/?$/.test(request.path)) {
		buildIndexPromise.succeed(function() {
			if (/HEAD|GET/i.test(request.method))
				getInterface(request, response);
			else
				response.writeHead(405, 'bad method').end();
		});
	}
	else if (request.path == '/docs') {
		buildIndexPromise.succeed(function() {
			if (request.method == 'POST')
				addDocument(request, response);
			else
				response.writeHead(405, 'bad method').end();
		});
	}
	else if (request.path == '/filters') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end(buildFiltersHtml());
	}
	else if (request.path == '/.grim/config') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end('<span class="muted">No configuration needed.</span>');
	}
	else
		response.writeHead(404, 'not found').end();
}

function getInterface(request, response) {
	var headers = {
		link:[
			{ rel:'self', href:'/' },
			{ rel:'collection', href:'/docs', title:'docs' }
		]
	};

	if (/head/i.test(request.method))
		return response.writeHead(200, 'ok', headers).end();

	var searchPlaceholder = (request.query.filter) ? 'Search '+request.query.filter : 'Search';
	var resultSet = (request.query.q) ?
		idx.search(request.query.q).map(function(hit) { return hit.ref; }) :
		Object.keys(indexedDocs);

	if (/html-deltas/.test(request.headers.accept)) {
		headers['content-type'] = 'application/html-deltas+json';
		response.writeHead(200, 'ok', headers).end({
			replace: { '#search-results': buildDocsHtml(resultSet, request.query.filter) }
		});
	} else {
		headers['content-type'] = 'text/html';
		response.writeHead(200, 'ok', headers).end([
			'<form class="form-inline" method="get" action="httpl://',local.worker.config.domain,'" accept="application/html-deltas+json">',
				'<input type="text" placeholder="',searchPlaceholder,'..." class="input-xxlarge" name="q" value="'+(request.query.q||'')+'" />',
				'<input type="hidden" name="filter" value="'+(request.query.filter||'')+'" />',
				'&nbsp;&nbsp;<button type="submit" class="btn">Search</button>',
			'</form>',
			'<div id="search-results">',buildDocsHtml(resultSet, request.query.filter),'</div>'
		].join(''));
	}
}

function addDocument(request, response) {
	if (/form|json/.test(request.headers['content-type']) === false)
		return response.writeHead(415, 'bad content type').end();

	var headers = {
		link:[
			{ rel:'up via service', href:'/' },
			{ rel:'self', href:'/docs' }
		]
	};

	var docs = request.body;
	if (!docs)
		return response.writeHead(422, 'bad request body', headers).end('request body required');
	if (Array.isArray(docs) === false)
		docs = [docs];

	// :TODO: this is out of date
	var results = [];
	for (var i=0,ii=docs.length; i < ii; i++) {
		var doc = docs[i];
		if (!doc.title) { results.push('Error: request body `title` required'); continue; }
		if (!doc.href) { results.push('Error: request body `href` required'); continue; }
		results.push(addDoc(doc));
	}

	headers['content-type'] = 'application/json';
	response.writeHead(200, 'ok', headers).end(results);
}

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

function getDocsByIds(docIds) {
	return docIds.map(function(id) { return indexedDocs[id]; }).filter(function(doc) { return !!doc; });
}

function buildFiltersHtml() {
	var html = '<li class="active"><a href="httpl://lunr.index.usr/" target="main" data-toggle="nav">Everything</a></li>';
	indexedCategories.forEach(function(cat) {
		html += '<li><a href="httpl://lunr.index.usr/?filter='+encodeURI(cat)+'" target="main" data-toggle="nav">'+cat+'</a></li>';
	});
	return '<ul class="nav nav-pills nav-stacked">'+html+'</ul>';
}

function buildDocsHtml(docIds, categoryFilter) {
	var html = [];
	html.push([
		'<table class="table">',
			docIds
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
		'</table>',
		'<div id="search-results"></div>'
	].join(''));
	return html;
}