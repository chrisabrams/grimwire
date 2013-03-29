// LinkJS
// ======
// pfraze 2012
function noop() {}
var Link = {};// Helpers
// =======
(function(exports) {

	// EventEmitter
	// ============
	// EXPORTED
	// A minimal event emitter, based on the NodeJS api
	// initial code borrowed from https://github.com/tmpvar/node-eventemitter (thanks tmpvar)
	function EventEmitter() {
		this._events = {};
	}

	EventEmitter.prototype.emit = function(type) {
		var handlers = this._events[type];
		if (!handlers) return false;

		var args = Array.prototype.slice.call(arguments, 1);
		for (var i = 0, l = handlers.length; i < l; i++) {
			handlers[i].apply(this, args);
		}
		return true;
	};

	EventEmitter.prototype.addListener = function(type, listener) {
		if (Array.isArray(type)) {
			type.forEach(function(t) { this.addListener(t, listener); }, this);
			return;
		}

		if ('function' !== typeof listener) {
			throw new Error('addListener only takes instances of Function');
		}

		// To avoid recursion in the case that type == "newListeners"! Before
		// adding it to the listeners, first emit "newListeners".
		this.emit('newListener', type, listener);

		if (!this._events[type]) {
			this._events[type] = [listener];
		} else {
			this._events[type].push(listener);
		}

		return this;
	};

	EventEmitter.prototype.on = EventEmitter.prototype.addListener;

	EventEmitter.prototype.once = function(type, listener) {
		var self = this;
		self.on(type, function g() {
			self.removeListener(type, g);
			listener.apply(this, arguments);
		});
	};

	EventEmitter.prototype.removeListener = function(type, listener) {
		if ('function' !== typeof listener) {
			throw new Error('removeListener only takes instances of Function');
		}
		if (!this._events[type]) return this;

		var list = this._events[type];
		var i = list.indexOf(listener);
		if (i < 0) return this;
		list.splice(i, 1);
		if (list.length === 0) {
			delete this._events[type];
		}

		return this;
	};

	EventEmitter.prototype.removeAllListeners = function(type) {
		if (type && this._events[type]) this._events[type] = null;
		return this;
	};

	EventEmitter.prototype.listeners = function(type) {
		return this._events[type];
	};

	exports.EventEmitter  = EventEmitter;

	// Headerer
	// ========
	// EXPORTED
	// a utility for building request and response headers
	// - may be passed to `response.writeHead()`
	function Headerer(init) {
		// copy out any initial values
		if (init && typeof init == 'object') {
			for (var k in init) {
				if (init.hasOwnProperty(k)) {
					this[k] = init[k];
				}
			}
		}
	}

	// adds an entry to the Link header
	// - `href` may be a relative path for the context's domain
	// - `rel` should be a value found in http://www.iana.org/assignments/link-relations/link-relations.xml
	// - `rel` may contain more than on value, separated by spaces
	// - `other` is an optional object of other KVs for the header
	Headerer.prototype.addLink = function(href, rel, other) {
		var entry = other || {};
		entry.href = href;
		entry.rel = rel;
		if (!this.link) {
			this.link = [];
		}
		this.link.push(entry);
		return this;
	};

	// sets the Authorization header
	// - `auth` must include a `scheme`, and any other vital parameters for the given scheme
	Headerer.prototype.setAuth = function(auth) {
		this.authorization = auth;
		return this;
	};

	// converts the headers into string forms for transfer over HTTP
	Headerer.prototype.serialize = function() {
		if (this.link && Array.isArray(this.link)) {
			// :TODO:
			throw "Link header serialization is not yet implemented";
		}
		if (this.authorization && typeof this.authorization == 'object') {
			if (!this.authorization.scheme) { throw "`scheme` required for auth headers"; }
			var auth;
			switch (this.authorization.scheme.toLowerCase()) {
				case 'basic':
					auth = 'Basic '+btoa(this.authorization.name+':'+this.authorization.password);
					break;
				case 'persona':
					auth = 'Persona name='+this.authorization.name+' assertion='+this.authorization.assertion;
					break;
				default:
					throw "unknown auth sceme: "+this.authorization.scheme;
			}
			this.authorization = auth;
		}
		return this;
	};

	// wrap helper
	function headerer(h) {
		return (h instanceof Headerer) ? h : new Headerer(h);
	}

	exports.Headerer     = Headerer;
	exports.headerer     = headerer;

	// Link.parseLinkHeader
	// EXPORTED
	// breaks a link header into a javascript object
	exports.parseLinkHeader = function(headerStr) {
		if (typeof headerStr !== 'string') {
			return headerStr;
		}
		// '</foo/bar>; rel="baz"; title="blah", </foo/bar>; rel="baz"; title="blah", </foo/bar>; rel="baz"; title="blah"'
		return headerStr.replace(/,[\s]*</g, '|||<').split('|||').map(function(linkStr) {
			// ['</foo/bar>; rel="baz"; title="blah"', '</foo/bar>; rel="baz"; title="blah"']
			var link = {};
			linkStr.trim().split(';').forEach(function(attrStr) {
				// ['</foo/bar>', 'rel="baz"', 'title="blah"']
				attrStr = attrStr.trim();
				if (!attrStr) { return; }
				if (attrStr.charAt(0) === '<') {
					// '</foo/bar>'
					link.href = attrStr.trim().slice(1, -1);
				} else {
					var attrParts = attrStr.split('=');
					// ['rel', '"baz"']
					var k = attrParts[0].trim();
					var v = attrParts[1].trim().slice(1, -1);
					link[k] = v;
				}
			});
			return link;
		});
	};

	// EXPORTED
	// looks up a link in the cache and generates the URI
	//  - first looks for a matching rel and title
	//    eg lookupLink(links, 'item', 'foobar'), Link: <http://example.com/some/foobar>; rel="item"; title="foobar" -> http://example.com/some/foobar
	//  - then looks for a matching rel with no title and uses that to generate the link
	//    eg lookupLink(links, 'item', 'foobar'), Link: <http://example.com/some/{title}>; rel="item" -> http://example.com/some/foobar
	exports.lookupLink = function(links, rel, title) {
		var len = links ? links.length : 0;
		if (!len) { return null; }

		title = title.toLowerCase();

		// try to find the link with a title equal to the param we were given
		var match = null;
		for (var i=0; i < len; i++) {
			var link = links[i];
			if (!link) { continue; }
			// find all links with a matching rel
			if (link.rel && link.rel.indexOf(rel) !== -1) {
				// look for a title match to the primary parameter
				if (link.title) {
					if (link.title.toLowerCase() === title) {
						match = link;
						break;
					}
				} else {
					// no title attribute -- it's the template URI, so hold onto it
					match = link;
				}
			}
		}
		
		return match ? match.href : null;
	};

	// EXPORTED
	// correctly joins together to url segments
	exports.joinUrl = function() {
		var parts = Array.prototype.map.call(arguments, function(arg) {
			var lo = 0, hi = arg.length;
			if (arg.charAt(0) === '/')      { lo += 1; }
			if (arg.charAt(hi - 1) === '/') { hi -= 1; }
			return arg.substring(lo, hi);
		});
		return parts.join('/');
	};

	// EXPORTED
	// parseUri 1.2.2, (c) Steven Levithan <stevenlevithan.com>, MIT License
	exports.parseUri = function(str) {
		if (typeof str === 'object') {
			if (str.url) { str = str.url; }
			else if (str.host || str.path) { str = Link.joinUrl(req.host, req.path); }
		}
		var	o   = exports.parseUri.options,
			m   = o.parser[o.strictMode ? "strict" : "loose"].exec(str),
			uri = {},
			i   = 14;

		while (i--) uri[o.key[i]] = m[i] || "";

		uri[o.q.name] = {};
		uri[o.key[12]].replace(o.q.parser, function ($0, $1, $2) {
			if ($1) uri[o.q.name][$1] = $2;
		});

		return uri;
	};

	exports.parseUri.options = {
		strictMode: false,
		key: ["source","protocol","authority","userInfo","user","password","host","port","relative","path","directory","file","query","anchor"],
		q:   {
			name:   "queryKey",
			parser: /(?:^|&)([^&=]*)=?([^&]*)/g
		},
		parser: {
			strict: /^(?:([^:\/?#]+):)?(?:\/\/((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?))?((((?:[^?#\/]*\/)*)([^?#]*))(?:\?([^#]*))?(?:#(.*))?)/,
			loose:  /^(?:(?![^:@]+:[^:@\/]*@)([^:\/?#.]+):)?(?:\/\/)?((?:(([^:@]*)(?::([^:@]*))?)?@)?([^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/
		}
	};

	// contentTypes
	// ============
	// EXPORTED
	// provides serializers and deserializers for MIME types
	var contentTypes = {
		serialize   : contentTypes__serialize,
		deserialize : contentTypes__deserialize,
		register    : contentTypes__register
	};
	var contentTypes__registry = {};

	// EXPORTED
	// serializes an object into a string
	function contentTypes__serialize(obj, type) {
		if (!obj || typeof(obj) != 'object' || !type) {
			return obj;
		}
		var fn = contentTypes__find(type, 'serializer');
		if (!fn) {
			return obj;
		}
		return fn(obj);
	}

	// EXPORTED
	// deserializes a string into an object
	function contentTypes__deserialize(str, type) {
		if (!str || typeof(str) != 'string' || !type) {
			return str;
		}
		var fn = contentTypes__find(type, 'deserializer');
		if (!fn) {
			return str;
		}
		return fn(str);
	}

	// EXPORTED
	// adds a type to the registry
	function contentTypes__register(type, serializer, deserializer) {
		contentTypes__registry[type] = {
			serializer   : serializer,
			deserializer : deserializer
		};
	}

	// INTERNAL
	// takes a mimetype (text/asdf+html), puts out the applicable types ([text/asdf+html, text/html, text])
	function contentTypes__mkTypesList(type) {
		var parts = type.split(';');
		var t = parts[0];
		parts = t.split('/');
		if (parts[1]) {
			var parts2 = parts[1].split('+');
			if (parts2[1]) {
				return [t, parts[0] + '/' + parts2[1], parts[0]];
			}
			return [t, parts[0]];
		}
		return [t];
	}

	// INTERNAL
	// finds the closest-matching type in the registry and gives the request function
	function contentTypes__find(type, fn) {
		var types = contentTypes__mkTypesList(type);
		for (var i=0; i < types.length; i++) {
			if (types[i] in contentTypes__registry) {
				return contentTypes__registry[types[i]][fn];
			}
		}
		return null;
	}

	// default types
	contentTypes__register('application/json',
		function (obj) {
			try {
				return JSON.stringify(obj);
			} catch (e) {
				return e.message;
			}
		},
		function (str) {
			try {
				return JSON.parse(str);
			} catch (e) {
				return e.message;
			}
		}
	);
	contentTypes__register('application/x-www-form-urlencoded',
		function (obj) {
			var enc = encodeURIComponent;
			var str = [];
			for (var k in obj) {
				if (obj[k] === null) {
					str.push(k+'=');
				} else if (Array.isArray(obj[k])) {
					for (var i=0; i < obj[k].length; i++) {
						str.push(k+'[]='+enc(obj[k][i]));
					}
				} else if (typeof obj[k] == 'object') {
					for (var k2 in obj[k]) {
						str.push(k+'['+k2+']='+enc(obj[k][k2]));
					}
				} else {
					str.push(k+'='+enc(obj[k]));
				}
			}
			return str.join('&');
		},
		function (params) {
			// thanks to Brian Donovan
			// http://stackoverflow.com/a/4672120
			var pairs = params.split('&'),
			result = {};

			for (var i = 0; i < pairs.length; i++) {
				var pair = pairs[i].split('='),
				key = decodeURIComponent(pair[0]),
				value = decodeURIComponent(pair[1]),
				isArray = /\[\]$/.test(key),
				dictMatch = key.match(/^(.+)\[([^\]]+)\]$/);

				if (dictMatch) {
					key = dictMatch[1];
					var subkey = dictMatch[2];

					result[key] = result[key] || {};
					result[key][subkey] = value;
				} else if (isArray) {
					key = key.substring(0, key.length-2);
					result[key] = result[key] || [];
					result[key].push(value);
				} else {
					result[key] = value;
				}
			}

			return result;
		}
	);

	exports.contentTypes = contentTypes;
})(Link);// Core
// ====
// :NOTE: currently, Firefox is not able to retrieve response headers over CORS
(function(exports) {
	// stores local server functions
	var httpl_registry = {};
	// request dispatcher func
	// - used in workers to transport requests to the parent for routing
	var customRequestDispatcher = null;

	// custom error type, for use in promises
	// EXPORTED
	function ResponseError(response) {
		response = response || {};
		response.headers = response.readers || {};

		this.message = ''+response.status+': '+response.reason;
		this.response = response;
	}
	ResponseError.prototype = new Error();

	// dispatch()
	// =========
	// EXPORTED
	// HTTP request dispatcher
	// - `req` param:
	//   - requires `method`, `body`, and the target url
	//   - target url can be passed in options as `url`, or generated from `host` and `path`
	//   - query parameters may be passed in `query`
	//   - extra request headers may be specified in `headers`
	//   - if `stream` is true, the ClientResponse 'data' events will be called as soon as headers or data are received
	// - returns a `Promise` object
	//   - on success (status code 2xx), the promise is fulfilled with a `ClientResponse` object
	//   - on failure (status code 4xx,5xx), the promise is rejected with a `ClientResponse` object
	//   - all protocol (status code 1xx,3xx) is handled internally
	function dispatch(req) {
		// sanity check
		if (!req) { throw "no req param provided to request"; }

		// sane defaults
		req.headers = req.headers || {};
		req.query = req.query || {};

		// dispatch behavior override
		// (used by workers to send requests to the parent document for routing)
		if (customRequestDispatcher) {
			return customRequestDispatcher(req);
		}

		// parse the url
		// (urld = url description)
		if (req.url) {
			req.urld = Link.parseUri(req.url);
		} else {
			req.urld = Link.parseUri(Link.joinUrl(req.host, req.path));
		}
		if (!req.urld) {
			throw "no URL or host/path provided in request";
		}

		// prepend host on relative path
		if (!req.urld.protocol) {
			req.url = window.location.protocol + "//" + window.location.host + req.url;
			req.urld = Link.parseUri(req.url);
		}

		// execute according to protocol (asyncronously)
		var resPromise = promise();
		if (req.urld.protocol == 'httpl') {
			setTimeout(function() { __dispatchLocal(req, resPromise); }, 0);
		} else if (req.urld.protocol == 'http' || req.urld.protocol == 'https') {
			setTimeout(function() { __dispatchRemote(req, resPromise); }, 0);
		} else {
			resPromise.fulfill(new ResponseError({ status:0, reason:'unsupported protocol "'+req.urld.protocol+'"' }));
		}
		return resPromise;
	}

	// executes a request locally
	function __dispatchLocal(req, resPromise) {

		// find the local server
		var server = httpl_registry[req.urld.host];
		if (!server) {
			var res = new ClientResponse(404, 'server not found');
			resPromise.reject(new ResponseError(res));
			res.end();
			return;
		}

		// rebuild the request
		// :NOTE: could just pass `req`, but would rather be explicit about what a local server receives
		var req2 = {
			path    : req.urld.path,
			method  : req.method,
			query   : req.query || {},
			headers : req.headers || {},
			body    : req.body,
			stream  : req.stream
		};

		// if the urld has query parameters, mix them into the request's query object
		if (req.urld.query) {
			var q = Link.contentTypes.deserialize(req.urld.query, 'application/x-www-form-urlencoded');
			for (var k in q) {
				req2.query[k] = q[k];
			}
		}

		// pass on to the server
		server.fn.call(server.context, req2, new ServerResponse(resPromise, req.stream));
	}

	// executes a request remotely
	function __dispatchRemote(req, resPromise) {

		// if a query was given in the options, mix it into the urld
		if (req.query) {
			var q = Link.contentTypes.serialize(req.query, 'application/x-www-form-urlencoded');
			if (q) {
				if (req.urld.query) {
					req.urld.query    += '&' + q;
					req.urld.relative += '&' + q;
				} else {
					req.urld.query     =  q;
					req.urld.relative += '?' + q;
				}
			}
		}

		if (typeof window != 'undefined') {
			__dispatchRemoteBrowser(req, resPromise);
		} else {
			__dispatchRemoteNodejs(req, resPromise);
		}
	}

	// executes a remote request in the browser
	function __dispatchRemoteBrowser(req, resPromise) {

		// assemble the final url
		var url = ((req.urld.protocol) ? (req.urld.protocol + '://') : '') + req.urld.authority + req.urld.relative;

		// make sure our payload is serialized
		req.headers = Link.headerer(req.headers).serialize();
		if (req.body !== null && typeof req.body != 'undefined') {
			req.headers['content-type'] = req.headers['content-type'] || 'application/json';
			if (typeof req.body !== 'string') {
				req.body = Link.contentTypes.serialize(req.body, req.headers['content-type']);
			}
		}

		// create the request
		var xhrRequest = new XMLHttpRequest();
		xhrRequest.open(req.method, url, true);

		for (var k in req.headers) {
			if (req.headers[k] !== null && req.headers.hasOwnProperty(k)) {
				xhrRequest.setRequestHeader(k, req.headers[k]);
			}
		}

		var clientResponse, streamPoller=0, lenOnLastPoll=0;
		xhrRequest.onreadystatechange = function() {
			if (xhrRequest.readyState >= XMLHttpRequest.HEADERS_RECEIVED && !clientResponse) {
				clientResponse = new ClientResponse(xhrRequest.status, xhrRequest.statusText);

				// :NOTE: a bug in firefox causes getAllResponseHeaders to return an empty string on CORS
				// we either need to bug them, or iterate the headers we care about with getResponseHeader
				xhrRequest.getAllResponseHeaders().split("\n").forEach(function(h) {
					if (!h) { return; }
					var kv = h.toLowerCase().replace('\r','').split(': ');
					clientResponse.headers[kv[0]] = kv[1];
				});

				// parse any headers we need
				if (clientResponse.headers.link) {
					clientResponse.headers.link = Link.parseLinkHeader(clientResponse.headers.link);
				}

				if (req.stream) {
					// fulfill ahead of final response
					if (clientResponse.status >= 200 && clientResponse.status < 400) {
						resPromise.fulfill(clientResponse);
					} else if (clientResponse.status >= 400 && clientResponse.status < 600) {
						resPromise.reject(new ResponseError(clientResponse));
					} else if (clientResponse.status === 0) {
						resPromise.reject(new ResponseError({ code:0, reason:'Remote connection refused by the host' }));
					} else {
						// :TODO: protocol handling
						resPromise.reject(new ResponseError(clientResponse));
					}

					// start polling for updates
					streamPoller = setInterval(function() {
						// new data?
						var len = xhrRequest.responseText.length;
						if (len > lenOnLastPoll) {
							lenOnLastPoll = len;
							clientResponse.write(xhrRequest.responseText, true);
						}
					}, req.streamPoll || 500);
				}
			}
			if (xhrRequest.readyState === XMLHttpRequest.DONE) {
				clientResponse = clientResponse || new ClientResponse(xhrRequest.status, xhrRequest.statusText);
				if (streamPoller) {
					clearInterval(streamPoller);
				}

				// finished streaming, try to deserialize the body
				var body = Link.contentTypes.deserialize(xhrRequest.responseText, clientResponse.headers['content-type']);

				if (!req.stream) {
					// set the body that we have now so its available on fulfill (aconvenience for nonstreamers)
					clientResponse.body = Link.contentTypes.deserialize(xhrRequest.responseText, clientResponse.headers['content-type']);

					// fulfill after final response
					if (clientResponse.status >= 200 && clientResponse.status < 400) {
						resPromise.fulfill(clientResponse);
					} else if (clientResponse.status >= 400 && clientResponse.status < 600) {
						resPromise.reject(new ResponseError(clientResponse));
					} else if (clientResponse.status === 0) {
						resPromise.reject(new ResponseError({ code:0, reason:'Remote connection refused by the host' }));
					} else {
						// :TODO: protocol handling
						resPromise.reject(new ResponseError(clientResponse));
					}
				} else {
					clientResponse.write(body);
				}
				clientResponse.end();
			}
		};
		xhrRequest.send(req.body);
	}

	// executes a remote request in a nodejs process
	function __dispatchRemoteNodejs(req, resPromise) {
		var res = new ClientResponse(0, 'dispatch() has not yet been implemented for nodejs');
		resPromise.reject(res);
		res.end();
	}

	// EXPORTED
	// allows the API consumer to dispatch requests with their own code
	// - mainly for workers to submit requests to the document for routing
	function setRequestDispatcher(fn) {
		customRequestDispatcher = fn;
	}

	// ClientResponse
	// ==============
	// EXPORTED
	// Interface for receiving responses
	// - generated internally and returned by `request`
	// - used by ServerResponse (for local servers) and by the remote request handler code
	// - emits 'data' events when a streaming request receives data
	// - emits an 'end' event when the connection is ended
	// - if the request is not streaming, the response body will be present in `body` (and no 'end' event is needed)
	function ClientResponse(status, reason) {
		Link.EventEmitter.call(this);

		this.status = status;
		this.reason = reason;
		this.headers = {};
		this.body = null;
		this.isConnOpen = true;
	}
	ClientResponse.prototype = Object.create(Link.EventEmitter.prototype);
	ClientResponse.prototype.write = function(data, overwrite) {
		if (!overwrite && typeof data == 'string' && typeof this.body == 'string') {
			// add to the buffer if its a string
			this.body += data;
		} else {
			// overwrite otherwise
			var oldLen = (this.body && typeof this.body == 'string') ? this.body.length : 0;
			this.body = data;
			data = (typeof data == 'string') ? data.slice(oldLen) : data; // slice out what we already had, for the emit
		}
		this.emit('data', data);
	};
	ClientResponse.prototype.end = function() {
		// now that we have it all, try to deserialize the payload
		this.__deserialize();
		this.isConnOpen = false;
		this.emit('end');
	};
	// this helper is called when the data finishes coming down
	ClientResponse.prototype.__deserialize = function() {
		// convert from string to an object (if we have a deserializer available)
		if (typeof this.body == 'string')
			this.body = Link.contentTypes.deserialize(this.body, this.headers['content-type']);
	};

	// ServerResponse
	// ==============
	// EXPORTED
	// Interface for responding to requests
	// - generated internally and given to document-local servers
	// - not given to clients; instead, will run client's callbacks as appropriate
	function ServerResponse(resPromise, isStreaming) {
		Link.EventEmitter.call(this);

		this.resPromise  = resPromise;
		this.isStreaming = isStreaming;
		this.clientResponse = new ClientResponse();
	}
	ServerResponse.prototype = Object.create(Link.EventEmitter.prototype);

	// writes the header to the response
	// if streaming, will notify the client
	ServerResponse.prototype.writeHead = function(status, reason, headers) {
		// setup client response
		this.clientResponse.status = status;
		this.clientResponse.reason = reason;
		for (var k in headers) {
			if (headers.hasOwnProperty(k)) {
				this.setHeader(k, headers[k]);
			}
		}

		// fulfill/reject
		if (this.isStreaming) { this.__fulfillPromise(); }
	};

	// header access/mutation fns
	ServerResponse.prototype.setHeader    = function(k, v) { this.clientResponse.headers[k] = v; };
	ServerResponse.prototype.getHeader    = function(k) { return this.clientResponse.headers[k]; };
	ServerResponse.prototype.removeHeader = function(k) { delete this.clientResponse.headers[k]; };

	// writes data to the response
	// if streaming, will notify the client
	ServerResponse.prototype.write = function(data) {
		this.clientResponse.write(data, false);
	};

	// ends the response, optionally writing any final data
	ServerResponse.prototype.end = function(data) {
		// write any remaining data
		if (data) { this.write(data); }

		// fulfill/reject now if we had been buffering the response
		if (!this.isStreaming) {
			this.clientResponse.__deserialize(); // go ahead and deserialize
			this.__fulfillPromise();
		}

		this.clientResponse.end();
		this.emit('close');

		// unbind all listeners
		this.removeAllListeners('close');
		this.clientResponse.removeAllListeners('data');
		this.clientResponse.removeAllListeners('end');
	};

	// fills the response promise with our clientResponse interface
	ServerResponse.prototype.__fulfillPromise = function() {
		if (this.clientResponse.status >= 200 && this.clientResponse.status < 400) {
			this.resPromise.fulfill(this.clientResponse);
		} else if (this.clientResponse.status >= 400 && this.clientResponse.status < 600) {
			this.resPromise.reject(new ResponseError(this.clientResponse));
		} else {
			// :TODO: protocol handling
			this.resPromise.reject(new ResponseError(this.clientResponse));
		}
	};

	// functions added just to compat with nodejs
	ServerResponse.prototype.writeContinue = noop;
	ServerResponse.prototype.addTrailers   = noop;
	ServerResponse.prototype.sendDate      = noop; // :TODO: is this useful?

	// registerLocal()
	// ===============
	// EXPORTED
	// adds a server to the httpl registry
	function registerLocal(domain, server, serverContext) {
		var urld = Link.parseUri(domain);
		if (urld.protocol && urld.protocol !== 'httpl') {
			throw "registerLocal can only add servers to the httpl protocol";
		}
		if (!urld.host) {
			throw "invalid domain provided to registerLocal";
		}
		if (httpl_registry[urld.host]) {
			throw "server already registered at domain given to registerLocal";
		}
		httpl_registry[urld.host] = { fn:server, context:serverContext };
	}

	// unregisterLocal()
	// =================
	// EXPORTED
	// removes a server from the httpl registry
	function unregisterLocal(domain) {
		var urld = Link.parseUri(domain);
		if (!urld.host) {
			throw "invalid domain provided toun registerLocal";
		}
		if (httpl_registry[urld.host]) {
			delete httpl_registry[urld.host];
		}
	}

	// getLocal()
	// ==========
	// EXPORTED
	// retrieves a server from the httpl registry
	function getLocal(domain) {
		var urld = Link.parseUri(domain);
		if (!urld.host) {
			throw "invalid domain provided toun registerLocal";
		}
		return httpl_registry[urld.host];
	}

	// getLocal()
	// ==========
	// EXPORTED
	// retrieves the httpl registry
	function getLocalRegistry() {
		return httpl_registry;
	}

	exports.ResponseError        = ResponseError;
	exports.dispatch             = dispatch;
	exports.registerLocal        = registerLocal;
	exports.unregisterLocal      = unregisterLocal;
	exports.getLocal             = getLocal;
	exports.getLocalRegistry     = getLocalRegistry;
	exports.setRequestDispatcher = setRequestDispatcher;
	exports.ClientResponse       = ClientResponse;
	exports.ServerResponse       = ServerResponse;
})(Link);// Events
// ======
// :NOTE: currently, Chrome does not support event streams with CORS
(function(exports) {
	// event subscriber func
	// - used in workers to transport subscribes to the parent for routing
	var customEventSubscriber = null;

	// subscribe()
	// =========
	// EXPORTED
	// Establishes a connection and begins an event stream
	// - sends a GET request with 'text/event-stream' as the Accept header
	// - `req` param:
	//   - requires the target url
	//   - target url can be passed in req as `url`, or generated from `host` and `path`
	// - returns a `EventStream` object
	function subscribe(req) {

		if (!req) { throw "no options provided to subscribe"; }
		if (typeof req == 'string') {
			req = { url:req };
		}

		// subscribe behavior override
		// (used by workers to send subscribes to the parent document for routing)
		if (customEventSubscriber) {
			return customEventSubscriber(req);
		}

		// parse the url
		if (req.url) {
			req.urld = Link.parseUri(req.url);
		} else {
			req.urld = Link.parseUri(Link.joinUrl(req.host, req.path));
		}
		if (!req.urld) {
			throw "no URL or host/path provided to subscribe";
		}

		// prepend host on relative path
		if (!req.urld.protocol) {
			req.url = window.location.protocol + "//" + window.location.host + req.url;
			req.urld = Link.parseUri(req.url);
		}

		// execute according to protocol
		if (req.urld.protocol == 'httpl') {
			return __subscribeLocal(req);
		} else {
			return __subscribeRemote(req);
		}
	}

	// subscribes to a local host
	function __subscribeLocal(req) {

		// initiate the event stream
		var stream = new LocalEventStream(Link.dispatch({
			method  : 'get',
			url     : 'httpl://' + req.urld.authority + req.urld.relative,
			headers : { accept : 'text/event-stream' },
			stream  : true
		}));
		return stream;
	}

	// subscribes to a remote host
	function __subscribeRemote(req) {
		if (typeof window != 'undefined') {
			return __subscribeRemoteBrowser(req);
		} else {
			return __subscribeRemoteNodejs(req);
		}
	}

	// subscribes to a remote host in the browser
	function __subscribeRemoteBrowser(req) {

		// assemble the final url
		var url = (req.urld.protocol || 'http') + '://' + req.urld.authority + req.urld.relative;

		// initiate the event stream
		return new BrowserRemoteEventStream(url);
	}

	// subscribes to a remote host in a nodejs process
	function __subscribeRemoteNodejs(req) {
		throw "subscribe() has not yet been implemented for nodejs";
	}

	// EXPORTED
	// allows the API consumer to handle subscribes with their own code
	// - mainly for workers to submit subscribes to the document for routing
	function setEventSubscriber(fn) {
		customEventSubscriber = fn;
	}

	// EventStream
	// ===========
	// EXPORTED
	// provided by subscribe() to manage the events
	function EventStream() {
		Link.EventEmitter.call(this);
		this.isConnOpen = true;
	}
	EventStream.prototype = Object.create(Link.EventEmitter.prototype);
	EventStream.prototype.close = function() {
		this.isConnOpen = false;
		this.removeAllListeners();
	};
	EventStream.prototype.__emitError = function(e) {
		this.emit('message', e);
		this.emit('error', e);
	};
	EventStream.prototype.__emitEvent = function(e) {
		this.emit('message', e);
		this.emit(e.event, e);
	};

	// LocalEventStream
	// ================
	// INTERNAL
	// descendent of EventStream
	function LocalEventStream(resPromise) {
		EventStream.call(this);

		// wait for the promise
		var self = this;
		resPromise
			.then(function(response) {
				// begin emitting
				response.on('data', function(payload) {
					self.__emitEvent(payload);
				});
				response.on('end', function() {
					self.close();
				});
			})
			.except(function(err) {
				// fail town
				self.__emitError({ event:'error', data:err });
				self.close();
			});
	}
	LocalEventStream.prototype = Object.create(EventStream.prototype);
	LocalEventStream.prototype.close = function() {
		this.__emitError({ event:'error', data:undefined }); // :NOTE: emulating the behavior of EventSource
		// :TODO: would be great if close didn't emit the above error
		EventStream.prototype.close.call(this);
	};

	// BrowserRemoteEventStream
	// ========================
	// INTERNAL
	// descendent of EventStream, abstracts over EventSource
	function BrowserRemoteEventStream(url) {
		EventStream.call(this);

		// establish the connection to the remote source
		this.eventSource = new EventSource(url);
		// wire it up to our functions
		var self = this;
		this.eventSource.onerror = function(e) {
			if (e.target.readyState == EventSource.CLOSED) {
				self.close();
			}
		};
	}
	BrowserRemoteEventStream.prototype = Object.create(EventStream.prototype);
	BrowserRemoteEventStream.prototype.addListener = function(type, listener) {
		if (Array.isArray(type)) {
			type.forEach(function(t) { this.addListener(t, listener); }, this);
			return;
		}
		if (!this._events[type]) {
			// if this is the first add to the event stream, register our interest with the event source
			var self = this;
			this.eventSource.addEventListener(type, function(e) {
				var data = e.data;
				try { data = JSON.parse(data); } catch(err) {}
				self.__emitEvent({ event:e.type, data:data });
			});
		}
		Link.EventEmitter.prototype.addListener.call(this, type, listener);
	};
	BrowserRemoteEventStream.prototype.on = BrowserRemoteEventStream.prototype.addListener;
	BrowserRemoteEventStream.prototype.close = function() {
		this.eventSource.close();
		this.eventSource.onerror = null;
		this.eventSource = null;
		EventStream.prototype.close.call(this);
	};

	exports.subscribe          = subscribe;
	exports.setEventSubscriber = setEventSubscriber;
	exports.EventStream        = EventStream;
})(Link);// Navigator
// =========
(function(exports) {
	function getEnvironmentHost() {
		if (typeof window !== 'undefined') return window.location.host;
		if (app) return app.config.environmentHost; // must be passed to in the ready config
		return '';
	}

	// navigator sugar functions
	// =========================
	// these constants specify which sugars to add to the navigator
	var NAV_REQUEST_FNS = ['head',/*'get',*/'post','put','patch','delete']; // get is added separately
	var NAV_GET_TYPES = {
		'Json':'application/json','Html':'text/html','Xml':'text/xml',
		'Events':'text/event-stream','Eventstream':'text/event-stream',
		'Plain':'text/plain', 'Text':'text/plain'
	};
	// http://www.iana.org/assignments/link-relations/link-relations.xml
	// (I've commented out the relations which are probably not useful enough to make sugars for)
	var NAV_RELATION_FNS = [
		'alternate', /*'appendix', 'archives',*/ 'author', /*'bookmark', 'canonical', 'chapter',*/ 'collection',
		/*'contents', 'copyright',*/ 'current', 'describedby', /*'disclosure', 'duplicate', 'edit', 'edit-media',
		'enclosure',*/ 'first', /*'glossary', 'help', 'hosts', 'hub', 'icon',*/ 'index', 'item', 'last',
		'latest-version', /*'license', 'lrdd',*/ 'monitor', 'monitor-group', 'next', 'next-archive', /*'nofollow',
		'noreferrer',*/ 'payment', 'predecessor-version', /*'prefetch',*/ 'prev', /*'previous',*/ 'prev-archive',
		'related', 'replies', 'search',	/*'section',*/ 'self', 'service', /*'start', 'stylesheet', 'subsection',*/
		'successor-version', /*'tag',*/ 'up', 'version-history', 'via', 'working-copy', 'working-copy-of'
	];

	// NavigatorContext
	// ================
	// INTERNAL
	// information about the resource that a navigator targets
	//  - may exist in an "unresolved" state until the URI is confirmed by a response from the server
	//  - may exist in a "bad" state if an attempt to resolve the link failed
	//  - may be "relative" if described by a relation from another context
	//  - may be "absolute" if described by a URI
	// :NOTE: absolute contexts may have a URI without being resolved, so don't take the presence of a URI as a sign that the resource exists
	function NavigatorContext(rel, relparams, url) {
		this.rel          = rel;
		this.relparams    = relparams;
		this.url          = url;

		this.resolveState = NavigatorContext.UNRESOLVED;
		this.error        = null;
	}
	NavigatorContext.UNRESOLVED = 0;
	NavigatorContext.RESOLVED   = 1;
	NavigatorContext.FAILED     = 2;
	NavigatorContext.prototype.isResolved = function() { return this.resolveState === NavigatorContext.RESOLVED; };
	NavigatorContext.prototype.isBad      = function() { return this.resolveState > 1; };
	NavigatorContext.prototype.isRelative = function() { return (!this.url && !!this.rel); };
	NavigatorContext.prototype.isAbsolute = function() { return (!!this.url); };
	NavigatorContext.prototype.getUrl     = function() { return this.url; };
	NavigatorContext.prototype.getError   = function() { return this.error; };
	NavigatorContext.prototype.getHost    = function() {
		if (!this.host) {
			if (!this.url) { return null; }
			var urld  = Link.parseUri(this.url);
			this.host = (urld.protocol || 'http') + '://' + (urld.authority || getEnvironmentHost());
		}
		return this.host;
	};
	NavigatorContext.prototype.resetResolvedState = function() {
		this.resolveState = NavigatorContext.UNRESOLVED;
		this.error = null;
	};
	NavigatorContext.prototype.resolve    = function(url) {
		this.error        = null;
		this.resolveState = NavigatorContext.RESOLVED;
		this.url          = url;
		var urld          = Link.parseUri(this.url);
		this.host         = (urld.protocol || 'http') + '://' + urld.authority;
	};

	// Navigator
	// =========
	// EXPORTED
	// API to follow resource links (as specified by the response Link header)
	//  - uses the rel attribute to type its navigations
	//  - uses URI templates to generate URIs
	//  - queues link navigations until a request is made, to decrease on the amount of async calls required
	//
	// example usage:
	/*
	var github = new Navigator('https://api.github.com');
	var me = github.collection('users').item('pfraze');

	me.getJson()
		// -> HEAD https://api.github.com
		// -> HEAD https://api.github.com/users
		// -> GET  https://api.github.com/users/pfraze
		.then(function(myData, headers, status) {
			myData.email = 'pfrazee@gmail.com';
			me.put(myData);
			// -> PUT https://api.github.com/users/pfraze { email:'pfrazee@gmail.com', ...}

			github.collection('users', { since:profile.id }).getJson(function(usersData) {
				// -> GET https://api.github.com/users?since=123
				//...
			});
		});
	*/
	function Navigator(context, parentNavigator) {
		this.context         = context         || null;
		this.parentNavigator = parentNavigator || null;
		this.links           = null;

		// were we passed a url?
		if (typeof this.context == 'string') {
			// absolute context
			this.context = new NavigatorContext(null, null, context);
		} else {
			// relative context
			if (!parentNavigator) {
				throw "parentNavigator is required for navigators with relative contexts";
			}
		}
	}

	// executes an HTTP request to our context
	//  - uses additional parameters on the request options:
	//    - retry: bool, should the resolve be tried if it previously failed?
	//    - noresolve: bool, should we skip resolution?
	Navigator.prototype.dispatch = function Navigator__dispatch(req) {
		if (!req || !req.method) { throw "request options not provided"; }
		var self = this;

		var response = promise();
		((req.noresolve) ? promise(this.context.getUrl()) : this.resolve({ retry:req.retry }))
			.then(function(url) {
				req.url = url;
				Link.dispatch(req)
					.then(function(res) {
						self.context.error = null;
						self.context.resolveState = NavigatorContext.RESOLVED;
						if (res.headers.link)
							self.links = res.headers.link;
						else
							self.links = self.links || []; // cache an empty link list so we dont keep trying during resolution
						return res;
					})
					.except(function(err) {
						if (err.response.status === 404) {
							self.context.error = err;
							self.context.resolveState = NavigatorContext.FAILED;
						}
						return err;
					})
					.chain(response);
			})
			.except(function(err) {
				response.reject(err);
			});
		return response;
	};

	// follows a link relation from our context, generating a new navigator
	//  - uses URI Templates to generate links
	//  - first looks for a matching rel and title
	//    eg relation('item', 'foobar'), Link: <http://example.com/some/foobar>; rel="item"; title="foobar" -> http://example.com/some/foobar
	//  - then looks for a matching rel with no title and uses that to generate the link
	//    eg relation('item', 'foobar'), Link: <http://example.com/some/{title}>; rel="item" -> http://example.com/some/foobar
	//  - `extraParams` are any other URI template substitutions which should occur
	//    eg relation('item', 'foobar', { limit:5 }), Link: <http://example.com/some/{item}{?limit}>; rel="item" -> http://example.com/some/foobar?limit=5
	Navigator.prototype.relation = function Navigator__relation(rel, title, extraParams) {
		var params = extraParams || {};
		params['title'] = (title || '').toLowerCase();

		return new Navigator(new NavigatorContext(rel, params), this);
	};

	// resolves the navigator's URL, reporting failure if a link or resource is unfound
	//  - also ensures the links have been retrieved from the context
	//  - may trigger resolution of parent contexts
	//  - options is optional and may include:
	//    - retry: bool, should the resolve be tried if it previously failed?
	//  - returns a promise
	Navigator.prototype.resolve = function Navigator__resolve(options) {
		var self = this;
		var p = promise();
		if (this.links !== null && (this.context.isResolved() || (this.context.isAbsolute() && this.context.isBad() === false)))
			p.fulfill(this.context.getUrl());
		else if (this.context.isBad() === false || (this.context.isBad() && options.retry)) {
			this.context.resetResolvedState();
			if (this.parentNavigator) {
				this.parentNavigator.__resolveChild(this, options)
					.then(function(url) {
						var p2 = this;
						self.head(null, null, null, { noresolve:true })
							.then(function(res) { p2.fulfill(url); })
							.except(function(err) { p2.reject(err); });
						// remember: by returning nothing we hold the chain until p2 fulfill
					})
					.chain(p);
			} else
				this.head(null, null, null, { noresolve:true })
					.then(function(res) { return self.context.getUrl(); })
					.chain(p);
		} else
			p.reject(this.context.getError());
		return p;
	};

	// resolves a child navigator's context relative to our own
	//  - may trigger resolution of parent contexts
	//  - options is optional and may include:
	//    - retry: bool, should the resolve be tried if it previously failed?
	//  - returns a promise
	Navigator.prototype.__resolveChild = function Navigator__resolveChild(childNav, options) {
		var self = this;
		var resolvedPromise = promise();

		// resolve self before resolving child
		this.resolve(options)
			.then(function() {
				var childUrl = self.__lookupLink(childNav.context);
				if (childUrl) {
					childNav.context.resolve(childUrl);
					resolvedPromise.fulfill(childUrl);
				} else {
					resolvedPromise.reject(new Link.ResponseError({ status:404, reason:'link relation not found' }));
				}
			})
			.except(function(error) {
				// we're bad, and all children are bad as well
				childNav.context.error = error;
				childNav.context.resolveState = NavigatorContext.FAILED;
				resolvedPromise.reject(error);
				return error;
			});
		
		return resolvedPromise;
	};

	// looks up a link in the cache and generates the URI
	//  - first looks for a matching rel and title
	//    eg item('foobar') -> Link: <http://example.com/some/foobar>; rel="item"; title="foobar" -> http://example.com/some/foobar
	//  - then looks for a matching rel with no title and uses that to generate the link
	//    eg item('foobar') -> Link: <http://example.com/some/{item}>; rel="item" -> http://example.com/some/foobar
	Navigator.prototype.__lookupLink = function Navigator__lookupLink(context) {
		// try to find the link with a title equal to the param we were given
		var href = Link.lookupLink(this.links, context.rel, context.relparams.title);
		
		if (href) {
			var url = Link.UriTemplate.parse(href).expand(context.relparams);
			var urld = Link.parseUri(url);
			if (!urld.host) { // handle relative URLs
				url = this.context.getHost() + urld.relative;
			}
			return url;
		}
		console.log('Failed to find a link to resolve context. Target link:', context.rel, context.relparams, 'Navigator:', this);
		return null;
	};

	// add navigator dispatch sugars
	NAV_REQUEST_FNS.forEach(function (m) {
		Navigator.prototype[m] = function(body, type, headers, options) {
			var req = options || {};
			req.headers = headers || {};
			req.method = m;
			if (body !== null && typeof body != 'null' && /head/i.test(m) === false)
				req.headers['content-type'] = type || (typeof body == 'object' ? 'application/json' : 'text/plain');
			req.body = body;
			return this.dispatch(req);
		};
	});

	// add get sugar
	Navigator.prototype.get = function(type, headers, options) {
		var req = options || {};
		req.headers = headers || {};
		req.method = 'get';
		req.headers.accept = type;
		return this.dispatch(req);
	};

	// add get* request sugars
	for (var t in NAV_GET_TYPES) {
		(function(t, mimetype) {
			Navigator.prototype['get'+t] = function(headers, options) {
				return this.get(mimetype, headers, options);
			};
		})(t, NAV_GET_TYPES[t]);
	}

	// add navigator relation sugars
	NAV_RELATION_FNS.forEach(function (r) {
		var safe_r = r.replace(/-/g, '_');
		Navigator.prototype[safe_r] = function(param, extra) {
			return this.relation(r, param, extra);
		};
	});

	// wrap helper
	function navigator(url) {
		return (url instanceof Navigator) ? url : new Navigator(url);
	}

	// exports
	exports.navigator = navigator;
	exports.Navigator = Navigator;
})(Link);// UriTemplate
// ===========
// https://github.com/fxa/uritemplate-js
// Copyright 2012 Franz Antesberger, MIT License
(function (exports){
	"use strict";

	// http://blog.sangupta.com/2010/05/encodeuricomponent-and.html
	//
	// helpers
	//
	function isArray(value) {
		return Object.prototype.toString.apply(value) === '[object Array]';
	}

	// performs an array.reduce for objects
	function objectReduce(object, callback, initialValue) {
		var
			propertyName,
			currentValue = initialValue;
		for (propertyName in object) {
			if (object.hasOwnProperty(propertyName)) {
				currentValue = callback(currentValue, object[propertyName], propertyName, object);
			}
		}
		return currentValue;
	}

	// performs an array.reduce, if reduce is not present (older browser...)
	function arrayReduce(array, callback, initialValue) {
		var
			index,
			currentValue = initialValue;
		for (index = 0; index < array.length; index += 1) {
			currentValue = callback(currentValue, array[index], index, array);
		}
		return currentValue;
	}

	function reduce(arrayOrObject, callback, initialValue) {
		return isArray(arrayOrObject) ? arrayReduce(arrayOrObject, callback, initialValue) : objectReduce(arrayOrObject, callback, initialValue);
	}

	/**
	 * Detects, whether a given element is defined in the sense of rfc 6570
	 * Section 2.3 of the RFC makes clear defintions:
	 * * undefined and null are not defined.
	 * * the empty string is defined
	 * * an array ("list") is defined, if it contains at least one defined element
	 * * an object ("map") is defined, if it contains at least one defined property
	 * @param object
	 * @return {Boolean}
	 */
	function isDefined (object) {
		var
			index,
			propertyName;
		if (object === null || object === undefined) {
			return false;
		}
		if (isArray(object)) {
			for (index = 0; index < object.length; index +=1) {
				if(isDefined(object[index])) {
					return true;
				}
			}
			return false;
		}
		if (typeof object === "string" || typeof object === "number" || typeof object === "boolean") {
			// even the empty string is considered as defined
			return true;
		}
		// else Object
		for (propertyName in object) {
			if (object.hasOwnProperty(propertyName) && isDefined(object[propertyName])) {
				return true;
			}
		}
		return false;
	}

	function isAlpha(chr) {
		return (chr >= 'a' && chr <= 'z') || ((chr >= 'A' && chr <= 'Z'));
	}

	function isDigit(chr) {
		return chr >= '0' && chr <= '9';
	}

	function isHexDigit(chr) {
		return isDigit(chr) || (chr >= 'a' && chr <= 'f') || (chr >= 'A' && chr <= 'F');
	}

	var pctEncoder = (function () {

		// see http://ecmanaut.blogspot.de/2006/07/encoding-decoding-utf8-in-javascript.html
		function toUtf8 (s) {
			return unescape(encodeURIComponent(s));
		}

		function encode(chr) {
			var
				result = '',
				octets = toUtf8(chr),
				octet,
				index;
			for (index = 0; index < octets.length; index += 1) {
				octet = octets.charCodeAt(index);
				result += '%' + octet.toString(16).toUpperCase();
			}
			return result;
		}

		function isPctEncoded (chr) {
			if (chr.length < 3) {
				return false;
			}
			for (var index = 0; index < chr.length; index += 3) {
				if (chr.charAt(index) !== '%' || !isHexDigit(chr.charAt(index + 1) || !isHexDigit(chr.charAt(index + 2)))) {
					return false;
				}
			}
			return true;
		}

		function pctCharAt(text, startIndex) {
			var chr = text.charAt(startIndex);
			if (chr !== '%') {
				return chr;
			}
			chr = text.substr(startIndex, 3);
			if (!isPctEncoded(chr)) {
				return '%';
			}
			return chr;
		}

		return {
			encodeCharacter: encode,
			decodeCharacter: decodeURIComponent,
			isPctEncoded: isPctEncoded,
			pctCharAt: pctCharAt
		};
	}());


	/**
	 * Returns if an character is an varchar character according 2.3 of rfc 6570
	 * @param chr
	 * @return (Boolean)
	 */
	function isVarchar(chr) {
		return isAlpha(chr) || isDigit(chr) || chr === '_' || pctEncoder.isPctEncoded(chr);
	}

	/**
	 * Returns if chr is an unreserved character according 1.5 of rfc 6570
	 * @param chr
	 * @return {Boolean}
	 */
	function isUnreserved(chr) {
		return isAlpha(chr) || isDigit(chr) || chr === '-' || chr === '.' || chr === '_' || chr === '~';
	}

	/**
	 * Returns if chr is an reserved character according 1.5 of rfc 6570
	 * @param chr
	 * @return {Boolean}
	 */
	function isReserved(chr) {
		return chr === ':' || chr === '/' || chr === '?' || chr === '#' || chr === '[' || chr === ']' || chr === '@' || chr === '!' || chr === '$' || chr === '&' || chr === '(' ||
			chr === ')' || chr === '*' || chr === '+' || chr === ',' || chr === ';' || chr === '=' || chr === "'";
	}

	function encode(text, passReserved) {
		var
			result = '',
			index,
			chr = '';
		if (typeof text === "number" || typeof text === "boolean") {
			text = text.toString();
		}
		for (index = 0; index < text.length; index += chr.length) {
			chr = pctEncoder.pctCharAt(text, index);
			if (chr.length > 1) {
				result += chr;
			}
			else {
				result += isUnreserved(chr) || (passReserved && isReserved(chr)) ? chr : pctEncoder.encodeCharacter(chr);
			}
		}
		return result;
	}

	function encodePassReserved(text) {
		return encode(text, true);
	}

	var
		operators = (function () {
			var
				bySymbol = {};
			function create(symbol) {
				bySymbol[symbol] = {
					symbol: symbol,
					separator: (symbol === '?') ? '&' : (symbol === '' || symbol === '+' || symbol === '#') ? ',' : symbol,
					named: symbol === ';' || symbol === '&' || symbol === '?',
					ifEmpty: (symbol === '&' || symbol === '?') ? '=' : '',
					first: (symbol === '+' ) ? '' : symbol,
					encode: (symbol === '+' || symbol === '#') ? encodePassReserved : encode,
					toString: function () {return this.symbol;}
				};
			}
			create('');
			create('+');
			create('#');
			create('.');
			create('/');
			create(';');
			create('?');
			create('&');
			return {valueOf: function (chr) {
				if (bySymbol[chr]) {
					return bySymbol[chr];
				}
				if ("=,!@|".indexOf(chr) >= 0) {
					throw new Error('Illegal use of reserved operator "' + chr + '"');
				}
				return bySymbol[''];
			}};
		}());

	function UriTemplate(templateText, expressions) {
		this.templateText = templateText;
		this.expressions = expressions;
	}

	UriTemplate.prototype.toString = function () {
		return this.templateText;
	};

	UriTemplate.prototype.expand = function (variables) {
		var
			index,
			result = '';
		for (index = 0; index < this.expressions.length; index += 1) {
			result += this.expressions[index].expand(variables);
		}
		return result;
	};

	function encodeLiteral(literal) {
		var
			result = '',
			index,
			chr = '';
		for (index = 0; index < literal.length; index += chr.length) {
			chr = pctEncoder.pctCharAt(literal, index);
			if (chr.length > 0) {
				result += chr;
			}
			else {
				result += isReserved(chr) || isUnreserved(chr) ? chr : pctEncoder.encodeCharacter(chr);
			}
		}
		return result;
	}

	function LiteralExpression(literal) {
		this.literal = encodeLiteral(literal);
	}

	LiteralExpression.prototype.expand = function () {
		return this.literal;
	};

	LiteralExpression.prototype.toString = LiteralExpression.prototype.expand;

	function VariableExpression(templateText, operator, varspecs) {
		this.templateText = templateText;
		this.operator = operator;
		this.varspecs = varspecs;
	}

	VariableExpression.prototype.toString = function () {
		return this.templateText;
	};
	
	VariableExpression.prototype.expand = function expandExpression(variables) {
		var
			result = '',
			index,
			varspec,
			value,
			valueIsArr,
			isFirstVarspec = true,
			operator = this.operator;

		// callback to be used within array.reduce
		function reduceUnexploded(result, currentValue, currentKey) {
			if (isDefined(currentValue)) {
				if (result.length > 0) {
					result += ',';
				}
				if (!valueIsArr) {
					result += operator.encode(currentKey) + ',';
				}
				result += operator.encode(currentValue);
			}
			return result;
		}

		function reduceNamedExploded(result, currentValue, currentKey) {
			if (isDefined(currentValue)) {
				if (result.length > 0) {
					result += operator.separator;
				}
				result += (valueIsArr) ? encodeLiteral(varspec.varname) : operator.encode(currentKey);
				result += '=' + operator.encode(currentValue);
			}
			return result;
		}

		function reduceUnnamedExploded(result, currentValue, currentKey) {
			if (isDefined(currentValue)) {
				if (result.length > 0) {
					result += operator.separator;
				}
				if (!valueIsArr) {
					result += operator.encode(currentKey) + '=';
				}
				result += operator.encode(currentValue);
			}
			return result;
		}

		// expand each varspec and join with operator's separator
		for (index = 0; index < this.varspecs.length; index += 1) {
			varspec = this.varspecs[index];
			value = variables[varspec.varname];
			if (!isDefined(value)) {
				continue;
			}
			if (isFirstVarspec)  {
				result += this.operator.first;
				isFirstVarspec = false;
			}
			else {
				result += this.operator.separator;
			}
			valueIsArr = isArray(value);
			if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
				value = value.toString();
				if (this.operator.named) {
					result += encodeLiteral(varspec.varname);
					if (value === '') {
						result += this.operator.ifEmpty;
						continue;
					}
					result += '=';
				}
				if (varspec.maxLength && value.length > varspec.maxLength) {
					value = value.substr(0, varspec.maxLength);
				}
				result += this.operator.encode(value);
			}
			else if (varspec.maxLength) {
				// 2.4.1 of the spec says: "Prefix modifiers are not applicable to variables that have composite values."
				throw new Error('Prefix modifiers are not applicable to variables that have composite values. You tried to expand ' + this + " with " + JSON.stringify(value));
			}
			else if (!varspec.exploded) {
				if (operator.named) {
					result += encodeLiteral(varspec.varname);
					if (!isDefined(value)) {
						result += this.operator.ifEmpty;
						continue;
					}
					result += '=';
				}
				result += reduce(value, reduceUnexploded, '');
			}
			else {
				// exploded and not string
				result += reduce(value, operator.named ? reduceNamedExploded : reduceUnnamedExploded, '');
			}
		}
		return result;
	};

	function parseExpression(outerText) {
		var
			text,
			operator,
			varspecs = [],
			varspec = null,
			varnameStart = null,
			maxLengthStart = null,
			index,
			chr;

		function closeVarname() {
			varspec = {varname: text.substring(varnameStart, index), exploded: false, maxLength: null};
			varnameStart = null;
		}

		function closeMaxLength() {
			if (maxLengthStart === index) {
				throw new Error("after a ':' you have to specify the length. position = " + index);
			}
			varspec.maxLength = parseInt(text.substring(maxLengthStart, index), 10);
			maxLengthStart = null;
		}

		// remove outer {}
		text = outerText.substr(1, outerText.length - 2);
		for (index = 0; index < text.length; index += chr.length) {
			chr = pctEncoder.pctCharAt(text, index);
			if (index === 0) {
				operator = operators.valueOf(chr);
				if (operator.symbol !== '') {
					// first char is operator symbol. so we can continue
					varnameStart = 1;
					continue;
				}
				// the first char was a regular varname char. We have simple strings and must go on.
				varnameStart = 0;
			}
			if (varnameStart !== null) {

				// the spec says: varname       =  varchar *( ["."] varchar )
				// so a dot is allowed except for the first char
				if (chr === '.') {
					if (varnameStart === index) {
						throw new Error('a varname MUST NOT start with a dot -- see position ' + index);
					}
					continue;
				}
				if (isVarchar(chr)) {
					continue;
				}
				closeVarname();
			}
			if (maxLengthStart !== null) {
				if (isDigit(chr)) {
					continue;
				}
				closeMaxLength();
			}
			if (chr === ':') {
				if (varspec.maxLength !== null) {
					throw new Error('only one :maxLength is allowed per varspec at position ' + index);
				}
				maxLengthStart = index + 1;
				continue;
			}
			if (chr === '*') {
				if (varspec === null) {
					throw new Error('explode exploded at position ' + index);
				}
				if (varspec.exploded) {
					throw new Error('explode exploded twice at position ' + index);
				}
				if (varspec.maxLength) {
					throw new Error('an explode (*) MUST NOT follow to a prefix, see position ' + index);
				}
				varspec.exploded = true;
				continue;
			}
			// the only legal character now is the comma
			if (chr === ',') {
				varspecs.push(varspec);
				varspec = null;
				varnameStart = index + 1;
				continue;
			}
			throw new Error("illegal character '" + chr + "' at position " + index);
		} // for chr
		if (varnameStart !== null) {
			closeVarname();
		}
		if (maxLengthStart !== null) {
			closeMaxLength();
		}
		varspecs.push(varspec);
		return new VariableExpression(outerText, operator, varspecs);
	}

	UriTemplate.parse = function parse(uriTemplateText) {
		// assert filled string
		var
			index,
			chr,
			expressions = [],
			braceOpenIndex = null,
			literalStart = 0;
		for (index = 0; index < uriTemplateText.length; index += 1) {
			chr = uriTemplateText.charAt(index);
			if (literalStart !== null) {
				if (chr === '}') {
					throw new Error('brace was closed in position ' + index + " but never opened");
				}
				if (chr === '{') {
					if (literalStart < index) {
						expressions.push(new LiteralExpression(uriTemplateText.substring(literalStart, index)));
					}
					literalStart = null;
					braceOpenIndex = index;
				}
				continue;
			}

			if (braceOpenIndex !== null) {
				// here just { is forbidden
				if (chr === '{') {
					throw new Error('brace was opened in position ' + braceOpenIndex + " and cannot be reopened in position " + index);
				}
				if (chr === '}') {
					if (braceOpenIndex + 1 === index) {
						throw new Error("empty braces on position " + braceOpenIndex);
					}
					expressions.push(parseExpression(uriTemplateText.substring(braceOpenIndex, index + 1)));
					braceOpenIndex = null;
					literalStart = index + 1;
				}
				continue;
			}
			throw new Error('reached unreachable code');
		}
		if (braceOpenIndex !== null) {
			throw new Error("brace was opened on position " + braceOpenIndex + ", but never closed");
		}
		if (literalStart < uriTemplateText.length) {
			expressions.push(new LiteralExpression(uriTemplateText.substr(literalStart)));
		}
		return new UriTemplate(uriTemplateText, expressions);
	};

	exports.UriTemplate = UriTemplate;
})(Link);// set up for node or AMD
if (typeof module !== "undefined") {
	module.exports = Link;
}
else if (typeof define !== "undefined") {
	define([], function() {
		return Link;
	});
}// Broadcaster
// ===========
// extends linkjs
// pfraze 2012

(function (exports) {
	
	// Broadcaster
	// ===========
	// a wrapper for event-streams
	function Broadcaster() {
		this.streams = [];
	}

	// listener management
	Broadcaster.prototype.addStream = function(responseStream) {
		this.streams.push(responseStream);
		// :TODO listen for close?
	};
	Broadcaster.prototype.endStream = function(responseStream) {
		this.streams = this.streams.filter(function(rS) { return rS != responseStream; });
		responseStream.end();
	};
	Broadcaster.prototype.endAllStreams = function() {
		this.streams.forEach(function(rS) { rS.end(); });
		this.streams.length = 0;
	};

	// sends an event to all streams
	Broadcaster.prototype.emit = function(eventName, data) {
		this.streams.forEach(function(rS) { this.emitTo(rS, eventName, data); }, this);
	};

	// sends an event to the given response stream
	Broadcaster.prototype.emitTo = function(responseStream, eventName, data) {
		responseStream.write({ event:eventName, data:data });
	};

	// wrap helper
	function broadcaster() {
		return new Broadcaster();
	}

	exports.Broadcaster = Broadcaster;
	exports.broadcaster = broadcaster;
})(Link);// Responder
// =========
// extends linkjs
// pfraze 2012

(function (exports) {
	// responder sugar functions
	// =========================
	// this structure is used to build the various forms of the respond function
	// thanks to http://httpstatus.es/ for these descriptions
	var RESPONDER_FNS = {
		// information
		processing           : [102, 'server has received and is processing the request'],

		// success
		ok                   : [200, 'ok'],
		created              : [201, 'request has been fulfilled; new resource created'],
		accepted             : [202, 'request accepted, processing pending'],
		shouldBeOk           : [203, 'request processed, information may be from another source'],
		nonauthInfo          : [203, 'request processed, information may be from another source'],
		noContent            : [204, 'request processed, no content returned'],
		resetContent         : [205, 'request processed, no content returned, reset document view'],
		partialContent       : [206, 'partial resource return due to request header'],

		// redirection
		multipleChoices      : [300, 'multiple options for the resource delivered'],
		movedPermanently     : [301, 'this and all future requests directed to the given URI'],
		found                : [302, 'response to request found via alternative URI'],
		seeOther             : [303, 'response to request found via alternative URI'],
		notModified          : [304, 'resource has not been modified since last requested'],
		useProxy             : [305, 'content located elsewhere, retrieve from there'],
		switchProxy          : [306, 'subsequent requests should use the specified proxy'],
		temporaryRedirect    : [307, 'connect again to different uri as provided'],

		// client error
		badRequest           : [400, 'request cannot be fulfilled due to bad syntax'],
		unauthorized         : [401, 'authentication is possible but has failed'],
		forbidden            : [403, 'server refuses to respond to request'],
		notFound             : [404, 'requested resource could not be found'],
		methodNotAllowed     : [405, 'request method not supported by that resource'],
		notAcceptable        : [406, 'content not acceptable according to the Accept headers'],
		conflict             : [409, 'request could not be processed because of conflict'],
		gone                 : [410, 'resource is no longer available and will not be available again'],
		preconditionFailed   : [412, 'server does not meet request preconditions'],
		unsupportedMediaType : [415, 'server does not support media type'],
		teapot               : [418, 'I\'m a teapot'],
		enhanceYourCalm      : [420, 'rate limit exceeded'],
		unprocessableEntity  : [422, 'request unable to be followed due to semantic errors'],
		locked               : [423, 'resource that is being accessed is locked'],
		failedDependency     : [424, 'request failed due to failure of a previous request'],
		internalServerError  : [500, 'internal server error'],

		// server error
		serverError          : [500, 'internal server error'],
		notImplemented       : [501, 'server does not recognise method or lacks ability to fulfill'],
		badGateway           : [502, 'server received an invalid response from upstream server'],
		serviceUnavailable   : [503, 'server is currently unavailable'],
		unavailable          : [503, 'server is currently unavailable'],
		gatewayTimeout       : [504, 'gateway did not receive response from upstream server'],
		insufficientStorage  : [507, 'server is unable to store the representation'],
		notExtended          : [510, 'further extensions to the request are required']
	};

	var typeAliases = {
		'text'   : 'text/plain',
		'plain'  : 'text/plain',
		'json'   : 'application/json',
		'html'   : 'text/html',
		'xml'    : 'text/xml',
		'events-stream' : 'text/event-stream'
	};

	// Responder
	// =========
	// a protocol-helper for servers to easily fulfill requests
	// - `response` should be a `ServerResponse` object (given as the `response` param of the server's request handler fn)
	function Responder(response) {
		this.response = response;
	}

	// constructs and sends a response
	// - `status` may be a status integer or an array of `[status integer, reason string]`
	// - `type` may use an alias (such as 'html' for 'text/html' and 'json' for 'application/json')
	Responder.prototype.respond = function(status, type, headers) {
		var reason;
		if (Array.isArray(status)) {
			reason = status[1];
			status = status[0];
		}
		headers = headers || {};
		if (type)
			headers['content-type'] = (typeAliases[type] || type);
		this.response.writeHead(status, reason, headers);
		return this.response;
	};

	// add responder sugars
	for (var fnName in RESPONDER_FNS) {
		(function (status) {
			Responder.prototype[fnName] = function(type, headers) {
				return this.respond(status, type, headers);
			};
		})(RESPONDER_FNS[fnName]);
	}

	// sends the given response back verbatim
	// - if `writeHead` has been previously called, it will not change
	Responder.prototype.pipe = function(response, headersCB, bodyCb) {
		headersCB = headersCB || function(v) { return v; };
		bodyCb = bodyCb || function(v) { return v; };
		var self = this;
		return promise(response)
			.then(function(response) {
				if (!self.response.status) {
					// copy the header if we don't have one yet
					self.response.writeHead(response.status, response.reason, headersCB(response.headers));
				}
				if (response.body !== null && typeof response.body != 'undefined') { // already have the body?
					self.response.write(bodyCb(response.body));
				}
				if (response.on) {
					// wire up the stream
					response.on('data', function(data) {
						self.response.write(bodyCb(data));
					});
					response.on('end', function() {
						self.response.end();
					});
				} else {
					self.response.end();
				}
			})
			.except(function(err) {
				console.log('response piping error from upstream:', err);
				var ctype = err.response.headers['content-type'] || 'text/plain';
				var body = (ctype && err.response.body) ? err.response.body : '';
				self.badGateway(ctype).end(body);
			});
	};

	// creates a callback for a fixed response, used in promises
	Responder.prototype.cb = function(fnName, type, headers, body) {
		var fn = this[fnName]; var self = this;
		return function(v) {
			fn.call(self, type, headers).end(body);
			return v;
		};
	};

	// adds a type alias for use in the responder functions
	// - eg html -> text/html
	Responder.setTypeAlias = function(alias, mimetype) {
		typeAliases[alias] = mimetype;
	};

	// wrap helper
	function responder(res) {
		return (res instanceof Responder) ? res : new Responder(res);
	}

	exports.Responder = Responder;
	exports.responder = responder;
})(Link);// Router
// ======
// extends linkjs
// pfraze 2012

(function (exports) {
	// router sugar functions
	// ======================
	// this structure is used to build the various forms of the route function
	// - creates all possible combinations while maintaining order
	var ROUTER_FNS = ['p','pm','pma','pmat', 'pmta', 'pmt','pa','pt','m','ma','mat', 'mta', 'mt', 'mp', 'mpa', 'mpt', 'mpat', 'mpta', 'a','at','t'];
	var ROUTER_FNS_SELECTOR_MAP = {
		p:'path',
		m:'method',
		a:'accept',
		t:'content-type'
	};

	// definitions/helpers about the composition of the request object
	var nonheaders = ['path','method','query','body','stream'];
	function isHeader(key) {
		return (nonheaders.indexOf(key) === -1);
	}
	function getRequestValue(request, key) {
		if (isHeader(key)) {
			if (request.headers) {
				return request.headers[key];
			}
			return null;
		}
		return request[key];
	}

	// array helper
	function has(arr, v) { return (arr.indexOf(v) !== -1); }

	function convertSelectorToRegexp(selector) {
		if (selector instanceof RegExp) { return selector; }
		// arrays are ORed together (`['a','b','c']`->`/a|b|c/`)
		if (Array.isArray(selector)) { return new RegExp('^'+selector.join('|')+'$', 'gi'); }
		return new RegExp('^'+selector+'$', 'gi');
	}

	// Router
	// ======
	// a message -> behavior routing helper for servers
	// - `request` should be the `request` param of the server's request handler fn
	function Router(request) {
		this.request   = request;
		this.isRouted  = false; // has one of the routes hit yet?
		this.bestMatch = []; // a set of parameters which were hit during our closest match
	}

	// calls the given cb if the request matches the given selectors
	Router.prototype.route = function(selectors, cb) {
		// sanity check
		if (typeof cb !== 'function') {
			throw new Error('a handler callback must be given to the route');
		}

		if (this.isRouted) { return this; } // no more routing

		// test the request against selectors
		var m, v, selector;
		var matchedResults = {}, matchedKeys = [];
		var isMatch = true;
		for (var key in selectors) {
			// extract testing data
			selector = selectors[key];
			v = getRequestValue(this.request, key);

			// make sure all paths start with a /
			if (key == 'path' && v.charAt(0) != '/') {
				v = '/' + v;
			}

			// run test
			m = selector.exec(v);

			if (m !== null && m !== false) { // match
				matchedResults[key] = m;
				matchedKeys.push(key);
			} else { // miss
				isMatch = false;
				// best match is the match the most valid keys
				// - gives preference to path and method hits
				// :NOTE: child matches (that is, matches made in the callback) do not currently include the parent's bestMatch
				if ((has(matchedKeys, 'path') || has(matchedKeys, 'method')) && matchedKeys.length > this.bestMatch.length) {
					this.bestMatch = matchedKeys;
				}
			}
		}

		if (isMatch) {
			// successful match, run the callback
			cb.call(this, matchedResults);
			this.isRouted = true;
		}
		
		return this;
	};

	// error-response generator
	// - uses the partial match history to construct an intelligent response (eg if a url hit once, it's not a 404)
	// - should be called at the end of a routing structure
	// - add parameter names to `ignores` to assume those parameters did match
	//   (corrects sub-routing error-reporting, where parent matches to the callback are not included)
	Router.prototype.error = function(response, ignores) {
		if (this.isRouted) { return this; }
		var respond = Link.responder(response);
		var bestMatch = this.bestMatch.concat(ignores);
		if      (!has(bestMatch, 'path')) { respond.notFound().end(); }
		else if (!has(bestMatch, 'method')) { respond.methodNotAllowed().end(); }
		else if (!has(bestMatch, 'content-type') && this.request.body ) { respond.unsupportedMediaType().end(); }
		else if (!has(bestMatch, 'accept') && this.request.headers.accept) { respond.notAcceptable().end(); }
		else    { respond.badRequest().end(); }
	};

	// add router sugars
	ROUTER_FNS.forEach(function addRouterFn(fnName) {
		// build an array of selector names
		// eg 'rma' -> `['url','method','accept']`
		var selectors = fnName.split('').map(function(abbrev) { return ROUTER_FNS_SELECTOR_MAP[abbrev]; });
		// add function
		Router.prototype[fnName] = function() {
			// build the `route` call out of the function name by mapping the parameters to a selector object
			// eg `rma = function(url, method, accept, cb)` -> `route({ url:arg0, method:arg1, accept:arg2 }, arg3)`
			var selectorStructure = {};
			var argIndex=0;
			for (argIndex; argIndex < selectors.length; argIndex++) {
				var selector = selectors[argIndex];
				selectorStructure[selector] = convertSelectorToRegexp(arguments[argIndex]);
			}
			var cb = arguments[argIndex];
			return this.route(selectorStructure, cb);
		};
	});

	// adds a type alias for use in the responder functions
	// - eg html -> text/html
	Router.setTypeAlias = function(alias, mimetype) {
		typeAliases[alias] = mimetype;
	};

	// wrap helper
	function router(request) {
		return (request instanceof Router) ? request : new Router(request);
	}

	exports.Router = Router;
	exports.router = router;
})(Link);