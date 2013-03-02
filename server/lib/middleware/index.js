module.exports.rawBody = function(req, res, next) { // thanks to JP Richardson
	req.setEncoding('utf8');
	req.rawBody = '';
	req.on('data', function(chunk) {
		req.rawBody += chunk;
	});
	req.on('end', next);
};

module.exports.setCORSHeaders = function(req, res, next) {
	// this function open-sourced by Goodybag, Inc
	res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
	res.setHeader('Access-Control-Allow-Credentials', true);
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, HEAD, GET, PUT, PATCH, POST, DELETE');
	res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers']);
	res.setHeader('Access-Control-Expose-Headers', req.headers['access-control-request-headers']);

	// intercept OPTIONS method, this needs to respond with a zero length response (pre-flight for CORS).
	if (req.method === 'OPTIONS') return res.send(200);
	next();
};

module.exports.addResponseHelpers = function(req, res, next) {
	// more detailed link-creation
	res.link = function(rel, href, title, attrs) {
		if (typeof title == 'object' && !attrs) {
			attrs = title;
			title = null;
		}

		var link = { rel:rel, href:href, attrs:(attrs || {}) };
		if (title)
			link.attrs.title = title;

		this.__linkHeader = [link].concat(this.__linkHeader || []);
		return this.set('Link', this.__linkHeader.map(function(link) {
			var str = '<'+(link.href)+'>; rel="'+link.rel+'"';
			for (var k in link.attrs)
				str += '; '+k+'="'+link.attrs[k]+'"';
			return str;
		}).join(', '));
	};
	next();
};