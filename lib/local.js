// promises
// ========
// pfraze 2013

(function () {
	var exports = this;
	if (typeof window !== "undefined") {
		if (typeof window.local == 'undefined')
			window.local = {};
		exports = window.local;
	} else if (typeof self !== "undefined") {
		if (typeof self.local == 'undefined')
			self.local = {};
		exports = self.local;
	} else if (typeof module !== "undefined") {
		exports = module.exports;
	}

	function passThrough(v) { return v; }
	function isPromiselike(p) {
		return (p && typeof p.then == 'function');
	}

	// Promise
	// =======
	// EXPORTED
	// Monadic function chaining around asynchronously-fulfilled values
	// - conformant with the promises/a+ spec
	// - better to use the `promise` function to construct
	function Promise(value) {
		this.succeedCBs = []; // used to notify about fulfillments
		this.failCBs = []; // used to notify about rejections
		this.__hasValue = false;
		this.__hasFailed = false;
		this.value = undefined;
		if (value)
			this.fulfill(value);
	}
	Promise.prototype.isUnfulfilled = function() { return !this.__hasValue; };
	Promise.prototype.isRejected = function() { return this.__hasFailed; };
	Promise.prototype.isFulfilled = function() { return (this.__hasValue && !this.__hasFailed); };

	// helper function to execute `then` behavior
	function execCallback(parentPromise, targetPromise, fn) {
		if (fn === null) {
			if (parentPromise.isRejected())
				targetPromise.reject(parentPromise.value);
			else
				targetPromise.fulfill(parentPromise.value);
		} else {
			var newValue;
			try { newValue = fn(parentPromise.value); }
			catch (e) {
				if (e instanceof Error) {
					if (console.error)
						console.error(e, e.stack);
					else console.log("Promise exception thrown", e, e.stack);
				}
				targetPromise.reject(e);
			}

			if (isPromiselike(newValue))
				promise(newValue).chain(targetPromise);
			else
				targetPromise.fulfill(newValue);
		}
	}

	// add a 'succeed' and an 'fail' function to the sequence
	Promise.prototype.then = function(succeedFn, failFn) {
		succeedFn = (succeedFn && typeof succeedFn == 'function') ? succeedFn : null;
		failFn    = (failFn    && typeof failFn == 'function')    ? failFn    : null;

		var p = promise();
		if (this.isUnfulfilled()) {
			this.succeedCBs.push({ p:p, fn:succeedFn });
			this.failCBs.push({ p:p, fn:failFn });
		} else {
			var self = this;
			setTimeout(function() {
				if (self.isFulfilled())
					execCallback(self, p, succeedFn);
				else
					execCallback(self, p, failFn);
			}, 0);
		}
		return p;
	};

	// add a non-error function to the sequence
	// - will be skipped if in 'error' mode
	Promise.prototype.succeed = function(fn) {
		if (this.isRejected()) {
			return this;
		} else {
			var args = Array.prototype.slice.call(arguments, 1);
			return this.then(function(v) {
				return fn.apply(null, [v].concat(args));
			});
		}
	};

	// add an error function to the sequence
	// - will be skipped if in 'non-error' mode
	Promise.prototype.fail = function(fn) {
		if (this.isFulfilled()) {
			return this;
		} else {
			var args = Array.prototype.slice.call(arguments, 1);
			return this.then(null, function(v) {
				return fn.apply(null, [v].concat(args));
			});
		}
	};

	// add a function to the success and error paths of the sequence
	Promise.prototype.always = function(fn) {
		return this.then(fn, fn);
	};

	// sets the promise value, enters 'succeed' mode, and executes any queued `then` functions
	Promise.prototype.fulfill = function(value) {
		if (this.isUnfulfilled()) {
			this.value = value;
			this.__hasValue = true;
			for (var i=0; i < this.succeedCBs.length; i++) {
				var cb = this.succeedCBs[i];
				execCallback(this, cb.p, cb.fn);
			}
			this.succeedCBs.length = 0;
			this.failCBs.length = 0;
		}
		return this;
	};

	// sets the promise value, enters 'error' mode, and executes any queued `then` functions
	Promise.prototype.reject = function(err) {
		if (this.isUnfulfilled()) {
			this.value = err;
			this.__hasValue = true;
			this.__hasFailed = true;
			for (var i=0; i < this.failCBs.length; i++) {
				var cb = this.failCBs[i];
				execCallback(this, cb.p, cb.fn);
			}
			this.succeedCBs.length = 0;
			this.failCBs.length = 0;
		}
		return this;
	};

	// releases all of the remaining references in the prototype chain
	// - to be used in situations where promise handling will not continue, and memory needs to be freed
	Promise.prototype.cancel = function() {
		// propagate the command to promises later in the chain
		var i;
		for (i=0; i < this.succeedCBs.length; i++) {
			this.succeedCBs[i].p.cancel();
		}
		for (i=0; i < this.failCBs.length; i++) {
			this.failCBs[i].p.cancel();
		}
		// free up memory
		this.succeedCBs.length = 0;
		this.failCBs.length = 0;
		return this;
	};

	// sets up the given promise to fulfill/reject upon the method-owner's fulfill/reject
	Promise.prototype.chain = function(otherPromise) {
		this.then(
			function(v) {
				promise(otherPromise).fulfill(v);
				return v;
			},
			function(err) {
				promise(otherPromise).reject(err);
				return err;
			}
		);
		return otherPromise;
	};

	// provides a node-style function for fulfilling/rejecting based on the (err, result) pattern
	Promise.prototype.cb = function(err, value) {
		if (err)
			this.reject(err);
		else
			this.fulfill((typeof value == 'undefined') ? null : value);
	};

	// bundles an array of promises into a single promise that requires none to succeed for a pass
	// - `shouldFulfillCB` is called with (results, fails) to determine whether to fulfill or reject
	function bundle(ps, shouldFulfillCB) {
		if (!Array.isArray(ps)) ps = [ps];
		var p = promise(), nPromises = ps.length, nFinished = 0;
		if (nPromises === 0) {
			p.fulfill([]);
			return p;
		}

		var results = []; results.length = nPromises;
		var fails = [];
		var addResult = function(v, index, isfail) {
			results[index] = v;
			if (isfail) fails.push(index);
			if ((++nFinished) == nPromises) {
				if (!shouldFulfillCB) p.fulfill(results);
				else if (shouldFulfillCB(results, fails)) p.fulfill(results);
				else p.reject(results);
			}
		};
		for (var i=0; i < nPromises; i++)
			promise(ps[i]).succeed(addResult, i, false).fail(addResult, i, true);
		return p;
	}

	// bundles an array of promises into a single promise that requires all to succeed for a pass
	function all(ps) {
		return bundle(ps, function(results, fails) {
			return fails.length === 0;
		});
	}

	// bundles an array of promises into a single promise that requires one to succeed for a pass
	function any(ps) {
		return bundle(ps, function(results, fails) {
			return fails.length < results.length;
		});
	}

	// promise creator
	// - behaves like a guard, ensuring `v` is a promise
	// - if multiple arguments are given, will provide a promise that encompasses all of them
	//   - containing promise always succeeds
	function promise(v) {
		if (arguments.length > 1)
			return bundle(Array.prototype.slice.call(arguments));
		if (v instanceof Promise)
			return v;
		if (isPromiselike(v)) {
			var p = promise();
			v.then(function(v2) { p.fulfill(v2); }, function(v2) { p.reject(v2); });
			return p;
		}
		return new Promise(v);
	}

	exports.Promise = Promise;
	exports.promise = promise;
	exports.promise.bundle = bundle;
	exports.promise.all = all;
	exports.promise.any = any;
})();

if (typeof define !== "undefined") {
	define([], function() {
		return Promise;
	});
}// Local Utilities
// ===============
// pfraze 2013

if (typeof this.local == 'undefined')
	this.local = {};
if (typeof this.local.util == 'undefined')
	this.local.util = {};

