// index/lunr.js
// ==============
// Clientside search with lunr.js
var lunr = require('vendor/lunr.min.js');

var docs = [];
var nDocs = 0;
var idx = lunr(function () {
	this.ref('__searchIndex');
	this.field('title', 10);
	this.field('href');
	this.field('tags', 100);
	this.field('desc');
});

if (local.worker.config.seed)
	local.worker.config.seed.forEach(addDoc);

function main(request, response) {
	if (/^\/?$/.test(request.path)) {
		if (/HEAD|GET/i.test(request.method))
			getInterface(request, response);
		else
			response.writeHead(405, 'bad method').end();
	}
	else if (/^\/docs\/?$/.test(request.path)) {
		if (/HEAD|GET/i.test(request.method))
			getDocuments(request, response);
		else if (/POST/i.test(request.method))
			addDocument(request, response);
		else
			response.writeHead(405, 'bad method').end();
	}
	else if (request.path == '/.grim/config') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end('Index Lunr TODO!');
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

	// :DEBUG: temporary show of function while refining layouts system
	var subset = docs;
	var subjectDesc = '';
	if (request.query.subject) {
		var q;
		switch (request.query.subject) {
			case 'apps':
				subjectDesc = ' Applications';
				q = 'app';
				break;
			case 'workers':
				subjectDesc = ' Workers';
				q = 'worker';
				break;
			case 'docs':
				subjectDesc = ' Documentation';
				q = 'doc';
				break;
			default:
				subjectDesc = ' '+request.query.subject;
				q = rqeuest.query.subject;
				break;
		}
		subset = getDocsByResultset(idx.search(q));
	}

	headers['content-type'] = 'text/html';
	response.writeHead(200, 'ok', headers).end([
		'<form class="form-inline" method="get" action="httpl://',local.worker.config.domain,'/docs" accept="application/html-deltas+json">',
			'<input type="text" placeholder="Search',subjectDesc,'..." class="input-xxlarge" name="q">',
			'&nbsp;&nbsp;<button type="submit" class="btn">Search</button>',
		'</form>',
		'<div id="search-results">',buildDocsHtml(subset),'</div>'
	].join(''));
}

function getDocuments(request, response) {
	var headers = {
		link:[
			{ rel:'up via service', href:'/' },
			{ rel:'self', href:'/docs' }
		]
	};

	if (/head/i.test(request.method))
		return response.writeHead(200, 'ok', headers).end();

	var docIds = (request.query.q) ? idx.search(request.query.q) : undefined;
	var subset = getDocsByResultset(docIds);

	if (/html-deltas/.test(request.headers.accept)) {
		headers['content-type'] = 'application/html-deltas+json';
		response.writeHead(200, 'ok', headers).end({ replace:{ '#search-results':buildDocsHtml(subset) }});
	} else if (/html/.test(request.headers.accept)) {
		headers['content-type'] = 'text/html';
		response.writeHead(200, 'ok', headers).end(buildDocsHtml(subset));
	} else {
		headers['content-type'] = 'application/json';
		response.writeHead(200, 'ok', headers).end(subset);
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

	var results = [];
	for (var i=0,ii=docs.length; i < ii; i++) {
		var doc = docs[i];
		if (!doc.title) { results.push('Error: request body `title` required'); continue; }
		if (!doc.href) { results.push('Error: request body `href` required'); continue; }
		if (!doc.desc) { results.push('Error: request body `desc` required'); continue; }
		results.push(addDoc(doc));
	}

	headers['content-type'] = 'application/json';
	response.writeHead(200, 'ok', headers).end(results);
}

function addDoc(doc) {
	doc.__searchIndex = nDocs;
	docs.push(doc);
	idx.add(doc);
	nDocs++;
	return doc.__searchIndex;
}

function getDocsByResultset(resultset) {
	if (!resultset)
		return docs;
	var subset = [];
	for (var i=0, ii=resultset.length; i < ii; i++) {
		if (docs[resultset[i].ref])
			subset.push(docs[resultset[i].ref]);
	}
	return subset;
}

function buildDocsHtml(docs) {
	var html = [];
	html.push([
		'<table class="table table-striped">',
			docs.map(function(doc) {
				var target = '';
				if (doc.target == '_top')
					target = 'target="_top"';
				return '<tr><td><a href="'+doc.href+'" '+target+'>'+doc.title+'</a> <span>'+doc.desc+'</span></td></tr>';
			}).join(''),
		'</table>',
		'<div id="search-results"></div>'
	].join(''));
	return html;
}