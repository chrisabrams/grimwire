// index/lunr.js
// ==============
// Search index with lunr.js
var lunr = require('vendor/lunr.min.js');


// Setup
// -
var indexBroadcast = local.http.broadcaster(); // notifies of new entries in the index

// init index
var indexedCategories = []; // a list of categories in the current documentset
var indexedDocs = {}; // a map of document href -> documents
var idx = lunr(function () {
	this.ref('href');
	this.field('title', 10);
	this.field('href');
	this.field('desc');
});

// listen for new applications
var indexSources = {}; // a map of sources -> event streams
var indexSourcesDocs = {}; // tracks the ids of documents from each source
local.http.subscribe('httpl://config.env/apps').on('update', updateSources);
updateSources();


// Request Handling
// -

function main(request, response) {
	if (request.path == '/') {
		if (/HEAD|GET/i.test(request.method))
			getInterface(request, response);
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

	if (/(text\/html|html-deltas|event-stream)/.test(request.headers.accept) === false)
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
	} else if (/event-stream/.test(request.headers.accept)) {
		local.http.resheader(response, 'content-type', 'text/event-stream');
		response.writeHead(200, 'ok');
		indexBroadcast.addStream(response);
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

// gets the current applications in the environment and syncs the current sources to include what's active
function updateSources() {
	local.http.dispatch({ url:'httpl://config.env/apps', headers:{ accept:'application/json' }}).then(
		function(res) {
			var cfgs = res.body;
			// add new
			var sourceUrls = [], url;
			for (var appId in cfgs) {
				if (!cfgs[appId]._active || appId == local.worker.config.appId)
					continue;
				url = cfgs[appId].startpage;
				addSource(url);
				sourceUrls.push(url);
			}
			// remove no-longer-present
			for (url in indexSources) {
				if (sourceUrls.indexOf(url) === -1)
					removeSource(url);
			}
		},
		function(res) {
			console.log('Failed to fetch active applications from config.env', res);
		}
	);
}

function addSource(sourceUrl) {
	if (sourceUrl in indexSources)
		return;
	resolveSourceIndex(sourceUrl).succeed(function(indexUrl) {
		// connect event-stream
		indexSources[sourceUrl] = local.http.subscribe(indexUrl);
		indexSources[sourceUrl].on('update', function() { getSourceDocuments(sourceUrl, indexUrl); });
		// fetch documents
		indexSourcesDocs[sourceUrl] = [];
		getSourceDocuments(sourceUrl, indexUrl);
	});
}

function removeSource(sourceUrl) {
	if (!(sourceUrl in indexSources))
		return;
	// destroy stream
	indexSources[sourceUrl].close();
	delete indexSources[sourceUrl];
	// remove documents
	var doc = { href:null };
	indexSourcesDocs[sourceUrl].forEach(function (href) {
		doc.href = href;
		idx.remove(doc);
		delete indexedDocs[href];
	});
	delete indexSourcesDocs[sourceUrl];
}

function resolveSourceIndex(sourceUrl) {
	return local.http.navigator(sourceUrl).relation('http://grimwire.com/rel/searchables').resolve();
}

function getSourceDocuments(sourceUrl, indexUrl) {
	local.http.dispatch({ url:indexUrl, headers:{ accept:'application/json' }}).then(
		function(res) {
			if (res.body && Array.isArray(res.body)) {
				res.body.forEach(function(doc) {
					if (indexSourcesDocs[sourceUrl].indexOf(doc.href) != -1)
						return; // dont add twice
					addDoc(doc);
					indexSourcesDocs[sourceUrl].push(doc.href);
				});
				indexBroadcast.emit('update');
			}
		},
		function() {
			// source doesnt export searchables
			removeSource(url);
		}
	);
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
			'<form class="form-inline" method="get" action="httpl://',local.worker.config.domain,'" accept="application/html-deltas+json" data-subscribe="httpl://',local.worker.config.domain,'">',
				'<input type="text" placeholder="',searchPlaceholder,'..." class="input-xxlarge" name="q" value="'+(request.query.q||'')+'" />',
				'<input type="hidden" name="filter" value="'+(request.query.filter||'')+'" />',
				'<input type="hidden" name="columns" value="'+(request.query.columns||'')+'" />',
				'&nbsp;&nbsp;<button type="submit" class="btn">Search</button>',
			'</form>',
			'<div id="search-results">',views.docs(request, resultSet),'</div>'
		].join('');
	}
};