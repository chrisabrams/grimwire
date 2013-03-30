// index/lunr.js
// ==============
// Clientside search with lunr.js

importScripts('lib/lunr/lunr.min.js');
// importScripts('lib/local/linkjs-ext/broadcaster.js');
importScripts('lib/local/linkjs-ext/router.js');
importScripts('lib/local/linkjs-ext/responder.js');

function LunrServer(configService) {
	this.docs = [];
	this.nDocs = 0;
	this.idx = lunr(function () {
		this.ref('__searchIndex');
		this.field('title', 10);
		this.field('href');
		this.field('tags', 100);
		this.field('desc');
	});
}
LunrServer.prototype = Object.create(local.Server.prototype);

// request router
LunrServer.prototype.handleHttpRequest = function(request, response) {
	var self = this;
	var router = Link.router(request);
	router.pm ('/',     /HEAD/i,              this.handler('getInterface', request, response));
	router.pma('/',     /GET/i,  /html/,      this.handler('getInterface', request, response));
	router.pm ('/docs', /HEAD/i,              this.handler('getDocuments', request, response));
	router.pma('/docs', /GET/i,  /html|json/, this.handler('getDocuments', request, response));
	router.pmt('/docs', /POST/i, /json/,      this.handler('addDocument', request, response));
	router.error(response);
};

LunrServer.prototype.handler = function(handlerName, request, response) {
	var self = this;
	var handler = this[handlerName];
	return function(match) { handler.call(self, request, response, match); };
};

LunrServer.prototype.getInterface = function(request, response) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'self current');
	headerer.addLink('/docs', 'collection', { title:'docs' });
	
	if (/head/i.test(request.method))
		return Link.responder(response).ok(null, headerer).end();

	var html = [
		'<form class="form-search" method="get" action="httpl://',this.config.domain,'/docs" target="search-results">',
			'<input type="text" placeholder="Search..." class="input-xxlarge search-query" name="q">',
			'&nbsp;&nbsp;<button type="submit" class="btn">Search</button>',
		'</form>',
		'<div id="search-results">',this._buildDocsHtml(this.docs),'</div>'
	].join('');

	Link.responder(response).ok('html', headerer).end(html);
};

LunrServer.prototype.getDocuments = function(request, response) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/docs', 'self current');
	headerer.addLink('/', 'up via service');
	
	if (/head/i.test(request.method))
		return Link.responder(response).ok(null, headerer).end();

	var docIds = (request.query.q) ? this.idx.search(request.query.q) : undefined;
	var docs = this._getDocsByResultset(docIds);

	if (/html/.test(request.headers.accept))
		Link.responder(response).ok('html', headerer).end(this._buildDocsHtml(docs));
	else
		Link.responder(response).ok('json', headerer).end(docs);
};

LunrServer.prototype.addDocument = function(request, response) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/docs', 'self current');
	headerer.addLink('/', 'up via service');
	var respond = Link.responder(response);

	var doc = request.body;
	if (!doc)
		return respond.unprocessableEntity(null, headerer).end('request body required');
	if (!doc.title)
		return respond.unprocessableEntity(null, headerer).end('request body `title` required');
	if (!doc.href)
		return respond.unprocessableEntity(null, headerer).end('request body `href` required');
	if (!doc.desc)
		return respond.unprocessableEntity(null, headerer).end('request body `desc` required');

	this._addDoc(doc);
	respond.ok(null, headerer).end();
};

LunrServer.prototype._addDoc = function(doc) {
	doc.__searchIndex = this.nDocs;
	this.docs.push(doc);
	this.idx.add(doc);
	this.nDocs++;
};

LunrServer.prototype._getDocsByResultset = function(resultset) {
	if (!resultset)
		return this.docs;
	var docs = [];
	for (var i=0, ii=resultset.length; i < ii; i++) {
		if (this.docs[resultset[i].ref])
			docs.push(this.docs[resultset[i].ref]);
	}
	return docs;
};

LunrServer.prototype._buildDocsHtml = function(docs) {
	var html = [];
	html.push([
		'<table class="table table-striped table-condensed">',
			docs.map(function(doc) {
				var target = '';
				if (doc.target == '_top')
					target = 'target="_top"';
				return '<tr><td><a href="'+doc.href+'" '+target+'>'+doc.title+'</a> <small>'+doc.desc+'</small></td></tr>';
			}).join(''),
		'</table>',
		'<div id="search-results"></div>'
	].join(''));
	return html;
};

local.setServer(LunrServer);