(function() {// EventEmitter
// ============
// EXPORTED
// A minimal event emitter, based on the NodeJS api
// initial code borrowed from https://github.com/tmpvar/node-eventemitter (thanks tmpvar)
function EventEmitter() {
	Object.defineProperty(this, '_events', {
		value: {},
		configurable: true,
		enumerable: false
	});
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

local.util.EventEmitter = EventEmitter;})();// Local HTTP
// ==========
// pfraze 2013

if (typeof this.local == 'undefined')
	this.local = {};
if (typeof this.local.http == 'undefined')
	this.local.http = {};
if (typeof this.local.http.ext == 'undefined')
	this.local.http.ext = {};

(function() {
	function noop() {}// Helpers
// =======

// EXPORTED
// breaks a link header into a javascript object
local.http.parseLinkHeader = function parseLinkHeader(headerStr) {
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
local.http.lookupLink = function lookupLink(links, rel, title) {
	var len = links ? links.length : 0;
	if (!len) { return null; }

	if (title)
		title = title.toLowerCase();
	var relRegex = RegExp('\\b'+rel+'\\b');

	// try to find the link with a title equal to the param we were given
	var match = null;
	for (var i=0; i < len; i++) {
		var link = links[i];
		if (!link) { continue; }
		// find all links with a matching rel
		if (relRegex.test(link.rel)) {
			// look for a title match to the primary parameter
			if (title && link.title) {
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
local.http.joinUrl = function joinUrl() {
	var parts = Array.prototype.map.call(arguments, function(arg) {
		var lo = 0, hi = arg.length;
		if (arg.charAt(0) === '/')      { lo += 1; }
		if (arg.charAt(hi - 1) === '/') { hi -= 1; }
		return arg.substring(lo, hi);
	});
	return parts.join('/');
};

// EXPORTED
// converts any known header objects into their string versions
local.http.serializeRequestHeaders = function(headers) {
	if (headers.authorization && typeof headers.authorization == 'object') {
		if (!headers.authorization.scheme) { throw "`scheme` required for auth headers"; }
		var auth;
		switch (headers.authorization.scheme.toLowerCase()) {
			case 'basic':
				auth = 'Basic '+btoa(headers.authorization.name+':'+headers.authorization.password);
				break;
			case 'persona':
				auth = 'Persona name='+headers.authorization.name+' assertion='+headers.authorization.assertion;
				break;
			default:
				throw "unknown auth sceme: "+headers.authorization.scheme;
		}
		headers.authorization = auth;
	}
};

// EXPORTED
// parseUri 1.2.2, (c) Steven Levithan <stevenlevithan.com>, MIT License
local.http.parseUri = function parseUri(str) {
	if (typeof str === 'object') {
		if (str.url) { str = str.url; }
		else if (str.host || str.path) { str = local.http.joinUrl(req.host, req.path); }
	}
	var	o   = local.http.parseUri.options,
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

local.http.parseUri.options = {
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


// sends the given response back verbatim
// - if `writeHead` has been previously called, it will not change
// - params:
//   - `target`: the response to populate
//   - `source`: the response to pull data from
//   - `headersCb`: (optional) takes `(headers)` from source and responds updated headers for target
//   - `bodyCb`: (optional) takes `(body)` from source and responds updated body for target
local.http.pipe = function(target, source, headersCB, bodyCb) {
	headersCB = headersCB || function(v) { return v; };
	bodyCb = bodyCb || function(v) { return v; };
	return local.promise(source)
		.succeed(function(source) {
			if (!target.status) {
				// copy the header if we don't have one yet
				target.writeHead(source.status, source.reason, headersCB(source.headers));
			}
			if (source.body !== null && typeof source.body != 'undefined') { // already have the body?
				target.write(bodyCb(source.body));
			}
			if (source.on && source.isConnOpen) {
				// wire up the stream
				source.on('data', function(data) {
					target.write(bodyCb(data));
				});
				source.on('end', function() {
					target.end();
				});
			} else {
				target.end();
			}
			return target;
		})
		.fail(function(source) {
			var ctype = source.headers['content-type'] || 'text/plain';
			var body = (ctype && source.body) ? source.body : '';
			target.writeHead(502, 'bad gateway', {'content-type':ctype});
			target.end(body);
			throw source;
		});
};// contentTypes
// ============
// EXPORTED
// provides serializers and deserializers for MIME types
var contentTypes = {
	serialize   : contentTypes__serialize,
	deserialize : contentTypes__deserialize,
	register    : contentTypes__register
};
var contentTypes__registry = {};
local.http.contentTypes = contentTypes;

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
		if (types[i] in contentTypes__registry)
			return contentTypes__registry[types[i]][fn];
	}
	return null;
}

// Default Types
// =============
local.http.contentTypes.register('application/json',
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
local.http.contentTypes.register('application/x-www-form-urlencoded',
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
);// Core
// ====
// :KNOWN BUGS:
// - currently, Firefox is not able to retrieve response headers over CORS

// stores local server functions
var __httpl_registry = {};

// request dispatcher func
// - used in workers to transport requests to the parent for routing
var __customRequestDispatcher = null;

// the directory of the environment context
var __windowLocationDirname = (typeof window != 'undefined') ? window.location.pathname.split('/') : [''];
__windowLocationDirname[__windowLocationDirname.length - 1] = '';
__windowLocationDirname = __windowLocationDirname.join('/');

// fulfills/reject a promise for a response with the given response
function fulfillResponsePromise(promise, response) {
	// wasnt streaming, fulfill now that full response is collected
	if (response.status >= 200 && response.status < 400)
		promise.fulfill(response);
	else if (response.status >= 400 && response.status < 600 || response.status === 0)
		promise.reject(response);
	else
		promise.fulfill(response); // :TODO: 1xx protocol handling
}

// dispatch()
// ==========
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
local.http.dispatch = function dispatch(req) {
	// sanity check
	if (!req) { throw "no req param provided to request"; }

	// sane defaults & sanitization
	req.headers = req.headers || {};
	req.query = req.query || {};
	req.method = (req.method) ? req.method.toUpperCase() : 'GET';

	// dispatch behavior override
	// (used by workers to send requests to the parent document for routing)
	if (__customRequestDispatcher)
		return __customRequestDispatcher(req);

	// parse the url
	// (urld = url description)
	if (!req.url)
		req.url = local.http.joinUrl(req.host, req.path);
	if (!req.urld)
		req.urld = local.http.parseUri(req.url);
	if (!req.urld)
		throw "no URL or host/path provided in request";

	// prepend host on relative path
	if (!req.urld.protocol) {
		if (req.url.length > 0 && req.url.charAt(0) != '/') {
			// relative to current dirname
			req.url = window.location.protocol + "//" + window.location.host + __windowLocationDirname + req.url;
		} else {
			// relative to current hose
			req.url = window.location.protocol + "//" + window.location.host + req.url;
		}
		req.urld = local.http.parseUri(req.url);
	}

	// execute (asyncronously) by protocol
	var resPromise = local.promise();
	if (req.urld.protocol == 'httpl')
		setTimeout(function() { __dispatchLocal(req, resPromise); }, 0);
	else if (req.urld.protocol == 'http' || req.urld.protocol == 'https')
		setTimeout(function() { __dispatchRemote(req, resPromise); }, 0);
	else if (req.urld.protocol == 'data')
		setTimeout(function() { __dispatchData(req, resPromise); }, 0);
	else {
		var res = new ClientResponse(0, 'unsupported protocol "'+req.urld.protocol+'"');
		resPromise.reject(res);
		res.end();
	}
	return resPromise;
};

// executes a request locally
function __dispatchLocal(req, resPromise) {

	// find the local server
	var server = __httpl_registry[req.urld.host];
	if (!server) {
		var res = new ClientResponse(404, 'server not found');
		resPromise.reject(res);
		res.end();
		return;
	}

	// rebuild the request
	// :NOTE: could just pass `req`, but would rather be explicit about what a local server receives
	//        (you want me to be... explicit?)
	var req2 = {
		path    : req.urld.path,
		method  : req.method,
		query   : req.query || {},
		headers : req.headers || {},
		body    : req.body,
		stream  : req.stream
	};

	// standardize the path
	if (!req2.path) req2.path = '/';
	else req2.path = req2.path.replace(/(.)\/$/, '$1'); // no trailing slash

	// if the urld has query parameters, mix them into the request's query object
	if (req.urld.query) {
		var q = local.http.contentTypes.deserialize(req.urld.query, 'application/x-www-form-urlencoded');
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
		var q = local.http.contentTypes.serialize(req.query, 'application/x-www-form-urlencoded');
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

	if (typeof window != 'undefined')
		__dispatchRemoteBrowser(req, resPromise);
	else
		__dispatchRemoteNodejs(req, resPromise);
}

// executes a remote request in the browser
function __dispatchRemoteBrowser(req, resPromise) {

	// assemble the final url
	var url = ((req.urld.protocol) ? (req.urld.protocol + '://') : '') + req.urld.authority + req.urld.relative;

	// make sure our payload is serialized
	local.http.serializeRequestHeaders(req.headers);
	if (req.body !== null && typeof req.body != 'undefined') {
		req.headers['content-type'] = req.headers['content-type'] || 'application/json';
		if (typeof req.body !== 'string') {
			req.body = local.http.contentTypes.serialize(req.body, req.headers['content-type']);
		}
	}

	// create the request
	var xhrRequest = new XMLHttpRequest();
	xhrRequest.open(req.method, url, true);

	for (var k in req.headers) {
		if (req.headers[k] !== null && req.headers.hasOwnProperty(k))
			xhrRequest.setRequestHeader(k, req.headers[k]);
	}

	var clientResponse, streamPoller=0, lenOnLastPoll=0;
	xhrRequest.onreadystatechange = function() {
		if (xhrRequest.readyState >= XMLHttpRequest.HEADERS_RECEIVED && !clientResponse) {
			clientResponse = new ClientResponse(xhrRequest.status, xhrRequest.statusText);
			clientResponse.on('close', function() {
				if (xhrRequest.readyState !== XMLHttpRequest.DONE)
					xhrRequest.abort();
			});

			if (xhrRequest.getAllResponseHeaders()) {
				xhrRequest.getAllResponseHeaders().split("\n").forEach(function(h) {
					if (!h) { return; }
					var kv = h.toLowerCase().replace('\r','').split(': ');
					clientResponse.headers[kv[0]] = kv[1];
				});
			} else {
				// a bug in firefox causes getAllResponseHeaders to return an empty string on CORS
				// (not ideal, but) iterate the likely headers
				var extractHeader = function(k) {
					var v = xhrRequest.getResponseHeader(k);
					if (v)
						clientResponse.headers[k.toLowerCase()] = v.toLowerCase();
				};
				extractHeader('Accept-Ranges');
				extractHeader('Age');
				extractHeader('Allow');
				extractHeader('Cache-Control');
				extractHeader('Connection');
				extractHeader('Content-Encoding');
				extractHeader('Content-Language');
				extractHeader('Content-Length');
				extractHeader('Content-Location');
				extractHeader('Content-MD5');
				extractHeader('Content-Disposition');
				extractHeader('Content-Range');
				extractHeader('Content-Type');
				extractHeader('Date');
				extractHeader('ETag');
				extractHeader('Expires');
				extractHeader('Last-Modified');
				extractHeader('Link');
				extractHeader('Location');
				extractHeader('Pragma');
				extractHeader('Refresh');
				extractHeader('Retry-After');
				extractHeader('Server');
				extractHeader('Set-Cookie');
				extractHeader('Trailer');
				extractHeader('Transfer-Encoding');
				extractHeader('Vary');
				extractHeader('Via');
				extractHeader('Warning');
				extractHeader('WWW-Authenticate');
			}

			// parse any headers we need
			if (clientResponse.headers.link)
				clientResponse.headers.link = local.http.parseLinkHeader(clientResponse.headers.link);

			if (req.stream) {
				// streaming, fulfill ahead of response close
				fulfillResponsePromise(resPromise, clientResponse);

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
			if (streamPoller)
				clearInterval(streamPoller);
			clientResponse.write(xhrRequest.responseText, true);
			clientResponse.end();

			if (!req.stream) {
				// wasnt streaming, fulfill now that full response is collected
				fulfillResponsePromise(resPromise, clientResponse);
			}

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

// fulfills a request to a data-uri with the contents of the data uri
function __dispatchData(req, resPromise) {

	// parse out the uri
	var firstColonIndex = req.url.indexOf(':');
	var firstCommaIndex = req.url.indexOf(',');

	var params = req.url.slice(firstColonIndex+1, firstCommaIndex).split(';');
	var contentType = params.shift();
	var isBase64 = false;
	while (params.length) {
		var param = params.shift();
		if (param == 'base64')
			isBase64 = true;
	}

	var data = req.url.slice(firstCommaIndex+1);
	if (!data)
		data = '';
	if (isBase64)
		data = atob(data);
	else
		data = decodeURIComponent(data);

	var res = new ServerResponse(resPromise);
	res.writeHead(200, 'ok', {'content-type': contentType});
	res.end(data);
}

// EXPORTED
// allows the API consumer to dispatch requests with their own code
// - mainly for workers to submit requests to the document for routing
local.http.setRequestDispatcher = function setRequestDispatcher(fn) {
	__customRequestDispatcher = fn;
};

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
	local.util.EventEmitter.call(this);

	this.status = status;
	this.reason = reason;
	this.headers = {};
	this.body = null;
	this.isConnOpen = true;
}
local.http.ClientResponse = ClientResponse;
ClientResponse.prototype = Object.create(local.util.EventEmitter.prototype);

// adds data to the response stream
// - if `overwrite` is false, will append to accumulated response
// - if `overwrite` is true, will overwrite the accumulated response
//   - but the 'data' event will only include the data that was new to the response's accumulation
//     (that is, if this.body=='foo', and response.write('foobar', true), the 'data' event will include 'bar' only)
ClientResponse.prototype.write = function(data, overwrite) {
	if (!this.isConnOpen)
		return;
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
	if (!this.isConnOpen)
		return;
	// now that we have it all, try to deserialize the payload
	this.__deserialize();
	this.isConnOpen = false;
	this.emit('end');
	this.close();
};

// clients can use this to stop receiving events
ClientResponse.prototype.close = function() {
	if (!this.isConnOpen)
		return;
	this.isConnOpen = false;
	this.emit('close');
	this.removeAllListeners('data');
	this.removeAllListeners('end');
	this.removeAllListeners('close');
};

// this helper is called when the data finishes coming down
ClientResponse.prototype.__deserialize = function() {
	// convert from string to an object (if we have a deserializer available)
	if (typeof this.body == 'string')
		this.body = local.http.contentTypes.deserialize(this.body, this.headers['content-type']);
};

// ServerResponse
// ==============
// EXPORTED
// Interface for local servers to respond to requests
// - generated internally and given to local servers
// - not given to clients; instead, interfaces with the ClientResponse given to the client
function ServerResponse(resPromise, isStreaming) {
	local.util.EventEmitter.call(this);

	this.resPromise  = resPromise;
	this.isStreaming = isStreaming;
	this.clientResponse = new ClientResponse();
}
local.http.ServerResponse = ServerResponse;
ServerResponse.prototype = Object.create(local.util.EventEmitter.prototype);

// writes the header to the response
// if streaming, will notify the client
ServerResponse.prototype.writeHead = function(status, reason, headers) {
	// setup client response
	this.clientResponse.status = status;
	this.clientResponse.reason = reason;
	if (headers) {
		for (var k in headers) {
			if (headers.hasOwnProperty(k))
				this.setHeader(k, headers[k]);
		}
	}

	// fulfill/reject
	if (this.isStreaming) { fulfillResponsePromise(this.resPromise, this.clientResponse); }
	return this;
};

// header access/mutation fns
ServerResponse.prototype.setHeader    = function(k, v) { this.clientResponse.headers[k] = v; };
ServerResponse.prototype.getHeader    = function(k) { return this.clientResponse.headers[k]; };
ServerResponse.prototype.removeHeader = function(k) { delete this.clientResponse.headers[k]; };

// writes data to the response
// if streaming, will notify the client
ServerResponse.prototype.write = function(data) {
	this.clientResponse.write(data, false);
	return this;
};

// ends the response, optionally writing any final data
ServerResponse.prototype.end = function(data) {
	// write any remaining data
	if (data) { this.write(data); }

	this.clientResponse.end();
	this.emit('close');
	this.removeAllListeners('close');

	// fulfill/reject now if we had been buffering the response
	if (!this.isStreaming)
		fulfillResponsePromise(this.resPromise, this.clientResponse);

	return this;
};

// functions added just to compat with nodejs
ServerResponse.prototype.writeContinue = noop;
ServerResponse.prototype.addTrailers   = noop;
ServerResponse.prototype.sendDate      = noop; // :TODO: is this useful?


// registerLocal()
// ===============
// EXPORTED
// adds a server to the httpl registry
local.http.registerLocal = function registerLocal(domain, server, serverContext) {
	var urld = local.http.parseUri(domain);
	if (urld.protocol && urld.protocol !== 'httpl') throw "registerLocal can only add servers to the httpl protocol";
	if (!urld.host) throw "invalid domain provided to registerLocal";
	if (__httpl_registry[urld.host]) throw "server already registered at domain given to registerLocal";
	__httpl_registry[urld.host] = { fn:server, context:serverContext };
};

// unregisterLocal()
// =================
// EXPORTED
// removes a server from the httpl registry
local.http.unregisterLocal = function unregisterLocal(domain) {
	var urld = local.http.parseUri(domain);
	if (!urld.host) {
		throw "invalid domain provided toun registerLocal";
	}
	if (__httpl_registry[urld.host]) {
		delete __httpl_registry[urld.host];
	}
};

// getLocal()
// ==========
// EXPORTED
// retrieves a server from the httpl registry
local.http.getLocal = function getLocal(domain) {
	var urld = local.http.parseUri(domain);
	if (!urld.host) {
		throw "invalid domain provided toun registerLocal";
	}
	return __httpl_registry[urld.host];
};

// getLocalRegistry()
// ==================
// EXPORTED
// retrieves the httpl registry
local.http.getLocalRegistry = function getLocalRegistry() {
	return __httpl_registry;
};// Events
// ======
// :NOTE: currently, Chrome does not support event streams with CORS

// the directory of the environment context
var __windowLocationDirname = (typeof window != 'undefined') ? window.location.pathname.split('/') : [''];
__windowLocationDirname[__windowLocationDirname.length - 1] = '';
__windowLocationDirname = __windowLocationDirname.join('/');

// event subscriber func
// - used in workers to transport subscribes to the parent for routing
var __customEventSubscriber = null;

// subscribe()
// ===========
// EXPORTED
// Establishes a connection and begins an event stream
// - sends a GET request with 'text/event-stream' as the Accept header
// - `req` param:
//   - requires the target url
//   - target url can be passed in req as `url`, or generated from `host` and `path`
// - returns a `EventStream` object
local.http.subscribe = function subscribe(req) {

	if (!req) { throw "no options provided to subscribe"; }
	if (typeof req == 'string') {
		req = { url:req };
	}

	// subscribe behavior override
	// (used by workers to send subscribes to the parent document for routing)
	if (__customEventSubscriber)
		return __customEventSubscriber(req);

	// parse the url
	// (urld = url description)
	if (!req.url)
		req.url = local.http.joinUrl(req.host, req.path);
	req.urld = local.http.parseUri(req.url);
	if (!req.urld)
		throw "no URL or host/path provided in request";

	// prepend host on relative path
	if (!req.urld.protocol) {
		if (req.url.length > 0 && req.url.charAt(0) != '/') {
			// relative to current dirname
			req.url = window.location.protocol + "//" + window.location.host + __windowLocationDirname + req.url;
		} else {
			// relative to current hose
			req.url = window.location.protocol + "//" + window.location.host + req.url;
		}
		req.urld = local.http.parseUri(req.url);
	}

	// execute according to protocol
	if (req.urld.protocol == 'httpl')
		return __subscribeLocal(req);
	else
		return __subscribeRemote(req);
};

// subscribes to a local host
function __subscribeLocal(req) {

	// initiate the event stream
	var stream = new LocalEventStream(local.http.dispatch({
		method  : 'get',
		url     : 'httpl://' + req.urld.authority + req.urld.relative,
		headers : { accept : 'text/event-stream' },
		stream  : true
	}));
	return stream;
}

// subscribes to a remote host
function __subscribeRemote(req) {
	if (typeof window != 'undefined')
		return __subscribeRemoteBrowser(req);
	else
		return __subscribeRemoteNodejs(req);
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
local.http.setEventSubscriber = function setEventSubscriber(fn) {
	__customEventSubscriber = fn;
};

// EventStream
// ===========
// EXPORTED
// provided by subscribe() to manage the events
function EventStream() {
	local.util.EventEmitter.call(this);
	this.isConnOpen = true;
}
local.http.EventStream = EventStream;
EventStream.prototype = Object.create(local.util.EventEmitter.prototype);
EventStream.prototype.close = function() {
	this.isConnOpen = false;
	this.emit('close');
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
	this.response = null;

	// wait for the promise
	var self = this;
	resPromise.then(
		function(response) {
			self.response = response;
			response.on('data', function(payload) {
				self.__emitEvent(payload);
			});
			response.on('end', function() {
				self.close();
			});
		},
		function(response) {
			self.__emitError({ event:'error', data:response });
			self.close();
		}
	);
}
local.http.LocalEventStream = LocalEventStream;
LocalEventStream.prototype = Object.create(EventStream.prototype);
LocalEventStream.prototype.close = function() {
	this.__emitError({ event:'error', data:undefined }); // :NOTE: emulating the behavior of EventSource
	// :TODO: would be great if close didn't emit the above error
	EventStream.prototype.close.call(this);
	if (this.response)
		this.response.close();
	this.response = null;
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
		if (e.target.readyState == EventSource.CLOSED)
			self.close();
	};
}
local.http.BrowserRemoteEventStream = BrowserRemoteEventStream;
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
	local.util.EventEmitter.prototype.addListener.call(this, type, listener);
};
BrowserRemoteEventStream.prototype.on = BrowserRemoteEventStream.prototype.addListener;
BrowserRemoteEventStream.prototype.close = function() {
	this.eventSource.close();
	this.eventSource.onerror = null;
	this.eventSource = null;
	EventStream.prototype.close.call(this);
};

// Broadcaster
// ===========
// EXPORTED
// a wrapper for event-streams
function Broadcaster() {
	this.streams = [];
}
local.http.Broadcaster = Broadcaster;

// listener management
Broadcaster.prototype.addStream = function(responseStream) {
	this.streams.push(responseStream);
	var self = this;
	responseStream.clientResponse.on('close', function() {
		self.endStream(responseStream);
	});
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
local.http.broadcaster = function() {
	return new Broadcaster();
};/*
 UriTemplate Copyright (c) 2012-2013 Franz Antesberger. All Rights Reserved.
 Available via the MIT license.
*/

(function (exportCallback) {
    "use strict";

var UriTemplateError = (function () {

    function UriTemplateError (options) {
        this.options = options;
    }

    UriTemplateError.prototype.toString = function () {
        if (JSON && JSON.stringify) {
            return JSON.stringify(this.options);
        }
        else {
            return this.options;
        }
    };

    return UriTemplateError;
}());

var objectHelper = (function () {
    function isArray (value) {
        return Object.prototype.toString.apply(value) === '[object Array]';
    }

    function isString (value) {
        return Object.prototype.toString.apply(value) === '[object String]';
    }
    
    function isNumber (value) {
        return Object.prototype.toString.apply(value) === '[object Number]';
    }
    
    function isBoolean (value) {
        return Object.prototype.toString.apply(value) === '[object Boolean]';
    }
    
    function join (arr, separator) {
        var
            result = '',
            first = true,
            index;
        for (index = 0; index < arr.length; index += 1) {
            if (first) {
                first = false;
            }
            else {
                result += separator;
            }
            result += arr[index];
        }
        return result;
    }

    function map (arr, mapper) {
        var
            result = [],
            index = 0;
        for (; index < arr.length; index += 1) {
            result.push(mapper(arr[index]));
        }
        return result;
    }

    function filter (arr, predicate) {
        var
            result = [],
            index = 0;
        for (; index < arr.length; index += 1) {
            if (predicate(arr[index])) {
                result.push(arr[index]);
            }
        }
        return result;
    }

    function deepFreezeUsingObjectFreeze (object) {
        if (typeof object !== "object" || object === null) {
            return object;
        }
        Object.freeze(object);
        var property, propertyName;
        for (propertyName in object) {
            if (object.hasOwnProperty(propertyName)) {
                property = object[propertyName];
                // be aware, arrays are 'object', too
                if (typeof property === "object") {
                    deepFreeze(property);
                }
            }
        }
        return object;
    }

    function deepFreeze (object) {
        if (typeof Object.freeze === 'function') {
            return deepFreezeUsingObjectFreeze(object);
        }
        return object;
    }


    return {
        isArray: isArray,
        isString: isString,
        isNumber: isNumber,
        isBoolean: isBoolean,
        join: join,
        map: map,
        filter: filter,
        deepFreeze: deepFreeze
    };
}());

var charHelper = (function () {

    function isAlpha (chr) {
        return (chr >= 'a' && chr <= 'z') || ((chr >= 'A' && chr <= 'Z'));
    }

    function isDigit (chr) {
        return chr >= '0' && chr <= '9';
    }

    function isHexDigit (chr) {
        return isDigit(chr) || (chr >= 'a' && chr <= 'f') || (chr >= 'A' && chr <= 'F');
    }

    return {
        isAlpha: isAlpha,
        isDigit: isDigit,
        isHexDigit: isHexDigit
    };
}());

var pctEncoder = (function () {
    var utf8 = {
        encode: function (chr) {
            // see http://ecmanaut.blogspot.de/2006/07/encoding-decoding-utf8-in-javascript.html
            return unescape(encodeURIComponent(chr));
        },
        numBytes: function (firstCharCode) {
            if (firstCharCode <= 0x7F) {
                return 1;
            }
            else if (0xC2 <= firstCharCode && firstCharCode <= 0xDF) {
                return 2;
            }
            else if (0xE0 <= firstCharCode && firstCharCode <= 0xEF) {
                return 3;
            }
            else if (0xF0 <= firstCharCode && firstCharCode <= 0xF4) {
                return 4;
            }
            // no valid first octet
            return 0;
        },
        isValidFollowingCharCode: function (charCode) {
            return 0x80 <= charCode && charCode <= 0xBF;
        }
    };

    function pad0(v) {
      if (v.length > 1) return v;
      return '0'+v;
    }

    /**
     * encodes a character, if needed or not.
     * @param chr
     * @return pct-encoded character
     */
    function encodeCharacter (chr) {
        var
            result = '',
            octets = utf8.encode(chr),
            octet,
            index;
        for (index = 0; index < octets.length; index += 1) {
            octet = octets.charCodeAt(index);
            result += '%' + pad0(octet.toString(16).toUpperCase());
        }
        return result;
    }

    /**
     * Returns, whether the given text at start is in the form 'percent hex-digit hex-digit', like '%3F'
     * @param text
     * @param start
     * @return {boolean|*|*}
     */
    function isPercentDigitDigit (text, start) {
        return text.charAt(start) === '%' && charHelper.isHexDigit(text.charAt(start + 1)) && charHelper.isHexDigit(text.charAt(start + 2));
    }

    /**
     * Parses a hex number from start with length 2.
     * @param text a string
     * @param start the start index of the 2-digit hex number
     * @return {Number}
     */
    function parseHex2 (text, start) {
        return parseInt(text.substr(start, 2), 16);
    }

    /**
     * Returns whether or not the given char sequence is a correctly pct-encoded sequence.
     * @param chr
     * @return {boolean}
     */
    function isPctEncoded (chr) {
        if (!isPercentDigitDigit(chr, 0)) {
            return false;
        }
        var firstCharCode = parseHex2(chr, 1);
        var numBytes = utf8.numBytes(firstCharCode);
        if (numBytes === 0) {
            return false;
        }
        for (var byteNumber = 1; byteNumber < numBytes; byteNumber += 1) {
            if (!isPercentDigitDigit(chr, 3*byteNumber) || !utf8.isValidFollowingCharCode(parseHex2(chr, 3*byteNumber + 1))) {
                return false;
            }
        }
        return true;
    }

    /**
     * Reads as much as needed from the text, e.g. '%20' or '%C3%B6'. It does not decode!
     * @param text
     * @param startIndex
     * @return the character or pct-string of the text at startIndex
     */
    function pctCharAt(text, startIndex) {
        var chr = text.charAt(startIndex);
        if (!isPercentDigitDigit(text, startIndex)) {
            return chr;
        }
        var utf8CharCode = parseHex2(text, startIndex + 1);
        var numBytes = utf8.numBytes(utf8CharCode);
        if (numBytes === 0) {
            return chr;
        }
        for (var byteNumber = 1; byteNumber < numBytes; byteNumber += 1) {
            if (!isPercentDigitDigit(text, startIndex + 3 * byteNumber) || !utf8.isValidFollowingCharCode(parseHex2(text, startIndex + 3 * byteNumber + 1))) {
                return chr;
            }
        }
        return text.substr(startIndex, 3 * numBytes);
    }

    return {
        encodeCharacter: encodeCharacter,
        isPctEncoded: isPctEncoded,
        pctCharAt: pctCharAt
    };
}());

var rfcCharHelper = (function () {

    /**
     * Returns if an character is an varchar character according 2.3 of rfc 6570
     * @param chr
     * @return (Boolean)
     */
    function isVarchar (chr) {
        return charHelper.isAlpha(chr) || charHelper.isDigit(chr) || chr === '_' || pctEncoder.isPctEncoded(chr);
    }

    /**
     * Returns if chr is an unreserved character according 1.5 of rfc 6570
     * @param chr
     * @return {Boolean}
     */
    function isUnreserved (chr) {
        return charHelper.isAlpha(chr) || charHelper.isDigit(chr) || chr === '-' || chr === '.' || chr === '_' || chr === '~';
    }

    /**
     * Returns if chr is an reserved character according 1.5 of rfc 6570
     * or the percent character mentioned in 3.2.1.
     * @param chr
     * @return {Boolean}
     */
    function isReserved (chr) {
        return chr === ':' || chr === '/' || chr === '?' || chr === '#' || chr === '[' || chr === ']' || chr === '@' || chr === '!' || chr === '$' || chr === '&' || chr === '(' ||
            chr === ')' || chr === '*' || chr === '+' || chr === ',' || chr === ';' || chr === '=' || chr === "'";
    }

    return {
        isVarchar: isVarchar,
        isUnreserved: isUnreserved,
        isReserved: isReserved
    };

}());

/**
 * encoding of rfc 6570
 */
var encodingHelper = (function () {

    function encode (text, passReserved) {
        var
            result = '',
            index,
            chr = '';
        if (typeof text === "number" || typeof text === "boolean") {
            text = text.toString();
        }
        for (index = 0; index < text.length; index += chr.length) {
            chr = text.charAt(index);
            result += rfcCharHelper.isUnreserved(chr) || (passReserved && rfcCharHelper.isReserved(chr)) ? chr : pctEncoder.encodeCharacter(chr);
        }
        return result;
    }

    function encodePassReserved (text) {
        return encode(text, true);
    }

    function encodeLiteralCharacter (literal, index) {
        var chr = pctEncoder.pctCharAt(literal, index);
        if (chr.length > 1) {
            return chr;
        }
        else {
            return rfcCharHelper.isReserved(chr) || rfcCharHelper.isUnreserved(chr) ? chr : pctEncoder.encodeCharacter(chr);
        }
    }

    function encodeLiteral (literal) {
        var
            result = '',
            index,
            chr = '';
        for (index = 0; index < literal.length; index += chr.length) {
            chr = pctEncoder.pctCharAt(literal, index);
            if (chr.length > 1) {
                result += chr;
            }
            else {
                result += rfcCharHelper.isReserved(chr) || rfcCharHelper.isUnreserved(chr) ? chr : pctEncoder.encodeCharacter(chr);
            }
        }
        return result;
    }

    return {
        encode: encode,
        encodePassReserved: encodePassReserved,
        encodeLiteral: encodeLiteral,
        encodeLiteralCharacter: encodeLiteralCharacter
    };

}());


// the operators defined by rfc 6570
var operators = (function () {

    var
        bySymbol = {};

    function create (symbol) {
        bySymbol[symbol] = {
            symbol: symbol,
            separator: (symbol === '?') ? '&' : (symbol === '' || symbol === '+' || symbol === '#') ? ',' : symbol,
            named: symbol === ';' || symbol === '&' || symbol === '?',
            ifEmpty: (symbol === '&' || symbol === '?') ? '=' : '',
            first: (symbol === '+' ) ? '' : symbol,
            encode: (symbol === '+' || symbol === '#') ? encodingHelper.encodePassReserved : encodingHelper.encode,
            toString: function () {
                return this.symbol;
            }
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
    return {
        valueOf: function (chr) {
            if (bySymbol[chr]) {
                return bySymbol[chr];
            }
            if ("=,!@|".indexOf(chr) >= 0) {
                return null;
            }
            return bySymbol[''];
        }
    };
}());


/**
 * Detects, whether a given element is defined in the sense of rfc 6570
 * Section 2.3 of the RFC makes clear defintions:
 * * undefined and null are not defined.
 * * the empty string is defined
 * * an array ("list") is defined, if it is not empty (even if all elements are not defined)
 * * an object ("map") is defined, if it contains at least one property with defined value
 * @param object
 * @return {Boolean}
 */
function isDefined (object) {
    var
        propertyName;
    if (object === null || object === undefined) {
        return false;
    }
    if (objectHelper.isArray(object)) {
        // Section 2.3: A variable defined as a list value is considered undefined if the list contains zero members
        return object.length > 0;
    }
    if (typeof object === "string" || typeof object === "number" || typeof object === "boolean") {
        // falsy values like empty strings, false or 0 are "defined"
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

var LiteralExpression = (function () {
    function LiteralExpression (literal) {
        this.literal = encodingHelper.encodeLiteral(literal);
    }

    LiteralExpression.prototype.expand = function () {
        return this.literal;
    };

    LiteralExpression.prototype.toString = LiteralExpression.prototype.expand;

    return LiteralExpression;
}());

var parse = (function () {

    function parseExpression (expressionText) {
        var
            operator,
            varspecs = [],
            varspec = null,
            varnameStart = null,
            maxLengthStart = null,
            index,
            chr = '';

        function closeVarname () {
            var varname = expressionText.substring(varnameStart, index);
            if (varname.length === 0) {
                throw new UriTemplateError({expressionText: expressionText, message: "a varname must be specified", position: index});
            }
            varspec = {varname: varname, exploded: false, maxLength: null};
            varnameStart = null;
        }

        function closeMaxLength () {
            if (maxLengthStart === index) {
                throw new UriTemplateError({expressionText: expressionText, message: "after a ':' you have to specify the length", position: index});
            }
            varspec.maxLength = parseInt(expressionText.substring(maxLengthStart, index), 10);
            maxLengthStart = null;
        }

        operator = (function (operatorText) {
            var op = operators.valueOf(operatorText);
            if (op === null) {
                throw new UriTemplateError({expressionText: expressionText, message: "illegal use of reserved operator", position: index, operator: operatorText});
            }
            return op;
        }(expressionText.charAt(0)));
        index = operator.symbol.length;

        varnameStart = index;

        for (; index < expressionText.length; index += chr.length) {
            chr = pctEncoder.pctCharAt(expressionText, index);

            if (varnameStart !== null) {
                // the spec says: varname =  varchar *( ["."] varchar )
                // so a dot is allowed except for the first char
                if (chr === '.') {
                    if (varnameStart === index) {
                        throw new UriTemplateError({expressionText: expressionText, message: "a varname MUST NOT start with a dot", position: index});
                    }
                    continue;
                }
                if (rfcCharHelper.isVarchar(chr)) {
                    continue;
                }
                closeVarname();
            }
            if (maxLengthStart !== null) {
                if (index === maxLengthStart && chr === '0') {
                    throw new UriTemplateError({expressionText: expressionText, message: "A :prefix must not start with digit 0", position: index});
                }
                if (charHelper.isDigit(chr)) {
                    if (index - maxLengthStart >= 4) {
                        throw new UriTemplateError({expressionText: expressionText, message: "A :prefix must have max 4 digits", position: index});
                    }
                    continue;
                }
                closeMaxLength();
            }
            if (chr === ':') {
                if (varspec.maxLength !== null) {
                    throw new UriTemplateError({expressionText: expressionText, message: "only one :maxLength is allowed per varspec", position: index});
                }
                if (varspec.exploded) {
                    throw new UriTemplateError({expressionText: expressionText, message: "an exploeded varspec MUST NOT be varspeced", position: index});
                }
                maxLengthStart = index + 1;
                continue;
            }
            if (chr === '*') {
                if (varspec === null) {
                    throw new UriTemplateError({expressionText: expressionText, message: "exploded without varspec", position: index});
                }
                if (varspec.exploded) {
                    throw new UriTemplateError({expressionText: expressionText, message: "exploded twice", position: index});
                }
                if (varspec.maxLength) {
                    throw new UriTemplateError({expressionText: expressionText, message: "an explode (*) MUST NOT follow to a prefix", position: index});
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
            throw new UriTemplateError({expressionText: expressionText, message: "illegal character", character: chr, position: index});
        } // for chr
        if (varnameStart !== null) {
            closeVarname();
        }
        if (maxLengthStart !== null) {
            closeMaxLength();
        }
        varspecs.push(varspec);
        return new VariableExpression(expressionText, operator, varspecs);
    }

    function parse (uriTemplateText) {
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
                    throw new UriTemplateError({templateText: uriTemplateText, message: "unopened brace closed", position: index});
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
                    throw new UriTemplateError({templateText: uriTemplateText, message: "brace already opened", position: index});
                }
                if (chr === '}') {
                    if (braceOpenIndex + 1 === index) {
                        throw new UriTemplateError({templateText: uriTemplateText, message: "empty braces", position: braceOpenIndex});
                    }
                    try {
                        expressions.push(parseExpression(uriTemplateText.substring(braceOpenIndex + 1, index)));
                    }
                    catch (error) {
                        if (error.prototype === UriTemplateError.prototype) {
                            throw new UriTemplateError({templateText: uriTemplateText, message: error.options.message, position: braceOpenIndex + error.options.position, details: error.options});
                        }
                        throw error;
                    }
                    braceOpenIndex = null;
                    literalStart = index + 1;
                }
                continue;
            }
            throw new Error('reached unreachable code');
        }
        if (braceOpenIndex !== null) {
            throw new UriTemplateError({templateText: uriTemplateText, message: "unclosed brace", position: braceOpenIndex});
        }
        if (literalStart < uriTemplateText.length) {
            expressions.push(new LiteralExpression(uriTemplateText.substr(literalStart)));
        }
        return new UriTemplate(uriTemplateText, expressions);
    }

    return parse;
}());

var VariableExpression = (function () {
    // helper function if JSON is not available
    function prettyPrint (value) {
        return (JSON && JSON.stringify) ? JSON.stringify(value) : value;
    }

    function isEmpty (value) {
        if (!isDefined(value)) {
            return true;
        }
        if (objectHelper.isString(value)) {
            return value === '';
        }
        if (objectHelper.isNumber(value) || objectHelper.isBoolean(value)) {
            return false;
        }
        if (objectHelper.isArray(value)) {
            return value.length === 0;
        }
        for (var propertyName in value) {
            if (value.hasOwnProperty(propertyName)) {
                return false;
            }
        }
        return true;
    }

    function propertyArray (object) {
        var
            result = [],
            propertyName;
        for (propertyName in object) {
            if (object.hasOwnProperty(propertyName)) {
                result.push({name: propertyName, value: object[propertyName]});
            }
        }
        return result;
    }

    function VariableExpression (templateText, operator, varspecs) {
        this.templateText = templateText;
        this.operator = operator;
        this.varspecs = varspecs;
    }

    VariableExpression.prototype.toString = function () {
        return this.templateText;
    };

    function expandSimpleValue(varspec, operator, value) {
        var result = '';
        value = value.toString();
        if (operator.named) {
            result += encodingHelper.encodeLiteral(varspec.varname);
            if (value === '') {
                result += operator.ifEmpty;
                return result;
            }
            result += '=';
        }
        if (varspec.maxLength !== null) {
            value = value.substr(0, varspec.maxLength);
        }
        result += operator.encode(value);
        return result;
    }

    function valueDefined (nameValue) {
        return isDefined(nameValue.value);
    }

    function expandNotExploded(varspec, operator, value) {
        var
            arr = [],
            result = '';
        if (operator.named) {
            result += encodingHelper.encodeLiteral(varspec.varname);
            if (isEmpty(value)) {
                result += operator.ifEmpty;
                return result;
            }
            result += '=';
        }
        if (objectHelper.isArray(value)) {
            arr = value;
            arr = objectHelper.filter(arr, isDefined);
            arr = objectHelper.map(arr, operator.encode);
            result += objectHelper.join(arr, ',');
        }
        else {
            arr = propertyArray(value);
            arr = objectHelper.filter(arr, valueDefined);
            arr = objectHelper.map(arr, function (nameValue) {
                return operator.encode(nameValue.name) + ',' + operator.encode(nameValue.value);
            });
            result += objectHelper.join(arr, ',');
        }
        return result;
    }

    function expandExplodedNamed (varspec, operator, value) {
        var
            isArray = objectHelper.isArray(value),
            arr = [];
        if (isArray) {
            arr = value;
            arr = objectHelper.filter(arr, isDefined);
            arr = objectHelper.map(arr, function (listElement) {
                var tmp = encodingHelper.encodeLiteral(varspec.varname);
                if (isEmpty(listElement)) {
                    tmp += operator.ifEmpty;
                }
                else {
                    tmp += '=' + operator.encode(listElement);
                }
                return tmp;
            });
        }
        else {
            arr = propertyArray(value);
            arr = objectHelper.filter(arr, valueDefined);
            arr = objectHelper.map(arr, function (nameValue) {
                var tmp = encodingHelper.encodeLiteral(nameValue.name);
                if (isEmpty(nameValue.value)) {
                    tmp += operator.ifEmpty;
                }
                else {
                    tmp += '=' + operator.encode(nameValue.value);
                }
                return tmp;
            });
        }
        return objectHelper.join(arr, operator.separator);
    }

    function expandExplodedUnnamed (operator, value) {
        var
            arr = [],
            result = '';
        if (objectHelper.isArray(value)) {
            arr = value;
            arr = objectHelper.filter(arr, isDefined);
            arr = objectHelper.map(arr, operator.encode);
            result += objectHelper.join(arr, operator.separator);
        }
        else {
            arr = propertyArray(value);
            arr = objectHelper.filter(arr, function (nameValue) {
                return isDefined(nameValue.value);
            });
            arr = objectHelper.map(arr, function (nameValue) {
                return operator.encode(nameValue.name) + '=' + operator.encode(nameValue.value);
            });
            result += objectHelper.join(arr, operator.separator);
        }
        return result;
    }


    VariableExpression.prototype.expand = function (variables) {
        var
            expanded = [],
            index,
            varspec,
            value,
            valueIsArr,
            oneExploded = false,
            operator = this.operator;

        // expand each varspec and join with operator's separator
        for (index = 0; index < this.varspecs.length; index += 1) {
            varspec = this.varspecs[index];
            value = variables[varspec.varname];
            // if (!isDefined(value)) {
            // if (variables.hasOwnProperty(varspec.name)) {
            if (value === null || value === undefined) {
                continue;
            }
            if (varspec.exploded) {
                oneExploded = true;
            }
            valueIsArr = objectHelper.isArray(value);
            if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
                expanded.push(expandSimpleValue(varspec, operator, value));
            }
            else if (varspec.maxLength && isDefined(value)) {
                // 2.4.1 of the spec says: "Prefix modifiers are not applicable to variables that have composite values."
                throw new Error('Prefix modifiers are not applicable to variables that have composite values. You tried to expand ' + this + " with " + prettyPrint(value));
            }
            else if (!varspec.exploded) {
                if (operator.named || !isEmpty(value)) {
                    expanded.push(expandNotExploded(varspec, operator, value));
                }
            }
            else if (isDefined(value)) {
                if (operator.named) {
                    expanded.push(expandExplodedNamed(varspec, operator, value));
                }
                else {
                    expanded.push(expandExplodedUnnamed(operator, value));
                }
            }
        }

        if (expanded.length === 0) {
            return "";
        }
        else {
            return operator.first + objectHelper.join(expanded, operator.separator);
        }
    };

    return VariableExpression;
}());

var UriTemplate = (function () {
    function UriTemplate (templateText, expressions) {
        this.templateText = templateText;
        this.expressions = expressions;
        objectHelper.deepFreeze(this);
    }

    UriTemplate.prototype.toString = function () {
        return this.templateText;
    };

    UriTemplate.prototype.expand = function (variables) {
        // this.expressions.map(function (expression) {return expression.expand(variables);}).join('');
        var
            index,
            result = '';
        for (index = 0; index < this.expressions.length; index += 1) {
            result += this.expressions[index].expand(variables);
        }
        return result;
    };

    UriTemplate.parse = parse;
    UriTemplate.UriTemplateError = UriTemplateError;
    return UriTemplate;
}());

    exportCallback(UriTemplate);

}(function (UriTemplate) {
        "use strict";
        local.http.UriTemplate = UriTemplate;
}));// Navigator
// =========

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
		var urld  = local.http.parseUri(this.url);
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
	var urld          = local.http.parseUri(this.url);
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
		if (!parentNavigator)
			throw "parentNavigator is required for navigators with relative contexts";
	}
}
local.http.Navigator = Navigator;

// executes an HTTP request to our context
//  - uses additional parameters on the request options:
//    - retry: bool, should the url resolve be tried if it previously failed?
//    - noresolve: bool, should we use the url we have and not try to resolve one from our parent's links?
Navigator.prototype.dispatch = function Navigator__dispatch(req) {
	if (!req || !req.method) { throw "request options not provided"; }
	var self = this;

	var response = local.promise();
	((req.noresolve) ? local.promise(this.context.getUrl()) : this.resolve({ retry:req.retry, nohead:true }))
		.succeed(function(url) {
			req.url = url;
			return local.http.dispatch(req);
		})
		.succeed(function(res) {
			self.context.error = null;
			self.context.resolveState = NavigatorContext.RESOLVED;
			if (res.headers.link)
				self.links = res.headers.link;
			else
				self.links = self.links || []; // cache an empty link list so we dont keep trying during resolution
			return res;
		})
		.fail(function(res) {
			if (res.status === 404) {
				self.context.error = res;
				self.context.resolveState = NavigatorContext.FAILED;
			}
			throw res;
		})
		.chain(response);
	return response;
};

// executes a GET text/event-stream request to our context
Navigator.prototype.subscribe = function Navigator__dispatch() {
	return this.resolve()
		.succeed(function(url) {
			return local.http.subscribe(url);
		});
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
//    - nohead: bool, should we issue a HEAD request once we have a URL? (not favorable if planning to dispatch something else)
//  - returns a promise
Navigator.prototype.resolve = function Navigator__resolve(options) {
	var self = this;
	options = options || {};

	var nohead = options.nohead;
	delete options.nohead; // pull it out so that parent resolves do their head requests

	var resolvePromise = local.promise();
	if (this.links !== null && (this.context.isResolved() || (this.context.isAbsolute() && this.context.isBad() === false)))
		resolvePromise.fulfill(this.context.getUrl());
	else if (this.context.isBad() === false || (this.context.isBad() && options.retry)) {
		this.context.resetResolvedState();
		if (this.parentNavigator)
			this.parentNavigator.__resolveChild(this, options)// lookup link in parent navigator
				.succeed(function(url) {
					if (nohead)
						return true;
					// send HEAD request for links
					return self.head(null, null, null, { noresolve:true });
				})
				.succeed(function(res) { return self.context.getUrl(); })
				.chain(resolvePromise);
		else
			((nohead) ? local.promise(true) : this.head(null, null, null, { noresolve:true })) // head request to our absolute url to confirm it
				.succeed(function(res) { return self.context.getUrl(); })
				.chain(resolvePromise);
	} else
		resolvePromise.reject(this.context.getError());
	return resolvePromise;
};

// resolves a child navigator's context relative to our own
//  - may trigger resolution of parent contexts
//  - options is optional and may include:
//    - retry: bool, should the resolve be tried if it previously failed?
//  - returns a promise
Navigator.prototype.__resolveChild = function Navigator__resolveChild(childNav, options) {
	var self = this;
	var resolvedPromise = local.promise();

	// resolve self before resolving child
	this.resolve(options).then(
		function() {
			var childUrl = self.__lookupLink(childNav.context);
			if (childUrl) {
				childNav.context.resolve(childUrl);
				resolvedPromise.fulfill(childUrl);
			} else {
				var response = new local.http.ClientResponse(404, 'link relation not found');
				resolvedPromise.reject(response);
				response.end();
			}
		},
		function(error) {
			// we're bad, and all children are bad as well
			childNav.context.error = error;
			childNav.context.resolveState = NavigatorContext.FAILED;
			resolvedPromise.reject(error);
			return error;
		}
	);

	return resolvedPromise;
};

// looks up a link in the cache and generates the URI
//  - first looks for a matching rel and title
//    eg item('foobar') -> Link: <http://example.com/some/foobar>; rel="item"; title="foobar" -> http://example.com/some/foobar
//  - then looks for a matching rel with no title and uses that to generate the link
//    eg item('foobar') -> Link: <http://example.com/some/{item}>; rel="item" -> http://example.com/some/foobar
Navigator.prototype.__lookupLink = function Navigator__lookupLink(context) {
	// try to find the link with a title equal to the param we were given
	var href = local.http.lookupLink(this.links, context.rel, context.relparams.title);

	if (href) {
		var url = local.http.UriTemplate.parse(href).expand(context.relparams);
		var urld = local.http.parseUri(url);
		if (!urld.host) // handle relative URLs
			url = this.context.getHost() + urld.relative;
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

// builder fn
local.http.navigator = function(urlOrNavOrLinks, optRel, optTitle) {
	if (urlOrNavOrLinks instanceof Navigator)
		return urlOrNavOrLinks;
	var url;
	if (Array.isArray(urlOrNavOrLinks))
		url = local.http.lookupLink(urlOrNavOrLinks, optRel, optTitle);
	else
		url = urlOrNavOrLinks;
	return new Navigator(url);
};})();// Local Client Behaviors
// ======================
// pfraze 2013

if (typeof this.local == 'undefined')
	this.local = {};
if (typeof this.local.client == 'undefined')
	this.local.client = {};

(function() {// Helpers
// =======

// EXPORTED
// searches up the node tree for an element
function findParentNode(node, test) {
	while (node) {
		if (test(node)) { return node; }
		node = node.parentNode;
	}
	return null;
}

findParentNode.byTag = function(node, tagName) {
	return findParentNode(node, function(elem) {
		return elem.tagName == tagName;
	});
};

findParentNode.byClass = function(node, className) {
	return findParentNode(node, function(elem) {
		return elem.classList && elem.classList.contains(className);
	});
};

findParentNode.byElement = function(node, element) {
	return findParentNode(node, function(elem) {
		return elem === element;
	});
};

findParentNode.thatisFormRelated = function(node) {
	return findParentNode(node, function(elem) {
		return !!elem.form;
	});
};

// combines parameters as objects
// - precedence is rightmost
//     reduceObjects({a:1}, {a:2}, {a:3}) => {a:3}
function reduceObjects() {
	var objs = Array.prototype.slice.call(arguments);
	var acc = {}, obj;
	while (objs.length) {
		obj = objs.shift();
		if (!obj) { continue; }
		for (var k in obj) {
			if (typeof obj[k] == 'undefined' || obj[k] === null) { continue; }
			if (typeof obj[k] == 'object' && !Array.isArray(obj[k])) {
				acc[k] = reduceObjects(acc[k], obj[k]);
			} else {
				acc[k] = obj[k];
			}
		}
	}
	return acc;
}

// INTERNAL
// dispatches a request event, stopping the given event
function dispatchRequestEvent(targetElem, request) {
	var re = new CustomEvent('request', { bubbles:true, cancelable:true, detail:request });
	targetElem.dispatchEvent(re);
}

// INTERNAL
// submit helper, makes it possible to find the button which triggered the submit
function trackFormSubmitter(node) {
	var elem = findParentNode.thatisFormRelated(node);
	if (elem) {
		for (var i=0; i < elem.form.length; i++) {
			elem.form[i].setAttribute('submitter', null);
		}
		elem.setAttribute('submitter', '1');
	}
}

// EXPORTED
// extracts request from any given element
function extractRequest(targetElem, containerElem) {
	var requests = { form:{}, fieldset:{}, elem:{} };
	var fieldset = null, form = null;

	// find parent fieldset
	if (targetElem.tagName === 'FIELDSET') {
		fieldset = targetElem;
	} else if (targetElem.tagName !== 'FORM') {
		fieldset = findParentNode.byTag(targetElem, 'FIELDSET');
	}

	// find parent form
	if (targetElem.tagName === 'FORM') {
		form = targetElem;
	} else {
		// :TODO: targetElem.form may be a simpler alternative
		var formId = targetElem.getAttribute('form') || (fieldset ? fieldset.getAttribute('form') : null);
		if (formId) {
			form = containerElem.querySelector('#'+formId);
		}
		if (!form) {
			form = findParentNode.byTag(targetElem, 'FORM');
		}
	}

	// extract payload
	var payload = extractRequestPayload(targetElem, form);
	
	// extract form headers
	if (form) {
		requests.form = extractRequest.fromForm(form, targetElem);
	}

	// extract fieldset headers
	if (fieldset) {
		requests.fieldset = extractRequest.fromFormElement(fieldset);
	}

	// extract element headers
	if (targetElem.tagName === 'A') {
		requests.elem = extractRequest.fromAnchor(targetElem);
	} else if (['FORM','FIELDSET'].indexOf(targetElem.tagName) === -1) {
		requests.elem = extractRequest.fromFormElement(targetElem);
	}

	// combine then all, with precedence given to rightmost objects in param list
	var req = reduceObjects(requests.form, requests.fieldset, requests.elem);
	var payloadWrapper = {};
	payloadWrapper[/GET/i.test(req.method) ? 'query' : 'body'] = payload;
	return reduceObjects(req, payloadWrapper);
}

// EXPORTED
// extracts request parameters from an anchor tag
extractRequest.fromAnchor = function(node) {

	// get the anchor
	node = findParentNode.byTag(node, 'A');
	if (!node || !node.attributes.href || node.attributes.href.value.charAt(0) == '#') { return null; }

	// pull out params
	var request = {
		method  : 'get',
		url     : node.attributes.href.value,
		target  : node.getAttribute('target'),
		headers : { accept:node.getAttribute('type') }
	};
	return request;
};

// EXPORTED
// extracts request parameters from a form element (inputs, textareas, etc)
extractRequest.fromFormElement = function(node) {
	// :TODO: search parent for the form-related element?
	//        might obviate the need for submitter-tracking

	// pull out params
	var request = {
		method  : node.getAttribute('formmethod'),
		url     : node.getAttribute('formaction'),
		target  : node.getAttribute('formtarget'),
		headers : {
			'content-type' : node.getAttribute('formenctype'),
			accept         : node.getAttribute('formaccept')
		}
	};
	return request;
};

// EXPORTED
// extracts request parameters from a form
extractRequest.fromForm = function(form, submittingElem) {

	// find the submitter, if the submitting element is not form-related
	if (submittingElem && !submittingElem.form) {
		for (var i=0; i < form.length; i++) {
			var elem = form[i];
			if (elem.getAttribute('submitter') == '1') {
				submittingElem = elem;
				elem.setAttribute('submitter', '0');
				break;
			}
		}
	}

	var requests = { submitter:{}, form:{} };
	// extract submitting element headers
	if (submittingElem) {
		requests.submitter = {
			method  : submittingElem.getAttribute('formmethod'),
			url     : submittingElem.getAttribute('formaction'),
			target  : submittingElem.getAttribute('formtarget'),
			headers : {
				'content-type' : submittingElem.getAttribute('formenctype'),
				accept         : submittingElem.getAttribute('formaccept')
			}
		};
	}
	// extract form headers
	requests.form = {
		method  : form.getAttribute('method'),
		url     : form.getAttribute('action'),
		target  : form.getAttribute('target'),
		headers : {
			'content-type' : form.getAttribute('enctype') || form.enctype,
			'accept'       : form.getAttribute('accept')
		}
	};
	if (form.acceptCharset) { requests.form.headers.accept = form.acceptCharset; }

	// combine, with precedence to the submitting element
	var request = reduceObjects(requests.form, requests.submitter);

	// strip the base URI
	// :TODO: needed?
	/*var base_uri = window.location.href.split('#')[0];
	if (target_uri.indexOf(base_uri) != -1) {
		target_uri = target_uri.substring(base_uri.length);
		if (target_uri.charAt(0) != '/') { target_uri = '/' + target_uri; }
	}*/

	return request;
};

// EXPORTED
// serializes all form elements beneath and including the given element
function extractRequestPayload(targetElem, form, opts) {
	if (!opts) opts = {};

	// iterate form elements
	var data = {};
	if (!opts.nofiles)
		data.__fileReads = []; // an array of promises to read <input type=file>s
	for (var i=0; i < form.length; i++) {
		var elem = form[i];

		// skip if it doesnt have a name
		if (!elem.name)
			continue;

		// skip if not a child of the target element
		if (!findParentNode.byElement(elem, targetElem))
			continue;

		// pull value if it has one
		var isSubmittingElem = elem.getAttribute('submitter') == '1';
		if (elem.tagName === 'BUTTON') {
			if (isSubmittingElem) {
				// don't pull from buttons unless recently clicked
				data[elem.name] = elem.value;
			}
		} else if (elem.tagName === 'INPUT') {
			switch (elem.type.toLowerCase()) {
				case 'button':
				case 'submit':
					if (isSubmittingElem) {
						// don't pull from buttons unless recently clicked
						data[elem.name] = elem.value;
					}
					break;
				case 'checkbox':
					if (elem.checked) {
						// don't pull from checkboxes unless checked
						data[elem.name] = (data[elem.name] || []).concat(elem.value);
					}
					break;
				case 'radio':
					if (elem.getAttribute('checked') !== null) {
						// don't pull from radios unless selected
						data[elem.name] = elem.value;
					}
					break;
				case 'file':
					// read the files
					if (opts.nofiles)
						break;
					if (elem.multiple) {
						for (var i=0, f; f = elem.files[i]; i++)
							readFile(data, elem, elem.files[i], i);
						data[elem.name] = [];
						data[elem.name].length = i;
					} else {
						readFile(data, elem, elem.files[0]);
					}
					break;
				default:
					data[elem.name] = elem.value;
					break;
			}
		} else
			data[elem.name] = elem.value;
	}

	return data;
}

// INTERNAL
// file read helpers
function readFile(data, elem, file, index) {
	var reader = new FileReader();
	reader.onloadend = readFileLoadEnd(data, elem, file, index);
	reader.readAsDataURL(file);
}
function readFileLoadEnd(data, elem, file, index) {
	// ^ this avoids a closure circular reference
	var promise = local.promise();
	data.__fileReads.push(promise);
	return function(e) {
		var obj = {
			content: e.target.result || null,
			name: file.name,
			formattr: elem.name,
			size: file.size,
			type: file.type,
			lastModifiedDate: file.lastModifiedDate
		};
		if (typeof index != 'undefined')
			obj.formindex = index;
		promise.fulfill(obj);
	};
}
function finishPayloadFileReads(request) {
	var fileReads = (request.body) ? request.body.__fileReads :
					((request.query) ? request.query.__fileReads : []);
	return local.promise.bundle(fileReads).then(function(files) {
		if (request.body) delete request.body.__fileReads;
		if (request.query) delete request.query.__fileReads;
		files.forEach(function(file) {
			if (typeof file.formindex != 'undefined')
				request.body[file.formattr][file.formindex] = file;
			else request.body[file.formattr] = file;
		});
		return request;
	});
}

local.client.findParentNode = findParentNode;
local.client.extractRequest = extractRequest;
local.client.extractRequestPayload = extractRequestPayload;// Standard DOM Events
// ===================

// listen()
// ========
// EXPORTED
// Converts 'click', 'submit', and 'drag/drop' events into custom 'request' events
// - within the container, all 'click' and 'submit' events will be consumed
// - 'request' events will be dispatched by the original dispatching element
// - draggable elements which produce requests (anchors, form elements) have their drag/drop handlers defined as well
// Parameters:
// - `container` must be a valid DOM element
// - `options` may disable event listeners by setting `links`, `forms`, or `dragdrops` to false
function LocalClient__listen(container, options) {
	if (!container || !(container instanceof Element)) {
		throw "Listen() requires a valid DOM element as a first parameter";
	}

	container.__eventHandlers = [];
	options = options || {};

	var handler;
	if (options.links !== false) {
		handler = { name:'click', handleEvent:LocalClient__clickHandler, container:container };
		container.addEventListener('click', handler, true);
		container.__eventHandlers.push(handler);
	}
	if (options.forms !== false) {
		handler = { name:'submit', handleEvent:LocalClient__submitHandler, container:container };
		container.addEventListener('submit', handler, true);
	}
	// :DEBUG: disabled for now
	/*if (options.dragdrops !== false) {
		handler = { name:'dragstart', handleEvent:LocalClient__dragstartHandler, container:container };
		container.addEventListener('dragstart', handler);
		container.__eventHandlers.push(handler);
	}*/
}

// unlisten()
// ==========
// EXPORTED
// Stops listening to 'click', 'submit', and 'drag/drop' events
function LocalClient__unlisten(container) {
	if (container.__eventHandlers) {
		container.__eventHandlers.forEach(function(handler) {
			container.removeEventListener(handler.name, handler);
		});
		delete container.__eventHandlers;
	}
	var subscribeElems = container.querySelectorAll('[data-subscribe]');
	Array.prototype.forEach.call(subscribeElems, function(subscribeElem) {
		if (subscribeElem.__subscriptions) {
			for (var url in subscribeElem.__subscriptions)
				subscribeElem.__subscriptions[url].close();
			delete subscribeElem.__subscriptions;
		}
	});
}

// INTERNAL
// transforms click events into request events
function LocalClient__clickHandler(e) {
	if (e.button !== 0) { return; } // handle left-click only
	trackFormSubmitter(e.target);
	var request = extractRequest.fromAnchor(e.target);
	if (request && ['_top','_blank'].indexOf(request.target) !== -1) { return; }
	if (request) {
		e.preventDefault();
		e.stopPropagation();
		dispatchRequestEvent(e.target, request);
		return false;
	}
}

// INTERNAL
// transforms submit events into request events
function LocalClient__submitHandler(e) {
	var request = extractRequest(e.target, this.container);
	if (request && ['_top','_blank'].indexOf(request.target) !== -1) { return; }
	if (request) {
		e.preventDefault();
		e.stopPropagation();
		finishPayloadFileReads(request).then(function() {
			dispatchRequestEvent(e.target, request);
		});
		return false;
	}
}

// INTERNAL
// builds a 'link' object out of a dragged item
function LocalClient__dragstartHandler(e) {
	e.dataTransfer.effectAllowed = 'none'; // allow nothing unless there's a valid link
	var link = null, elem = e.target;

	// update our form submitter tracking
	trackFormSubmitter(elem);

	// get request data
	if (elem.tagName == 'A') {
		link = extractRequest.fromAnchor(elem);
	} else if (elem.form) {
		link = extractRequest(elem.form, this.container);
	} /* :TODO: do we need to include fieldsets here? */

	// setup drag/drop behavior
	if (link) {
		e.dataTransfer.effectAllowed = 'link';
		e.dataTransfer.setData('application/request+json', JSON.stringify(link));
		e.dataTransfer.setData('text/uri-list', link.url);
		e.dataTransfer.setData('text/plain', link.url);
	}
}

local.client.listen = LocalClient__listen;
local.client.unlisten = LocalClient__unlisten;// Response Interpretation
// =======================

// supported on* events
var attrEvents = ['blur', 'change', 'click', 'dblclick', 'focus', 'keydown', 'keypress', 'keyup',
	'load', 'mousedown', 'mousemove', 'mouseout', 'mouseover', 'mouseup', 'reset', 'select', 'submit', 'unload'];

// renderResponse()
// ==============
// EXPORTED
// replaces the targetElem's innerHTML with the response payload
function renderResponse(targetElem, containerElem, response) {

	response.body = response.body || '';
	var type = response.headers['content-type'];
	if (/application\/html\-deltas\+json/.test(type)) {
		if (typeof response.body != 'object' || !Array.isArray(response.body))
			console.log('Improperly-formed application/html-deltas+json object', response);
		else {
			if (Array.isArray(response.body[0])) {
				response.body.forEach(function(delta) {
					renderHtmlDelta(delta, targetElem, containerElem);
				});
			} else
				renderHtmlDelta(response.body, targetElem, containerElem);
		}
	} else {
		// format the output by type
		var html = '';
		if (/text\/html/.test(type))
			html = response.body.toString();
		else {
			// escape non-html so that it can render correctly
			if (typeof response.body != 'string')
				html = JSON.stringify(response.body);
			html = response.body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		}

		local.client.unlisten(targetElem); // make sure to unregister listeners before replaceing
		targetElem.innerHTML = html;
		local.env.postProcessRegion(targetElem, containerElem);
	}

	bindAttrEvents(targetElem, containerElem);
	subscribeElements(targetElem, containerElem);
}

function renderHtmlDelta(delta, targetElem, containerElem) {
	if (typeof delta != 'object' || !Array.isArray(delta))
		return;
	var i, ii, region;
	var op = delta.shift(), selector = delta.shift(), args = delta;
	if (!op || !selector)
		return;
	var elems = containerElem.querySelectorAll(selector);
	var addClass = function(cls) { elems[i].classList.add(cls); };
	var removeClass = function(cls) { elems[i].classList.remove(cls); };
	var toggleClass = function(cls) { elems[i].classList.toggle(cls); };
	for (i=0, ii=elems.length; i < ii; i++) {
		if (!elems[i]) continue;
		var elem = elems[i];
		switch (op) {
			case 'replace':
				local.client.unlisten(elem); // destructive update, do unlisten
				elem.innerHTML = args[0];
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'remove':
				local.client.unlisten(elem); // destructive update, do unlisten
				elem.parentNode.removeChild(elem);
				break;
			case 'append':
				elem.innerHTML = elem.innerHTML + args[0];
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'prepend':
				elem.innerHTML = args[0] + elem.innerHTML;
				local.env.postProcessRegion(elem, containerElem);
				break;
			case 'addClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(addClass);
				break;
			case 'removeClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(removeClass);
				break;
			case 'toggleClass':
				if (elem.classList)
					(args[0]||'').split(' ').forEach(toggleClass);
				break;
			case 'setAttribute':
				if (args[0])
					elem.setAttribute(args[0], args[1]);
				break;
			case 'navigate':
				region = local.env.getClientRegion(elem.id);
				if (region)
					region.dispatchRequest(args[0]);
				else
					console.log('html-delta navigate targeted non-client-region element', elem, selector);
				break;
		}
	}
}

// INTERNAL
// searches elements for event attributes (on*) and binds a listener which dispatches a request event
// - attribute value determines the request method (post, put, patch, etc)
function bindAttrEvents(targetElem, containerElem) {
	
	// find all elements with on* attributes
	attrEvents.forEach(function(eventName) {
		var eventAttr = 'on'+eventName;
		var elements = targetElem.querySelectorAll('['+eventAttr+']');
		Array.prototype.forEach.call(elements, function(elem) {
			// bind event handlers based on the given model
			var method = elem.getAttribute(eventAttr);
			elem.addEventListener(eventName, makeAttrEventHandler(method, containerElem));
			elem.removeAttribute(eventAttr);
		});
	});
}

// INTERNAL
// provides an event handler which dispatches a request event
function makeAttrEventHandler(method, containerElem) {
	return function(e) {
		e.preventDefault();
		e.stopPropagation();

		// build request
		var request = extractRequest(e.currentTarget, containerElem);
		request.method = method;
		finishPayloadFileReads(request).then(function() {

			// move the query into the body if not a GET
			// (extractRequest would have used the wrong method to judge this)
			var isGET = /GET/i.test(method);
			if (!isGET && !request.body) {
				request.body = request.query;
				request.query = {};
			}
			// visa-versa
			else if (isGET && request.body) {
				request.query = reduceObjects(request.body, request.query);
				request.body = {};
			}

			// dispatch request event
			dispatchRequestEvent(e.target, request);
		});
	};
}

// INTERNAL
// subscribes all child elements with 'data-subscribe' to 'update' events coming from specified url
// - when the update message is received, will issue a GET request for new HTML
function subscribeElements(targetElem, containerElem) {

	// find subscribe elems
	var subscribeElems = targetElem.querySelectorAll('[data-subscribe]');

	Array.prototype.forEach.call(subscribeElems, function(subscribeElem) {
		// subscribe to server's events
		var subParts = subscribeElem.dataset.subscribe.split(' ');
		var eventsUrl = subParts[0];
		var getUrl = subParts[1] || eventsUrl;

		subscribeElem.__subscriptions = subscribeElem.__subscriptions || {};
		var stream = subscribeElem.__subscriptions[eventsUrl];
		if (!stream) {
			stream = subscribeElem.__subscriptions[eventsUrl] = local.http.subscribe({ url:eventsUrl });
			stream.on('update', makeUpdateEventHandler(getUrl, subscribeElem));
			stream.on('error', makeErrorEventHandler());
		}
	});
}

function makeUpdateEventHandler(url, targetElem) {
	return function(m) {
		var request = { method:'get', url:url, target:"_element", headers:{ accept:'text/html' }};
		if (targetElem.tagName == 'FORM') {
			// serialize the form values in the query
			request.query = extractRequestPayload(targetElem, targetElem, { nofiles:true });
			// see if the form has its own accept
			request.headers.accept = targetElem.getAttribute('accept') || 'text/html';
		}
		dispatchRequestEvent(targetElem, request);
	};
}

function makeErrorEventHandler() {
	return function(e) {
		var err = e.data;
		console.log('Client update stream error:', err);
	};
}

local.client.renderResponse = renderResponse;// Regions
// =======

if (typeof CustomEvent === 'undefined') {
	// CustomEvent shim (safari)
	// thanks to netoneko https://github.com/maker/ratchet/issues/101
	CustomEvent = function(type, eventInitDict) {
		var event = document.createEvent('CustomEvent');

		event.initCustomEvent(type, eventInitDict['bubbles'], eventInitDict['cancelable'], eventInitDict['detail']);
		return event;
	};
}

// EXPORTED
// an isolated browsing context in the DOM
// - `id` indicates the element to add Region behaviors to
function Region(id) {
	this.id = id;
	this.context = {
		url   : '',
		urld  : {},
		links : [],
		type  : '' // content type of the response
	};

	this.element = document.getElementById(id);
	if (!this.element) { throw "Region target element not found"; }
	this.element.classList.add('client-region');

	this.listenerFn = handleRequest.bind(this);
	this.element.addEventListener('request', this.listenerFn);
	local.client.listen(this.element);
}
local.client.Region = Region;

// dispatches a 'request' DOM event, which the region will then catch and HTTP-dispatch
// - targetEl: optional, the element to dispatch from (defaults to client region's element)
//             (must be a child element)
Region.prototype.dispatchRequest = function(request, targetEl) {
	if (typeof request === 'string')
		request = { method:'get', url:request, headers:{ accept:'text/html' }};
	if (!targetEl)
		targetEl = this.element;
	var re = new CustomEvent('request', { bubbles:true, cancelable:true, detail:request });
	targetEl.dispatchEvent(re);
};

// removes the Region behaviors from the given element
Region.prototype.terminate = function() {
	local.client.unlisten(this.element);
	this.element.removeEventListener('request', this.listenerFn);
};

// handles the 'request' DOM event by firing the HTTP request and handling the response
function handleRequest(e) {
	e.preventDefault();
	e.stopPropagation();

	var request = e.detail;
	this.__prepareRequest(request);

	var self = this;
	var handleResponse = function(response) { self.__handleResponse(e, request, response); };
	local.http.dispatch(request, this).then(handleResponse, handleResponse);
}

// prepares data from a 'request' DOM event for HTTP dispatch
Region.prototype.__prepareRequest = function(request) {
	// sane defaults
	request.headers = request.headers || {};
	request.headers.accept = request.headers.accept || 'text/html';
	request.stream = false;

	// relative urls
	var urld = local.http.parseUri(request);
	if (!urld.protocol) {
		// build a new url from the current context
		var newUrl;
		if (request.url.length > 0 && request.url.charAt(0) != '/') {
			// relative to context dirname
			newUrl = this.context.urld.protocol + "://" + this.context.urld.host + this.context.urld.directory + request.url;
		} else {
			// relative to context hostLink
			newUrl = this.context.urld.protocol + "://" + this.context.urld.host + request.url;
		}
		// reduce the string's '..' relatives
		// :TODO: I'm sure there's a better algorithm for this
		var lastRequestHost = this.context.urld.host;
		do {
			request.url = newUrl;
			newUrl = request.url.replace(/[^\/]+\/\.\.\//i, '');
		} while (newUrl != request.url && local.http.parseUri(newUrl).host == lastRequestHost);
		delete request.host;
		delete request.path;
	}
};

// applies an HTTP response to its target element
Region.prototype.__handleResponse = function(e, request, response) {
	response.headers = response.headers || {};
	var requestTarget = this.__chooseRequestTarget(e, request);
	if (!requestTarget)
		return;

	var targetClient = local.env.getClientRegion(requestTarget.id);
	if (targetClient)
		targetClient.__updateContext(request, response);

	// react to the response
	switch (response.status) {
		case 204:
			// no content
			break;
		case 205:
			// reset form
			// :TODO: should this try to find a parent form to requestTarget?
			if (requestTarget.tagName === 'FORM')
				requestTarget.reset();
			break;
		case 303:
			// dispatch for contents
			var request2 = { method:'get', url:response.headers.location, headers:{ accept:'text/html' }};
			this.dispatchRequest(request2);
			break;
		default:
			// replace target innards
			local.client.renderResponse(requestTarget, this.element, response);
	}
};

Region.prototype.__updateContext = function(request, response) {
	// track location for relative urls
	var urld = local.http.parseUri(request);
	this.context.urld  = urld;
	this.context.url   = urld.protocol + '://' + urld.authority + urld.directory;
	this.context.links = response.headers.link;
	this.context.type  = response.headers['content-type'];
};

Region.prototype.__chooseRequestTarget = function(e, request) {
	if (request.target == '_element')
		return e.target;
	return document.getElementById(request.target) || this.element;
};})();// Local Environment
// =================
// pfraze 2013

if (typeof this.local == 'undefined')
	this.local = {};
if (typeof this.local.env == 'undefined')
	this.local.env = {};

(function() {// Env Worker
// ==========

(function () {
	var __cur_mid = 1;
	function gen_mid() { return __cur_mid++; }

	// Worker
	// ======
	// EXPORTED
	// wraps a Web Worker API tools for sandboxing and messaging
	// - should be used by the environment hosting the workers (most likely the document)
	// - loads the worker with the bootstrap script
	// - `options.bootstrapUrl` may optionally specify the URL of the worker bootstrap script
	// - `options.log` will enable logging of traffic
	function LocalEnvWorker(readyCb, options) {
		options = options || {};
		this.isLogging = options.log;

		this.messageListeners = {};
		this.replyCbs = {};
		this.messageBuffers = {};

		if (readyCb)
			this.onNamedMessage('ready', readyCb, this);

		this.worker = new Worker(options.bootstrapUrl || 'worker.js');
		setupMessagingHandlers.call(this);
	}
	local.env.Worker = LocalEnvWorker;

	// INTERNAL
	// registers listeners required for messaging
	function setupMessagingHandlers() {
		var self = this;
		this.worker.addEventListener('message', function(event) {
			var message = event.data;
			if (this.isLogging) { console.log('receiving', message); }

			// handle replies
			if (message.name === 'reply') {
				var cb = self.replyCbs[message.reply_to];
				if (cb) {
					cb.func.call(cb.context, message);
					delete self.replyCbs[message.reply_to]; // wont need to call again
					return;
				}
			}

			var listeners = self.messageListeners[message.name];

			// streaming
			if (message.name === 'endMessage') {
				var mid = message.data;
				listeners = self.messageListeners[mid]; // inform message listeners
				self.removeAllNamedMessageListeners(mid); // and release their references
			}

			// dispatch
			if (listeners) {
				listeners.forEach(function(listener) {
					listener.func.call(listener.context, message);
				});
			}
		});
	}

	// EXPORTED
	// sends a message to the LocalEnvWorker
	// - `messageName` is required
	// - returns id of the new message
	// - if `replyCb` is specified, it will be called once if/when the LocalEnvWorker sends a reply to the message
	// - to send more data afterwards (streaming) use the returned id as the message name
	LocalEnvWorker.prototype.postNamedMessage = function(messageName, messageData, replyCb, replyCbContext) {
		var message = makeMessage(messageName, messageData);
		doPostMessage.call(this, message, replyCb, replyCbContext);
		return message.id;
	};

	// EXPORTED
	// sends a reply to a message from the LocalEnvWorker
	// - parameter 1 (`orgMessage`) should be the message (or id of the message) originally received from the LocalEnvWorker
	// - otherwise works exactly like postNamedMessage
	// - NOTE: replies will only be handled by replyCbs registered during the original send
	//   - if a sender is not expecting a reply, it will never be handled
	LocalEnvWorker.prototype.postReply = function(orgMessage, messageData, replyCb, replyCbContext) {
		var replyToID = (typeof orgMessage === 'object') ? orgMessage.id : orgMessage;
		var message = makeMessage('reply', messageData, replyToID);
		doPostMessage.call(this, message, replyCb, replyCbContext);
		return message.id;
	};

	// EXPORTED
	// informs the receiver that no more data will stream, allowing it to release its listeners
	// - parameter 1 (`orgMessageID`) should be the first message's id (returned by postNamedMessage/postReply)
	LocalEnvWorker.prototype.endMessage = function(orgMessageID) {
		return this.postNamedMessage('endMessage', orgMessageID);
	};

	// INTERNAL
	// message object builder
	function makeMessage(name, data, replyToId) {
		var message = {
			id       : gen_mid(),
			reply_to : replyToId,
			name     : name,
			data     : data
		};
		return message;
	}

	// INTERNAL
	// functional body of the post* functions
	// - should be called with the LocalEnvWorker bound to `this`
	function doPostMessage(message, replyCb, replyCbContext) {
		if (message.name in this.messageBuffers) {
			// dont send; queue message in the buffer
			this.messageBuffers[message.name].push([message, replyCb, replyCbContext]);
		} else {
			if (replyCb && typeof replyCb === 'function') {
				this.replyCbs[message.id] = { func:replyCb, context:replyCbContext };
			}
			if (this.isLogging) { console.log('sending', message); }
			this.worker.postMessage(message);
		}
	}

	// EXPORTED
	// registers a callback to handle messages from the LocalEnvWorker
	// - `messageName` and `func` are required
	LocalEnvWorker.prototype.addNamedMessageListener = function(messageName, func, context) {
		if (!(messageName in this.messageListeners)) {
			// create new listener array
			this.messageListeners[messageName] = [];
		}
		// add to list
		this.messageListeners[messageName].push({ func:func, context:context });
	};
	LocalEnvWorker.prototype.onNamedMessage = LocalEnvWorker.prototype.addNamedMessageListener;

	// EXPORTED
	// removes a given callback from the message listeners
	LocalEnvWorker.prototype.removeNamedMessageListener = function(messageName, func) {
		if (messageName in this.messageListeners) {
			// filter out the listener
			var filterFn = function(listener) { return listener.func != func; };
			this.messageListeners[messageName] = this.messageListeners[messageName].filter(filterFn);
			// remove array if empty
			if (this.messageListeners[messageName].length === 0) {
				delete this.messageListeners[messageName];
			}
		}
	};

	// EXPORTED
	// removes all callbacks from the given message
	LocalEnvWorker.prototype.removeAllNamedMessageListeners = function(messageName) {
		if (messageName in this.messageListeners) {
			delete this.messageListeners[messageName];
		}
	};

	// EXPORTED
	// delays all messages of the given type until `releaseMessages` is called
	LocalEnvWorker.prototype.bufferMessages = function(messageName) {
		if (!(messageName in this.messageBuffers)) {
			this.messageBuffers[messageName] = [];
		}
	};

	// EXPORTED
	// stops buffering and sends all queued messages
	LocalEnvWorker.prototype.releaseMessages = function(messageName) {
		if (messageName in this.messageBuffers) {
			var buffers = this.messageBuffers[messageName];
			delete this.messageBuffers[messageName]; // clear the entry, so `doPostMessage` knows to send
			buffers.forEach(function(buffer) {
				doPostMessage.apply(this, buffer);
			}, this);
		}
	};

	// EXPORTED
	// instructs the LocalEnvWorker to set the given name to null
	// - eg LocalEnvWorker.nullify('XMLHttpRequest'); // no ajax
	LocalEnvWorker.prototype.nullify = function(name) {
		this.postNamedMessage('nullify', name);
	};

	// EXPORTED
	// instructs the LocalEnvWorker to import the JS given by the URL
	// - eg LocalEnvWorker.importJS('/my/script.js', onImported);
	// - urls may be a string or an array of strings
	// - note, `urls` may contain data-urls of valid JS
	// - `cb` is called with the respond message
	//   - on error, .data will be { error:true, reason:'message' }
	LocalEnvWorker.prototype.importScripts = function(urls, cb) {
		this.postNamedMessage('importScripts', urls, cb);
	};

	// EXPORTED
	// destroys the LocalEnvWorker
	LocalEnvWorker.prototype.terminate = function() {
		// just to be safe about callbacks, lets drop all our listeners
		// :TODO: does this do anything?
		var k; // just shut up, JSLint
		for (k in this.messageListeners) {
			delete this.messageListeners[k];
		}
		for (k in this.replyCbs) {
			delete this.replyCbs[k];
		}
		// kill the worker
		this.worker.terminate();
		this.worker = null;
	};
})();// Env Servers
// ===========

(function() {
	var __cur_id = 1;
	function gen_id() { return __cur_id++; }

	// Server
	// ======
	// EXPORTED
	// core type for all servers, should be used as a prototype
	function Server() {
		this.config = { id:gen_id(), domain:null };
	}
	local.env.Server = Server;

	// request handler, should be overwritten by subclasses
	Server.prototype.handleHttpRequest = function(request, response) {
		response.writeHead(0, 'server not implemented');
		response.end();
	};

	// called before server destruction, should be overwritten by subclasses
	// - executes syncronously - does not wait for cleanup to finish
	Server.prototype.terminate = function() {
	};

	// retrieve server source
	// - `requester` is the object making the request
	Server.prototype.getSource = function(requester) {
		return this.handleHttpRequest.toString();
	};


	// WorkerServer
	// ============
	// EXPORTED
	// wrapper for servers run within workers
	// - `config` must include `src`, which must be a URL
	function WorkerServer(config, loaderrorCb) {
		config = config || {};
		Server.call(this);
		this.state = WorkerServer.BOOT;

		for (var k in config)
			this.config[k] = config[k];

		if (!this.config.src)
			this.config.src = '';
		if (!this.config.srcBaseUrl) {
			if (/^data/.test(this.config.src) === false) // scriptBaseUrl is used for relative-path require()s in the worker
				this.config.srcBaseUrl = this.config.src.replace(/\/[^/]+$/,'/');
			else
				this.config.srcBaseUrl = '';
		}
		if (!this.config.domain) // assign a temporary label for logging if no domain is given yet
			this.config.domain = '<'+this.config.src.slice(0,40)+'>';
		this.config.environmentHost = window.location.host;

		this.loaderrorCb = loaderrorCb;
		this.readyMessage = null;
		this.canLoadUserscript = false;
		this.activeEventStreams = [];

		// initialize the web worker with the bootstrap script
		this.worker = new local.env.Worker(null, { bootstrapUrl:local.env.config.workerBootstrapUrl });
		this.worker.bufferMessages('httpRequest'); // queue http requests until the app script is loaded
		this.worker.onNamedMessage('ready', this.onWorkerReady, this);
		this.worker.onNamedMessage('terminate', this.terminate, this);
		this.worker.onNamedMessage('httpRequest', this.onWorkerHttpRequest, this);
		this.worker.onNamedMessage('httpSubscribe', this.onWorkerHttpSubscribe, this);
		this.worker.onNamedMessage('log', this.onWorkerLog, this);
	}
	local.env.WorkerServer = WorkerServer;
	WorkerServer.prototype = Object.create(Server.prototype);

	// EXPORTED
	// possible states
	WorkerServer.BOOT   = 0; // initial, not ready to do work
	WorkerServer.READY  = 1; // local bootstrap is loaded, awaiting user script
	WorkerServer.ACTIVE = 2; // local bootstrap and user script loaded, server may handle requests
	WorkerServer.DEAD   = 3; // should be cleaned up

	// runs Local initialization for a worker thread
	// - called when the myhouse worker_bootstrap has finished loading
	WorkerServer.prototype.onWorkerReady = function(message) {
		// disable dangerous APIs
		this.worker.nullify('XMLHttpRequest');
		this.worker.nullify('Worker');
		this.worker.nullify('importScripts');
		// hold onto the ready message and update state, so the environment can finish preparing us
		// (the config must be locked before we continue from here)
		this.state = WorkerServer.READY;
		this.readyMessage = message;
		if (this.canLoadUserscript)
			this.loadUserScript();
	};

	WorkerServer.prototype.loadUserScript = function() {
		// flag that the environment is ready for us
		this.canLoadUserscript = true;
		if (this.state != WorkerServer.READY)
			return; // wait for the worker to be ready
		// send config to the worker thread
		this.worker.postReply(this.readyMessage, this.config);
		// encode src in base64 if needed
		var src = this.config.src;
		if (src.indexOf('data:application/javascript,') === 0)
			src = 'data:application/javacsript;base64,'+btoa(src.slice(28));
		// load the server program
		var self = this;
		this.worker.importScripts(src, function(importRes) {
			if (importRes.data.error) {
				if (self.loaderrorCb) self.loaderrorCb(importRes.data);
				self.terminate();
				return;
			}
			if (self.state != WorkerServer.DEAD) {
				self.state = WorkerServer.ACTIVE;
				self.worker.releaseMessages('httpRequest'); // stop buffering
			}
		});
	};

	// destroys the server
	// - called when the worker has died, or when the environment wants the server to die
	WorkerServer.prototype.terminate = function() {
		this.state = WorkerServer.DEAD;
		this.activeEventStreams.forEach(function(stream) { if (stream) { stream.close(); }});
		this.worker.terminate();
	};

	// retrieve server source
	// - `requester` is the object making the request
	WorkerServer.prototype.getSource = function(requester) {
		if (/^data/.test(this.config.src)) {
			var firstCommaIndex = this.config.src.indexOf(',');
			if (this.config.src.indexOf('data:application/javascript;base64,') === 0)
				return local.promise(atob(this.config.src.slice(firstCommaIndex+1) || ''));
			else
				return local.promise(this.config.src.slice(firstCommaIndex+1) || '');
		}

		// request from host
		var jsRequest = { method:'get', url:this.config.src, headers:{ accept:'application/javascript' }};
		return local.http.dispatch(jsRequest, requester).then(
			function(res) { return res.body; },
			function(res) {
				console.log('failed to retrieve worker source:', res);
				return '';
			}
		);
	};

	// logs the message data
	// - allows programs to run `app.postMessage('log', 'my log message')`
	WorkerServer.prototype.onWorkerLog = function(message) {
		console.log('['+this.config.domain+']', message.data);
	};

	// dispatches a request to local.http and sends the response back to the worker
	// - called when the worker-server issues a request
	// - mirrors app.onNamedMessage('httpRequest') in worker/http.js
	WorkerServer.prototype.onWorkerHttpRequest = function(message) {
		var self = this;
		var request = message.data;

		// pipe the response back to the worker
		var handleResponse = function(response) {
			var stream = self.worker.postReply(message, response);
			if (response.isConnOpen) {
				response.on('data', function(data) { self.worker.postNamedMessage(stream, data); });
				response.on('end', function() { self.worker.endMessage(stream); });
			} else
				self.worker.endMessage(stream);
		};

		// execute the request
		local.http.dispatch(message.data, this).then(handleResponse, handleResponse);
	};

	// routes the subscribe to local.http and sends the events back to the worker
	// - called when the worker-server issues a subscribe
	WorkerServer.prototype.onWorkerHttpSubscribe = function(message) {
		var self = this;
		var request = message.data;

		// create the stream
		var eventStream = local.http.subscribe(request);
		var streamIndex = this.activeEventStreams.push(eventStream);
		eventStream.on('error', function() {
			self.activeEventStreams[streamIndex] = null;
		});

		// listen for further requests - they indicate individual message subscribes
		this.worker.onNamedMessage(message.id, function(message2) {
			if (message2 == 'endMessage') {
				// stream closed
				eventStream.close();
			} else {
				var eventNames = message2.data;
				var msgStream = self.worker.postReply(message2);
				// begin listening
				eventStream.on(eventNames, function(e) {
					// pipe back
					if (self.state != WorkerServer.DEAD)
						self.worker.postNamedMessage(msgStream, e);
				});
			}
		});
	};

	// dispatches the request to the worker for handling
	// - called when a request is issued to the worker-server
	// - mirrors setRequestDispatcher(function) in worker/http.js
	WorkerServer.prototype.handleHttpRequest = function(request, response) {
		var worker = this.worker;
		var requestMessage = worker.postNamedMessage('httpRequest', request, function(reply) {
			if (!reply.data) { throw "Invalid httpRequest reply to document from worker"; }

			response.writeHead(reply.data.status, reply.data.reason, reply.data.headers);
			if (typeof reply.data.body != 'undefined' && reply.data.body !== null)
				response.write(reply.data.body);

			worker.onNamedMessage(reply.id, function(streamMessage) {
				if (streamMessage.name === 'endMessage') {
					response.end();
				} else {
					// :TODO: update headers?
					response.write(streamMessage.data);
				}
			});
		}, this);
		if (request.stream) {
			response.clientResponse.on('close', function() {
				// pass this on to the worker so it can close the stream
				worker.endMessage(requestMessage);
			});
		}
	};
})();// Env Core
// ========

local.env.config = {
	workerBootstrapUrl : 'worker.min.js'
};

local.env.servers = {};
local.env.clientRegions = {};
local.env.numServers = 0;
local.env.numClientRegions = 0;

local.env.addServer = function(domain, server) {
	// instantiate the application
	server.config.domain = domain;
	local.env.servers[domain] = server;
	local.env.numServers++;

	// allow the user script to load
	if (server.loadUserScript)
		server.loadUserScript();

	// register the server
	local.http.registerLocal(domain, server.handleHttpRequest, server);

	return server;
};

local.env.killServer = function(domain) {
	var server = local.env.servers[domain];
	if (server) {
		local.http.unregisterLocal(domain);
		server.terminate();
		delete local.env.servers[domain];
		local.env.numServers--;
	}
};

local.env.getServer = function(domain) { return local.env.servers[domain]; };
local.env.listFilteredServers = function(fn) {
	var list = {};
	for (var k in local.env.servers) {
		if (fn(local.env.servers[k], k)) list[k] = local.env.servers[k];
	}
	return list;
};

local.env.addClientRegion = function(clientRegion) {
	var id;
	if (typeof clientRegion == 'object')
		id = clientRegion.id;
	else {
		id = clientRegion;
		clientRegion = new local.client.Region(id);
	}
	local.env.clientRegions[clientRegion.id] = clientRegion;
	local.env.numClientRegions++;
	return clientRegion;
};

local.env.removeClientRegion = function(id) {
	if (local.env.clientRegions[id]) {
		local.env.clientRegions[id].terminate();
		delete local.env.clientRegions[id];
		local.env.numClientRegions--;
	}
};

local.env.getClientRegion = function(id) { return local.env.clientRegions[id]; };

// dispatch monkeypatch
// - allows the deployment to control request permissions / sessions / etc
// - adds the `origin` parameter, which is the object responsible for the request
var __envDispatchWrapper;
var orgLinkDispatchFn = local.http.dispatch;
local.http.dispatch = function(req, origin) {
	// sane defaults & sanitization
	req.headers = req.headers || {};
	req.query = req.query || {};
	req.method = (req.method) ? req.method.toUpperCase() : 'GET';

	// parse the url
	// (urld = url description)
	if (!req.url)
		req.url = local.http.joinUrl(req.host, req.path);
	if (!req.urld)
		req.urld = local.http.parseUri(req.url);

	// if the urld has query parameters, mix them into the request's query object
	if (req.urld.query) {
		var q = local.http.contentTypes.deserialize(req.urld.query, 'application/x-www-form-urlencoded');
		for (var k in q)
			req.query[k] = q[k];
		delete req.urld.query; // avoid doing this again later
		req.urld.relative = req.urld.path;
	}

	var res = __envDispatchWrapper.call(this, req, origin, orgLinkDispatchFn);
	if (res instanceof local.Promise) { return res; }

	// make sure we respond with a valid client response
	if (!res) {
		res = new local.http.ClientResponse(0, 'Environment did not correctly dispatch the request');
		res.end();
	} else if (!(res instanceof local.http.ClientResponse)) {
		if (typeof res == 'object') {
			var res2 = new local.http.ClientResponse(res.status, res.reason);
			res2.headers = res.headers;
			res2.end(res.body);
			res = res2;
		} else {
			res = new local.http.ClientResponse(0, res.toString());
			res.end();
		}
	}

	// and make sure it's wrapped in a promise
	var p = local.promise();
	if (res.status >= 400 || res.status === 0)
		p.reject(res);
	else
		p.fulfill(res);
	return p;
};
__envDispatchWrapper = function(req, origin, dispatch) {
	return dispatch(req);
};
local.env.setDispatchWrapper = function(fn) {
	__envDispatchWrapper = fn;
};

// response html post-process
// - override this to modify html after it has entered the document
// - useful for adding local.env widgets
var __postProcessRegion = function() {};
local.env.postProcessRegion = function(elem, containerElem) { return __postProcessRegion(elem, containerElem); };
local.env.setRegionPostProcessor = function(fn) {
	__postProcessRegion = fn;
};})();