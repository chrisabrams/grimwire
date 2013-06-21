
// constructs the name of the function to handle the request based on:
// - path, with a /:collection/:item structure
// - method, with methods mapping to Get, Set, AddTo, or Delete
// eg:
// - POST /applications -> applications.httpAddToCollection(request, response)
// - DELETE /inbox/messages/1 -> inboxItems.deleteItem(request, response, id)
// params:
// - `methodMap` is an object of http verbs -> methods
//   - can also specify a _prefix for all methods (eg 'http')
// - `pathMap` is an object of path routes -> handler objects
//   - handler objects define the functions to call
//   - the path route can also map to an array with 2 members
//     - [0] = handler object
//     - [1] = path's postfix
function routeMap(request, response, methodMap, pathMap) {
  // alias the method if in the map
  // eg head -> get, patch -> set
  var method = request.method.toLowerCase();
  if (method in methodMap)
    method = methodMap[method];

  // add a prefix to the function name
  if (methodMap._prefix)
    method = methodMap._prefix+toUpperFirst(method);

  // find a matching route
  var path = request.path;
  for (var route in pathMap) {
    var match = makeRouteRegex(route).exec(path);
    if (match) {
      var handlerObj = pathMap[route];

      // add the path postfix if given
      if (Array.isArray(handlerObj)) {
        method += toUpperFirst(handlerObj[1]);
        handlerObj = handlerObj[0];
      }

      // try to find and call the function
      var args = [request, response].concat(match.slice(1));
      if (method in handlerObj) {
        request.body_.always(function() { // after the body comes in
          handlerObj[method].apply(handlerObj, args);
        });
        return;
      }
      else
        return response.writeHead(405, 'bad method').end();
    }
  }
  response.writeHead(404, 'not found').end();
}

// converts '/:tokenA/:tokenB' into a regex
function makeRouteRegex(route) {
  route = route.replace(/(:[^\/]+)/g, '([^/]+)'); // replace any ':token' with a regex
  if (route.slice(-1) == '/') // remove ending slash -- we'll add that
    route = route.slice(0,-1);
  return new RegExp('^'+route+'/?$', 'i');
}

// http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function toUpperFirst(str) {
  return str.charAt(0).toUpperCase() + str.substr(1);
}

// brings updates into org value
// :NOTE: mutates its first parameter out of laziness
function patch(org, update) {
  if (update === null) { return org; }
  if (!org) { org = {}; }
  for (var k in update) {
    if (typeof org[k] == 'object' && typeof update[k] == 'object')
      org[k] = patch(org[k], update[k]);
    else
      org[k] = update[k];
  }
  return org;
}

function deepClone(obj) {
  // http://jsperf.com/cloning-an-object/2
  // return JSON.parse(JSON.stringify(obj));
  return $.extend(true, {}, obj);
}(function() {
	// GrimRegion
	// ==========
	// extends local.client.Region with some custom behaviors
	function GrimRegion(id) {
		local.client.Region.call(this, id);
		this.cookies = {}; // a map of hostname -> cookie maps
		this.previousState = null; // an object keeping any state of element that this region replaces
    // ^ used to restore the state of the element that a region overtook after it is dismissed

		this.element.addEventListener('drop', this.__handleDrop.bind(this));
		this.element.addEventListener('dragover', this.__handleDragover.bind(this));
		this.element.addEventListener('dragenter', this.__handleDragenter.bind(this));
		this.element.addEventListener('dragleave', this.__handleDragleave.bind(this));
	}
	GrimRegion.prototype = Object.create(local.client.Region.prototype);
	local.client.GrimRegion = GrimRegion;

	// helps determine if two regions share the same owning application
	GrimRegion.prototype.hasSameOrigin = function(region) {
		if (!this.context.urld || !this.context.urld.host || !region.context.urld || !region.context.urld.host)
			return false;
		// origin is determined by primary domain and TLD
		var mine = this.context.urld.host.split('.').slice(-2).join('.');
		var theirs = region.context.urld.host.split('.').slice(-2).join('.');
		return mine == theirs;
	};

	// gives the parent client region, if of the same origin
	GrimRegion.prototype.getParent = function() {
		var el = local.client.findParentNode(this.element.parentNode, function(node) {
			return (node.tagName == 'DIV' && typeof node.dataset.clientRegion != 'undefined');
		});
		if (el) {
			var region = local.env.getClientRegion(el.id);
			if (region && region.hasSameOrigin(this))
				return region;
		}
		return null;
	};

	// gives the uppermost client region of the same origin
	GrimRegion.prototype.getTopmostParent = function() {
		var parent, region = this;
		while ((region = region.getParent()))
			parent = region;
		return parent;
	};

	// closes the view
	GrimRegion.prototype.dismiss = function() {
		local.env.removeClientRegion(this.element.id);
		if (this.previousState) {
			// we have previous state -- revert!
			this.element.innerHTML = this.previousState.html;
		} else
			this.element.parentNode.removeChild(this.element);
	};

	// adds to local's region behaviors:
	// - destroy region if an empty 200 :TODO: deciding this behavior
	// - render notifications for responses with no body
	GrimRegion.prototype.__handleResponse = function(e, request, response) {
		var containerEl = this.element;
		var requestTarget = this.__chooseRequestTarget(e, request);
		if (!requestTarget)
			return;

		var targetRegion = local.env.getClientRegion(requestTarget.id);
		if (targetRegion) {
			targetRegion.__updateContext(request, response);

			// if the target is owned by the app, it's safe to allow mutations
			if (targetRegion.hasSameOrigin(this))
				containerEl = requestTarget;
		}

		// react to the response
		switch (response.status) {
			case 204:
			case 304:
				// no content
				break;

			case 205:
				// reset form
				// :TODO: should this try to find a parent form to requestTarget?
				if (requestTarget.tagName === 'FORM')
					requestTarget.reset();
				break;

			case 210:
				// close view
				targetRegion.dismiss();
				renderResponseNotice(request, response);
				break;

			case 302:
			case 303:
				// dispatch for contents
				var request2 = { method:'get', url:response.headers.location, headers:{ accept:'text/html' }};
				this.dispatchRequest(request2);
				break;

			default:
				if (response.headers['content-type'])
					local.client.renderResponse(requestTarget, containerEl, response);
				else
					renderResponseNotice(request, response);
		}
	};

	function renderResponseNotice(request, response) {
		// render a notice
		var noticeType = 'success';
		if (response.status >= 400)
			noticeType = 'info';
		if (response.status >= 500)
			noticeType = 'error';
		$.pnotify({
			title: response.status + ' ' + response.reason,
			text: request.method.toUpperCase() + ' ' + request.url,
			type: noticeType,
			styling: 'bootstrap'
		});
	}

	// adds to local's region behaviors:
	// - cookies with scope=client are stored in the client
	GrimRegion.prototype.__updateContext = function(request, response) {
		local.client.Region.prototype.__updateContext.call(this, request, response);

		var authority = this.context.urld.authority;
		if (!(authority in this.cookies))
			this.cookies[authority] = {};

		var region;
		var cookies = response.headers['set-cookie'];
		if (cookies) {
			for (var k in cookies) {
				if (cookies[k].scope == 'region')
					region = this;
				else if (cookies[k].scope == 'client')
					region = this.getTopmostParent() || this;
				else
					continue;

				if (cookies[k] === null)
					delete region.cookies[authority][k];
				else
					region.cookies[authority][k] = cookies[k];
			}
		}
	};

	// adds to local's region behaviors:
	// - can target "data-client-region" containers
	GrimRegion.prototype.__chooseRequestTarget = function(e, request) {
		if (request.target == '_element')
			return e.target;

		var el = document.getElementById(request.target);
		if (el) {
			if (typeof el.dataset.clientRegion != 'undefined') {
				var region = local.env.getClientRegion(el.id);
				if (region)
					return el;
				console.error("Element with data-client-region set to 'replace' should be a client region, but isn't. This means Grimwire did something wrong. Dropping response.");
				return null;
			}
			console.error('Request targeted at #'+request.target+', which has no region behavior specified with data-client-region. Dropping response.');
			return null;
		}

		return this.element;
	};


	// dragdrop behaviors
	// -
	function dataTransferHasType(e, t) {
		if (e.dataTransfer.types.indexOf)
			return e.dataTransfer.types.indexOf(t) !== -1;
		if (e.dataTransfer.types.contains)
			return e.dataTransfer.types.contains(t);
		throw "Unable to check type on data transfer object";
	}

	function findParentMicrodataElement(el) {
		return local.client.findParentNode(el, function(node) {
			return (node.tagName == 'DIV' && node.hasAttribute('itemscope'));
		});
	}

	function extractMicroData(el) {
		var data = {};
		// :TODO: embedded items
		$('[itemprop]', el).each(function(i, propEl) {
			var k = propEl.getAttribute('itemprop');
			if (!k) return;

			switch (propEl.tagName) {
				case 'INPUT':
				case 'TEXTAREA':
					data[k] = propEl.value;
					break;

				case 'AREA':
				case 'LINK':
				case 'A':
					data[k] = propEl.href;
					break;

				case 'META':
					data[k] = propEl.getAttribute('content');
					break;

				case 'AUDIO':
				case 'VIDEO':
				case 'IFRAME':
				case 'IMG':
				case 'SOURCE':
				case 'EMBED':
					data[k] = propEl.getAttribute('src');
					break;

				default:
					data[k] = propEl.innerText;
			}
		});
		return data;
	}

	GrimRegion.prototype.__handleDrop = function(e) {
		e.preventDefault();
		e.stopPropagation();

		$('.transform-hover').removeClass('transform-hover');

		if (dataTransferHasType(e, 'text/transform-href')) {
			var transformHref = e.dataTransfer.getData('text/transform-href');
			var microdataElement = findParentMicrodataElement(e.target);
			if (microdataElement) {
				// convert the region into a client region
				var region;
				if (!microdataElement.id || !(region = local.env.getClientRegion(microdataElement.id))) {
					prepClientRegionEl(microdataElement);
					region = new local.client.GrimRegion(microdataElement.id);
					local.env.addClientRegion(region);
				}

				// pull out microdata
				var data;
				if (region.previousState) {
					data = region.previousState.data;
				} else {
					data = extractMicroData(microdataElement);
					// preserve existing state for restoration
					region.previousState = {
						data: data,
						html: microdataElement.innerHTML
					};
				}

				var url = local.web.UriTemplate.parse(transformHref).expand(data);
				var request = {
					method: 'get',
					url: url,
					headers: { accept: 'text/html' }
				};
				region.dispatchRequest(request);
				return false;
			}
		}
	};

	GrimRegion.prototype.__handleDragover = function(e) {
		if (!e.dataTransfer.types) return;

		if (dataTransferHasType(e, 'text/transform-href')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			return false;
		}
	};

	GrimRegion.prototype.__handleDragenter = function(e) {
		if (!e.dataTransfer.types) return;

		if (dataTransferHasType(e, 'text/transform-href')) {
			var microdataElement = findParentMicrodataElement(e.target);
			if (microdataElement)
				microdataElement.classList.add('transform-hover');
		}
	};

	GrimRegion.prototype.__handleDragleave = function(e) {
		var rect;

		// dragleave is fired on all children, so only pay attention if it dragleaves a targetable region
		var microdataElement = findParentMicrodataElement(e.target);
		if (microdataElement) {
			rect = microdataElement.getBoundingClientRect();
			if (e.clientX >= (rect.left + rect.width) || e.clientX <= rect.left || e.clientY >= (rect.top + rect.height) || e.clientY <= rect.top) {
				microdataElement.classList.remove('transform-hover');
			}
		}
	};


	// post-processors
	// -
	window.clientRegionPostProcess = function(el, containerEl) {
		// sanitize and whitelist styles
		$("style").detach();
		$("[style]", el).each(function(i, styledElem) {
			var nStyles = styledElem.style.length;
			for (var j=0; j < nStyles; j++) {
				var k = styledElem.style[j];
				var v = styledElem.style.getPropertyValue(k);

				if (k.indexOf('padding') != -1 || k.indexOf('margin') != -1)
					styledElem.style.setProperty(k, clampSpacingStyles(v));

				else if (isStyleAllowed(k) === false)
					styledElem.style.removeProperty(k);
			}
		});

		// find any new regions
		$('div[data-client-region]', el).each(function(i, container) {
			prepClientRegionEl(container);
			var region = new local.client.GrimRegion(container.id);
			local.env.addClientRegion(region);

			var initUrl = container.dataset.clientRegion;
			if (initUrl)
				region.dispatchRequest(initUrl);
		});
	};


	// styles guarding
	// -
	//http://wiki.whatwg.org/wiki/Sanitization_rules#CSS_Rules
	var styleWhitelist = [
		'display','color','background','font','line-height','line-spacing','text-align','text-decoration','vertical-align',
		'border','box-shadow','overflow','cursor','width','height','max-width','max-height','white-space'
	];
	var nStyleWhitelist = styleWhitelist.length;
	function isStyleAllowed(style) {
		for (var i=0; i < nStyleWhitelist; i++) {
			if (style.indexOf(styleWhitelist[i]) === 0)
				return true;
		}
		return false;
	}
	function clampSpacingStyles(value) {
		return value.replace(/(\-?[\d]+)([A-z]*)/g, function(org, v, unit) {
			var n = +v;
			if (n < 0) return 0;
			return org;
		});
	}


	// helpers
	// -
	var __crid_counter=100;
	function prepClientRegionEl(el) {
		if (!el.id)
			el.id = 'client-region-'+__crid_counter++;
	}
	function makeClientRegionEl(parentEl) {
		var el = document.createElement('div');
		prepClientRegionEl(el);
		parentEl.appendChild(el);
		return el;
	}
})();function attachCookies(request, origin) {
	request.headers.cookie = {};
	// attach session cookies
	var sessionCookies = storageServer.getItem(request.urld.host, '.cookies');
	if (sessionCookies && sessionCookies.items)
		__addCookies(request, sessionCookies.items);

	// attach client & region cookies
	if (origin instanceof local.client.Region) {
		var client = origin.getTopmostParent();
		if (client) {
			var clientCookies = client.cookies[request.urld.authority];
			if (clientCookies)
				__addCookies(request, clientCookies);
		}

		var regionCookies = origin.cookies[request.urld.authority];
		if (regionCookies)
			__addCookies(request, regionCookies);
	}
}

function __addCookies(request, cookies) {
	for (var k in cookies) {
		if (k in request.headers.cookie)
			continue;

		request.headers.cookie[k] = cookies[k].value || cookies[k];
		// ^ cookies may be given as a single value or as an object with {value:...}

		// add flagged values to the query object
		if (cookies[k].query)
			request.query[k] = (typeof request.query[k] == 'undefined') ? cookies[k].value : request.query[k];
	}
}

function updateCookies(request, origin, response) {
	var cookies = response.headers['set-cookie'];
	if (cookies) {
		var storedCookies = storageServer.getItem(request.urld.host, '.cookies') || {id:'.cookies',items:{}};
		if (!storedCookies.items || typeof storedCookies.items != 'object')
			storedCookies.items = {}; // save us from corruption
		for (var k in cookies) {
			if (cookies[k].scope && cookies[k].scope != 'session')
				continue;

			if (cookies[k] === null)
				delete storedCookies.items[k];
			else
				storedCookies.items[k] = cookies[k];
		}
		storageServer.setItem(request.urld.host, storedCookies);
	}
}(function() {
  function handleTransformDragstart(e) {
    var elem = e.target;
    if (elem.tagName != 'A' || !elem.classList.contains('transform'))
      return;

    if (!elem.getAttribute('href'))
      e.dataTransfer.effectAllowed = 'none';
    else {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/transform-href', elem.getAttribute('href'));
    }
  }

  document.addEventListener('dragstart', handleTransformDragstart);
})();// based on https://github.com/jeromegn/Backbone.localStorage
// thanks to jeromegn and contributors

(function(exports) {

	// StorageServer
	// =============
	// EXPORTED
	// generic collection storage, wraps the localStorage and sessionStorage APIs
	// - 'storageAPI' - an object which exports the localStorage/sessionStorage API
	function StorageServer(storageAPI) {
		local.env.Server.call(this);
		this.storage = storageAPI || localStorage;
		this.collections = {};
	}
	StorageServer.prototype = Object.create(local.env.Server.prototype);

	StorageServer.prototype.handleHttpRequest = function(request, response) {
		// :DEBUG: temporary helper fn
		var handled = false, self = this;
		function route(method, path, fn) {
			if (handled) return;
			if (method && path) {
				path = makepathregex(path);
				if (path.test(request.path) && RegExp('^'+method+'$','i').test(request.method)) {
					handled = true;
					var match = path.exec(request.path);
					// (request, response, match1, match2, match3...)
					var args = [request, response].concat(match.slice(1));
					request.body_.always(function() {
						fn.apply(self, args);
					});
				}
			} else
				response.writeHead(404,'not found').end();
		}

		route('HEAD',   '^/?$', httpListCollections);
		route('GET',    '^/?$', httpListCollections);
		route('POST',   '^/?$', httpGenUniqueCollection);
		route('HEAD',   '^/:collection/?$', httpGetCollection);
		route('GET',    '^/:collection/?$', httpGetCollection);
		route('POST',   '^/:collection/?$', httpAddItem);
		route('DELETE', '^/:collection/?$', httpDeleteCollection);
		route('HEAD',   '^/:collection/:item/?$', httpGetItem);
		route('GET',    '^/:collection/:item/?$', httpGetItem);
		route('PUT',    '^/:collection/:item/?$', httpSetItem);
		route('PATCH',  '^/:collection/:item/?$', httpUpdateItem);
		route('DELETE', '^/:collection/:item/?$', httpDeleteItem);
		route();
	};

	// gets (or creates) the collection and returns the keys of its items
	// - localstorage has no collection mechanism, so we have to manually track which items are in which collection
	StorageServer.prototype.getCollection = function(cid) {
		if (!this.collections[cid]) {
			var itemKeys = this.storage.getItem(cid);
			this.collections[cid] = (itemKeys) ? itemKeys.split(',') : [];
		}
		return this.collections[cid];
	};

	StorageServer.prototype.saveCollection = function(cid) {
		if (this.collections[cid])
			this.storage.setItem(cid, this.collections[cid].join(","));
	};

	StorageServer.prototype.removeCollection = function(cid) {
		if (this.collections[cid]) {
			this.collections[cid].forEach(function(iid) {
				this.storage.removeItem(cid+'|'+iid);
			}, this);
			this.storage.removeItem(cid);
			delete this.collections[cid];
		}
	};

	StorageServer.prototype.listCollectionItems = function(cid) {
		var collection = this.getCollection(cid);
		return collection
			.map(function(iid) { return this.getItem(cid, iid); }, this)
			.filter(function(item) { return item !== null; });
	};

	StorageServer.prototype.getItem = function(cid, iid) {
		try { return JSON.parse(this.storage.getItem(cid+'|'+iid)); }
		catch (e) { return null; }
	};

	StorageServer.prototype.setItem = function(cid, item) {
		// store item
		if (!item.id)
			item.id = guid();
		this.storage.setItem(cid+'|'+item.id, JSON.stringify(item));

		// update collection
		var collection = this.getCollection(cid);
		if (collection.indexOf(item.id.toString()) === -1) {
			collection.push(item.id.toString());
			this.saveCollection(cid);
		}
	};

	StorageServer.prototype.removeItem = function(cid, iid) {
		var collection = this.getCollection(cid);
		this.collections[cid] = collection.filter(function(iid2) { return iid != iid2; });
		this.saveCollection(cid);
		this.storage.removeItem(cid+'|'+iid);
	};

	// INTERNAL
	// ========

	function S4() {
		return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
	}

	function guid() {
		return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
	}

	// helps produce nice-looking routes
	function makepathregex(str) {
		return new RegExp(str.replace(/\:collection/g, '([A-z0-9_\\-\\.]+)').replace(/\:item/g, '([^/]+)'));
	}

	function buildServiceHeaders() {
		var headers = {
			link:[
				{ href:'/', rel:'self current' },
				{ href:'/{id}', rel:'collection' }
			]
		};
		Object.keys(this.collections).forEach(function(cid) {
			headers.link.push({ href:'/'+cid, rel:'collection', id:cid });
		});
		return headers;
	}

	function buildCollectionHeaders(cid) {
		var headers = {
			link:[{ href:'/', rel:'up via service' }]
		};
		if (cid) {
			headers.link.push({ href:'/'+cid, rel:'self current' });
			headers.link.push({ href:'/'+cid+'/{id}', rel:'item' });
		}
		return headers;
	}

	function buildItemHeaders(cid, iid) {
		var headers = {
			link:[{ href:'/', rel:'via service' }]
		};
		if (cid)
			headers.link.push({ href:'/'+cid, rel:'up collection' });
		if (iid)
			headers.link.push({ href:'/'+cid+'/'+iid, rel:'self current' });
		return headers;
	}

	// GET /
	function httpListCollections(request, response) {
		var headers = buildServiceHeaders.call(this);
		if (/get/i.test(request.method)) {
			headers['content-type'] = 'application/json';
			response.writeHead(200, 'ok', headers).end(this.collections);
		} else
			response.writeHead(200, 'ok', headers).end();
	}

	// POST /
	function httpGenUniqueCollection(request, response) {
		var cid;
		do { cid = guid(); } while (typeof this.collections[cid] != 'undefined');
		this.collections[cid] = []; // now defined, not available

		var headers = buildServiceHeaders.call(this);
		headers.location = '/'+cid;
		headers['content-type'] = 'application/json';
		response.writeHead(201, 'created', headers).end({ id:cid });
	}

	// GET /:collection
	function httpGetCollection(request, response, cid) {
		var headers = buildCollectionHeaders.call(this, cid);
		if (/get/i.test(request.method)) {
			headers['content-type'] = 'application/json';
			response.writeHead(200, 'ok', headers).end(this.listCollectionItems(cid));
		} else
			response.writeHead(200, 'ok', headers).end();
	}

	// POST /:collection
	function httpAddItem(request, response, cid) {
		if (!request.body || typeof request.body != 'object')
			return response.writeHead(422, 'unprocessable entity').end('request body required as a JSON object');

		this.setItem(cid, request.body);
		var headers = buildCollectionHeaders.call(this, cid);
		headers.location = '/'+cid+'/'+request.body.id;
		headers['content-type'] = 'application/json';
		response.writeHead(201, 'created', headers).end({ id:request.body.id });
	}

	// DELETE /:collection
	function httpDeleteCollection(request, response, cid) {
		this.removeCollection(cid);
		response.writeHead(204, 'no content', buildCollectionHeaders.call(this, cid)).end();
	}

	// GET /:collection/:id
	function httpGetItem(request, response, cid, iid) {
		var headers = buildItemHeaders.call(this, cid, iid);
		var item = this.getItem(cid, iid);
		if (item) {
			if (/get/i.test(request.method)) {
				headers['content-type'] = 'application/json';
				response.writeHead(200, 'ok', headers).end(item);
			} else
				response.writeHead(200, 'ok', headers).end();
		} else
			response.writeHead(404, 'not found', headers).end();
	}

	// PUT /:collection/:id
	function httpSetItem(request, response, cid, iid) {
		if (!request.body || typeof request.body != 'object')
			return response.writeHead(422, 'unprocessable entity').end('request body required as a JSON object');

		request.body.id = iid;
		this.setItem(cid, request.body);
		response.writeHead(204, 'no content', buildItemHeaders.call(this, cid, iid)).end();
	}

	// PATCH /:collection/:id
	function httpUpdateItem(request, response, cid, iid) {
		if (!request.body || typeof request.body != 'object')
			return response.writeHead(422, 'unprocessable entity').end('request body required as a JSON object');

		var item = this.getItem(cid, iid);
		if (item) {
			item = patch(item, request.body);
			this.setItem(cid, item);
			response.writeHead(204, 'no content', buildItemHeaders.call(this, cid, iid)).end();
		} else
			response.writeHead(404, 'not found', buildItemHeaders.call(this, cid, iid)).end();
	}

	// DELETE /:collection/:id
	function httpDeleteItem(request, response, cid, iid) {
		this.removeItem(cid, iid);
		response.writeHead(204, 'no content', buildItemHeaders.call(this, cid, iid)).end();
	}

	// brings updates into org value
	// :NOTE: mutates its first parameter out of laziness
	function patch(org, update) {
		if (update === null) { return null; }
		if (org === null) { org = {}; }
		for (var k in update) {
			if (typeof org[k] == 'object' && typeof update[k] == 'object')
				org[k] = patch(org[k], update[k]);
			else
				org[k] = update[k];
		}
		return org;
	}

	exports.StorageServer = StorageServer;
})(window);(function(exports) {
	// ConfigServer
	// ============
	// EXPORTED
	// interfaces over host and userdata config
	// - loads host's static configs, then merges userdata config over it
	// - provides UIs and APIs for reading static and read/writing userdata
	// - embeds worker-provided config interfaces in UI
	function ConfigServer(storageHost) {
		local.env.Server.call(this);

		this.storageHost = storageHost;
		this.storageHost.apps = storageHost.collection('apps');
		this.storageHost.workerCfgs = storageHost.collection('workercfgs');

		this.hostEnvConfig = {}; // :NOTE: as provided by the host
		this.hostAppConfigs = {}; // :NOTE: as provided by the host
		// ^ to get config with user settings mixed in, use getAppConfig()
		this.activeAppId = null;
		this.openAppIds = ['_apps']; // list of apps which are open
		this.defaultAppId = null; // set to the first enabled app by openEnabledApps

		// add special environment apps
		this.hostAppConfigs['_apps'] = {
			id: '_apps',
			title: 'Applications',
			startpage: 'httpl://config.env/apps'
		};

		this.broadcasts = {
			apps: local.web.broadcaster(),
			activeApp: local.web.broadcaster()
		};
	}
	ConfigServer.prototype = Object.create(local.env.Server.prototype);

	ConfigServer.prototype.handleHttpRequest = function(request, response) {
		routeMap(request, response,
			{ _prefix:'http', head:'get', patch:'set', put:'set', post:'addTo' },
			{
				'/': [this, 'Service'],
				'/workers': [this, 'Workers'],
				'/workers/:domain': [this, 'Worker'],
				'/workers/:domain/src': [this, 'WorkerSource'],
				'/apps': [this, 'Apps'],
				'/apps/:id': [this, 'App']
			}
		);
	};

	// api
	// -

	ConfigServer.prototype.loadFromHost = function(url) {
		url = url || '.host.json';
		var self = this;
		// load json at given url
		return local.web.navigator(url).getJson()
			.succeed(function(res) {
				self.hostEnvConfig = res.body;

				// may still be a string if the host didnt give an accurate content-type header
				if (typeof self.hostEnvConfig == 'string')
					self.hostEnvConfig = JSON.parse(self.hostEnvConfig);

				// load application configs
				var appConfigGETs = self.hostEnvConfig.applications.map(function(url) { return local.web.navigator(url).getJson(); });
				return local.promise.bundle(appConfigGETs);
			})
			.succeed(function(responses) {
				// save app configs
				responses.forEach(function(res) {
					if (!res.body) return;
					// may still be a string if the host didnt give an accurate content-type header
					if (typeof res.body == 'string')
						res.body = JSON.parse(res.body);
					if (!res.body.id) console.error("Invalid application config: `id` is required", res.body);
					self.hostAppConfigs[res.body.id] = res.body;
				});
				// use the getter so we can mix in config from userdata
				return self.getAppConfigs();
			});
	};

	ConfigServer.prototype.openApp = function(appId) {
		var self = this;
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
				if (appCfg.id && appCfg.id.charAt(0) !== '_') { // dont validate environment apps
					var errors = validateAppConfig(appCfg);
					if (errors) throw "Invalid application config for '"+appId+"': "+JSON.stringify(errors);
				}

				if (self.openAppIds.indexOf(appId) !== -1)
					return appCfg; // dont open twice
				self.openAppIds.push(appId);

				// load workers
				if (Array.isArray(appCfg.workers)) {
					var workerLoads = [];
					appCfg.workers.forEach(function(workerCfg) {
						workerCfg = deepClone(workerCfg);
						var errors = validateWorkerConfig(workerCfg);
						if (errors) return console.error('Invalid worker config:', errors, workerCfg);
						prepWorkerConfig(workerCfg, appCfg);
						workerLoads.push(self.getWorkerUserConfig(workerCfg.domain)
							.succeed(function(userCfg) {
								workerCfg.usr = userCfg;
								local.env.addServer(workerCfg.domain, new local.env.WorkerServer(workerCfg));
							}));
					});
					return local.promise.bundle(workerLoads).then(function() { return appCfg; });
				}

				// :TODO: broadcast update or open event on the app?
				return appCfg;
			});
	};

	ConfigServer.prototype.closeApp = function(appId) {
		var self = this;
		return this.getAppConfig(appId)
			.succeed(function(appCfg) {
				var index = self.openAppIds.indexOf(appId);
				if (index === -1)
					return appCfg; // dont close twice
				self.openAppIds.splice(index, 1);

				// close all workers
				if (Array.isArray(appCfg.workers)) {
					appCfg.workers.forEach(function(workerCfg) {
						var server = local.env.servers[makeWorkerDomain(workerCfg, appId)];
						if (server instanceof local.env.WorkerServer)
							local.env.killServer(server.config.domain);
					});
				}
				// :TODO: broadcast update or close event on the app?
				return appCfg;
			});
	};

	ConfigServer.prototype.reloadApp = function(appId) {
		this.closeApp(appId);
		this.openApp(appId);
	};

	ConfigServer.prototype.setActiveApp = function(appId) {
		var self = this;
		if (!appId)
			appId = this.defaultAppId;
		this.getAppConfig(appId).then(
			function(appCfg) {
				self.activeAppId = appId;
				self.broadcasts.activeApp.emit('update', appCfg);
			},
			function() {
				console.error('Failed to set active app to "'+appId+'": not found');
			});
	};

	ConfigServer.prototype.setAppEnabled = function(appId, enabled) {
		var self = this;
		return this.getEnvConfig()
			.succeed(function(envCfg) {
				if (!envCfg.disabled || !Array.isArray(envCfg.disabled))
					envCfg.disabled = [];

				var index = envCfg.disabled.indexOf(appId);
				if (enabled) {
					if (index !== -1)
						envCfg.disabled.splice(index, 1);
				} else {
					if (index === -1)
						envCfg.disabled.push(appId);
				}

				return self.setEnvConfig(envCfg);
			});
	};
	ConfigServer.prototype.enableApp = function(appId) { return this.setAppEnabled(appId, true); };
	ConfigServer.prototype.disableApp = function(appId) { return this.setAppEnabled(appId, false); };

	ConfigServer.prototype.openEnabledApps = function() {
		var self = this;
		var envCfg;
		return this.getEnvConfig()
			.succeed(function(cfg) {
				envCfg = cfg;
				if (!envCfg.disabled || !Array.isArray(envCfg.disabled))
					envCfg.disabled = [];

				return self.getAppIds();
			})
			.succeed(function(appIds) {
				var opens = [];
				appIds.forEach(function(id) {
					if (id.charAt(0) != '_' && id != '.host' && envCfg.disabled.indexOf(id) === -1) {
						if (!self.defaultAppId) self.defaultAppId = id;
						opens.push(self.openApp(id));
					}
				});
				return local.promise.bundle(opens);
			});
	};

	ConfigServer.prototype.getEnvConfig = function() {
		var self = this;
		return this.storageHost.apps.item('.host').getJson()
			.then(
				function(res) {	return res.body; },
				function() { return deepClone(self.hostEnvConfig); }
			)
			.succeed(function(cfg) {
				if (!cfg.disabled || !Array.isArray(cfg.disabled))
					cfg.disabled = [];
				return cfg;
			});
	};

	ConfigServer.prototype.setEnvConfig = function(cfg) {
		return this.storageHost.apps.item('.host').put(cfg, 'application/json');
	};

	ConfigServer.prototype.getAppIds = function() {
		var self = this;
		var appIds = Object.keys(self.hostAppConfigs);
		// read the user's apps collection
		return this.storageHost.apps.getJson()
			.succeed(function(res) {
				var userApps = res.body;
				if (userApps && userApps.length > 0)
					return appIds.concat(userApps.map(function(app) { return app.id; }));
				return appIds;
			})
			.fail(function() {
				return appIds;
			});
	};

	ConfigServer.prototype.getOpenAppIds = function() {
		var self = this;
		var envCfg;
		return this.getEnvConfig()
			.succeed(function(cfg) {
				envCfg = cfg;
				return self.getAppIds();
			})
			.succeed(function(appIds) {
				return appIds.filter(function(id) { return (envCfg.disabled.indexOf(id) === -1); });
			});
	};

	ConfigServer.prototype.getAppConfigs = function() {
		var self = this;
		var appConfigs = deepClone(this.hostAppConfigs);
		for (var id in appConfigs)
			appConfigs[id]._readonly = true;
		// read the user's apps collection
		return this.storageHost.apps.getJson()
			.then(function(res) { return res.body || []; }, function() { return []; })
			.succeed(function(userAppConfigs) {
				// mix user app config & host app config
				userAppConfigs.forEach(function (app, i) {
					if (app.id == '.host')
						return;
					appConfigs[app.id] = app;
				});
				return appConfigs;
			})
			.succeed(function(appConfigs) {
				// add _active flag
				for (var id in appConfigs)
					appConfigs[id]._active = (self.openAppIds.indexOf(id) !== -1);
				return appConfigs;
			});
	};

	ConfigServer.prototype.getOpenAppConfigs = function() {
		var self = this;
		var appCfgs;
		return this.getAppConfigs()
			.succeed(function(cfgs) {
				appCfgs = cfgs;
				return self.getEnvConfig();
			})
			.succeed(function(envCfg) {
				envCfg.disabled.forEach(function(id) {
					if (id in appCfgs)
						delete appCfgs[id];
				});
				return appCfgs;
			});
	};

	ConfigServer.prototype.getAppConfig = function(appId) {
		var promise;

		// given a config object?
		if (appId && typeof appId == 'object')
			promise = local.promise(deepClone(appId));
		// host app?
		else if (appId in this.hostAppConfigs)
			promise = local.promise(patch(deepClone(this.hostAppConfigs[appId]), { _readonly:true }));
		// user app?
		else {
			promise = this.storageHost.apps.item(appId).getJson()
				.succeed(function(res) { return res.body; });
		}

		// add _active flag
		var self = this;
		return promise
			.succeed(function(cfg) {
				cfg._active = (self.openAppIds.indexOf(cfg.id) !== -1);
				return cfg;
			});
	};

	ConfigServer.prototype.loadUserApp = function(cfg) {
		var self = this;
		return this.getAppConfig(cfg.id)
			.succeed(function(collidingAppCfg) {
				// app id in use, increment the trailing # and try again
				cfg.id = (''+cfg.id).replace(/(\d+)?$/, function(v) { return (+v || 1)+1; });
				if (cfg.startpage)
					cfg.startpage = cfg.startpage.replace(/\.([^\/]*)\.usr/, '.'+cfg.id+'.usr');
				return self.loadUserApp(cfg);
			})
			.fail(function() {
				// app id free, save
				// strip private variables
				for (var k in cfg) {
					if (k.charAt(0) == '_')
						delete cfg[k];
				}
				return self.storageHost.apps.item(cfg.id).put(cfg, 'application/json')
					.succeed(function() {
						self.broadcastOpenApps();
					});
			});
	};

	ConfigServer.prototype.unloadUserApp = function(appId) {
		if (appId && typeof appId == 'object')
			appId = appId.id;
		var self = this;
		return this.storageHost.apps.item(appId).delete()
			.succeed(function() {
				self.broadcastOpenApps();
				return self.getEnvConfig();
			})
			.succeed(function(envCfg) {
				// remove from disableds - the id might get reused later
				var index = envCfg.disabled.indexOf(appId);
				if (appId !== -1)
					envCfg.disabled.splice(index, 1);
				return self.setEnvConfig(envCfg);
			});
	};

	ConfigServer.prototype.getWorkerUserConfig = function(domain) {
		return this.storageHost.workerCfgs.item(domain).getJson()
				.then(function(res) { return res.body; }, function() { return {}; });
	};

	ConfigServer.prototype.broadcastOpenApps = function() {
		var self = this;
		self.getOpenAppConfigs().then(function(appCfgs) {
			self.broadcasts.apps.emit('update', appCfgs);
		});
	};

	// handlers
	// -

	ConfigServer.prototype.httpGetService = function(request, response) {
		var headers = {
			link: [
				{ rel:'self', href:'/' },
				{ rel:'collection', href:'/apps', id:'apps' },
				{ rel:'collection', href:'/{id}' }
			]
		};
		if (/html/.test(request.headers.accept))
			response.writeHead(501, 'not implemented').end(); // :TODO:
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpGetWorkers = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/workers' },
				{ rel:'item', href:'/workers/{id}' }
			]
		};
		if (/html/.test(request.headers.accept)) {
			response.writeHead(501, 'not implemented').end();
		} else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpGetWorker = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers' },
				{ rel:'self', href:'/workers/'+domain }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			response.writeHead(200, 'ok', headers).end(views.workerCfg(server.config));
		} else
			response.writeHead(406, 'bad accept type').end();
	};

	ConfigServer.prototype.httpSetWorker = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers' },
				{ rel:'self', href:'/workers/'+domain }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/json|form/.test(request.headers['content-type'])) {
			var self = this;
			this.getWorkerUserConfig(domain)
				.succeed(function(workerUserCfg) {
					var workerCfg = server.config;
					if (/PATCH/i.test(request.method))
						workerUserCfg = patch(workerUserCfg, request.body);
					else
						workerUserCfg = request.body;
					workerCfg.usr = workerUserCfg;

					self.storageHost.workerCfgs.item(domain).put(workerUserCfg);
					if (!request.query.noreload)
						reloadWorker(server, workerCfg);

					response.writeHead(204, 'no content').end();
				});
		} else
			response.writeHead(415, 'bad content type').end();
	};

	ConfigServer.prototype.httpGetWorkerSource = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers/'+domain },
				{ rel:'self', href:'/workers/'+domain+'/src' }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			this.getAppConfig(server.config.appId).then(function(appCfg) {
				server.getSource().then(function(src) {
					response.writeHead(200, 'ok', headers).end(views.workerSource(server.config, src, appCfg));
				});
			});
		} else
			response.writeHead(406, 'bad accept type').end();
	};

	ConfigServer.prototype.httpSetWorkerSource = function(request, response, domain) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/workers/'+domain },
				{ rel:'self', href:'/workers/'+domain+'/src' }
			]
		};

		var server = local.env.servers[domain];
		if (!server)
			return response.writeHead(404, 'not found').end();

		if (/json|form/.test(request.headers['content-type'])) {
			var self = this;
			var appId = server.config.appId;
			this.getAppConfig(appId)
				.succeed(function(appCfg) {
					// validate and prepare
					var src = request.body.src;
					if (!src)
						return response.writeHead(422, 'request errors').end();
					if (/^http/.test(src) === false) {
						// actual source code - convert to a data uri
						src = 'data:application/javascript,'+src;
					}

					// find the worker object in the app's config
					var workerCfg;
					for (var i=0; i < appCfg.workers.length; i++) {
						if (appCfg.workers[i].id == server.config.id) {
							workerCfg = appCfg.workers[i];
							break;
						}
					}
					if (!workerCfg)
						return response.writeHead(404, 'not found').end();

					// update the app config
					workerCfg.src = src;
					self.storageHost.apps.item(appId).put(appCfg, 'application/json');

					// update the worker
					server.config.src = src;
					reloadWorker(server, server.config);

					response.writeHead(200, 'ok').end();
				});
		} else
			response.writeHead(415, 'bad content type').end();
	};

	ConfigServer.prototype.httpGetApps = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/apps' },
				{ rel:'item', href:'/apps/{id}' },
				{ rel:'http://grimwire.com/rel/index', href:'/apps?schema=grimsearch' }
			]
		};
		if (/event-stream/.test(request.headers.accept)) {
			headers['content-type'] = 'text/event-stream';
			response.writeHead(200, 'ok', headers);
			this.broadcasts.apps.addStream(response);
		}
		else if (/json/.test(request.headers.accept)) {
			headers['content-type'] = 'application/json';
			this.getAppConfigs().then(
				function(cfgs) {
					if (request.query.schema == 'grimsearch') {
						var docs = [];
						for (var appId in cfgs) {
							if (appId.charAt(0) == '_')
								continue;
							docs.push({
								icon: 'hand-right',
								category: 'Applications',
								title: cfgs[appId].title,
								desc: (cfgs[appId]._readonly) ? 'Host Application' : 'User Application',
								href: '#'+appId
							});
						}
						response.writeHead(200, 'ok', headers).end(docs);
					} else
						response.writeHead(200, 'ok', headers).end(cfgs);
				},
				function() { response.writeHead(500).end(); }
			);
		}
		else if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			var view = request.query.view;
			this.getAppConfigs()
				.succeed(function(appCfgs) {
					var html;
					if (view == 'summary') html = views.appsSummary(appCfgs, request.query.inner);
					else if (view == 'sidenav') html = views.appsSidenav(appCfgs, request.query.selection);
					else html = views.appsMain(appCfgs);

					headers['content-type'] = 'text/html';
					response.writeHead(200, 'ok', headers).end(html);
				})
				.fail(function() { response.writeHead(500, 'internal error').end(); });
		}
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpAddToApps = function(request, response) {
		var headers = {
			link: [
				{ rel:'up via service', href:'/' },
				{ rel:'self', href:'/apps' },
				{ rel:'item', href:'/apps/{id}' }
			]
		};

		var sendErrResponse = function(errs) {
			if (/html/.test(request.headers.accept))
				return response.writeHead(422, 'request errors', {'content-type':'text/html'})
								.end(views.appLoadNew(errs));
			return response.writeHead(422, 'request errors').end(errs);
		};

		if (!request.body || !request.body.config)
			return sendErrResponse({ config:'Required.' });

		var cfg = request.body.config.content;
		if (typeof cfg == 'string') {
			if (cfg.indexOf('data:') === 0) {
				// if (cfg.indexOf('data:application/json') !== 0)
					// return sendErrResponse({ config:'Invalid file-type - must be JSON.' });

				cfg = atob(cfg.split(',')[1]);
				if (!cfg)
					return sendErrResponse({ config:'Failed internal file handling - malformed data URI.' });

				try { cfg = JSON.parse(cfg); }
				catch (e) {
					return sendErrResponse({ config:'Failed parsing JSON - '+e.message });
				}
			}
		}

		var errors = validateAppConfig(cfg);
		if (errors)
			return sendErrResponse({ config:errors });

		var self = this;
		this.loadUserApp(cfg)
			.then(function() {
				self.openApp(cfg.id);
				if (/html/.test(request.headers.accept)) {
					headers['content-type'] = 'text/html';
					self.getAppConfigs().succeed(function(appCfgs) {
						response.writeHead(201, 'created', headers);
						response.end(views.appsSummary(appCfgs));
					});
				} else
					response.writeHead(201, 'created', headers).end();
			}, function() {
				response.writeHead(500, 'internal error').end();
			});
	};

	ConfigServer.prototype.httpGetApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active') {
			if (/event-stream/.test(request.headers.accept)) {
				headers['content-type'] = 'text/event-stream';
				response.writeHead(200, 'ok', headers);
				this.broadcasts.activeApp.addStream(response);
				return;
			}
			appId = this.activeAppId; // give the correct id and let handle below
		}

		// "new app" special item
		if (appId == '.new') {
			if (/html/.test(request.headers.accept)) {
				headers['content-type'] = 'text/html';
				return response.writeHead(200, 'ok', headers).end(views.appLoadNew());
			} else
				return response.writeHead(406, 'not acceptable').end();
		}

		// standard app item
		if (/json/.test(request.headers.accept)) {
			headers['content-type'] = 'application/json';
			this.getAppConfig(appId).then(
				function(cfg) { response.writeHead(200, 'ok', headers).end(cfg); },
				function()    { response.writeHead(404, 'not found').end(); }
			);
		}
		else if (/html/.test(request.headers.accept)) {
			headers['content-type'] = 'text/html';
			this.getAppConfig(appId).then(
				function(cfg) {
					response.writeHead(200, 'ok', headers).end(views.appCfg(cfg, cfg, null, null));
				},
				function() {
					response.writeHead(404, 'not found', headers).end('<h2 class="muted">App Not Found</h2>');
				}
			);
		}
		else if (/head/i.test(request.method))
			response.writeHead(200, 'ok', headers).end();
		else
			response.writeHead(406, 'not acceptable').end();
	};

	ConfigServer.prototype.httpDuplicateApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		var self = this;
		this.getAppConfig(appId).then(
			function(cfg) {
				self.loadUserApp(cfg)
					.then(function() {
						self.openApp(cfg.id);
						if (/html/.test(request.headers.accept))
							response.writeHead(201, 'created', {'content-type':'text/html'}).end(views.appCfg(cfg, cfg, null, null));
						else
							response.writeHead(201, 'created').end();
					}, function() {
						response.writeHead(500, 'internal error').end();
					});
			},
			function() {
				response.writeHead(404, 'not found').end();
			});
	};

	ConfigServer.prototype.httpDeleteApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		var self = this;
		this.getAppConfig(appId).then(
			function(cfg) {
				if (cfg._readonly)
					return response.writeHead(403, 'forbidden').end();
				self.closeApp(appId);
				self.unloadUserApp(appId);

				if (/html/.test(request.headers.accept)) {
					self.getAppConfigs().succeed(function(appCfgs) {
						headers['content-type'] = 'text/html';
						response.writeHead(200, 'ok', headers).end(views.appsSummary(appCfgs));
					});
				} else
					response.writeHead(200, 'ok', headers).end();
			},
			function() {
				response.writeHead(404, 'not found').end();
			});
	};

	function httpEnableDisableApp(enabled) {
		return function (request, response, appId) {
			var headers = {
				link: [
					{ rel:'via service', href:'/' },
					{ rel:'up', href:'/apps' },
					{ rel:'self', href:'/apps/'+appId }
				]
			};

			// "active app" special item
			if (appId == '.active')
				appId = this.activeAppId;

			var self = this;
			this.getAppConfig(appId).then(
				function(cfg) {
					self.setAppEnabled(appId, enabled);
					if (enabled) self.openApp(appId);
					else self.closeApp(appId);
					self.broadcastOpenApps();

					cfg._active = enabled;
					if (/html/.test(request.headers.accept))
						response.writeHead(200, 'ok', {'content-type':'text/html'}).end(views.appCfg(cfg, cfg, null, null));
					else
						response.writeHead(200, 'ok').end();
				},
				function() {
					response.writeHead(404, 'not found').end();
				});
		};
	}
	ConfigServer.prototype.httpEnableApp = httpEnableDisableApp(true);
	ConfigServer.prototype.httpDisableApp = httpEnableDisableApp(false);

	ConfigServer.prototype.httpDownloadApp = function(request, response, appId) {
		response.writeHead(501, 'not implemented').end();
	};

	ConfigServer.prototype.httpAddToApp = function(request, response, appId) {
		var headers = {
			link: [
				{ rel:'via service', href:'/' },
				{ rel:'up', href:'/apps' },
				{ rel:'self', href:'/apps/'+appId }
			]
		};

		// "active app" special item
		if (appId == '.active')
			appId = this.activeAppId;

		if (/form/.test(request.headers['content-type'])) {
			var self = this;
			this.getAppConfig(appId).then(function(cfg) {
				// allow reconfigure of user apps only
				if (cfg._readonly)
					return response.writeHead(403, 'forbidden').end();

				var newCfg = request.body;

				var parseErrors = {};
				try {
					if (!newCfg.common) newCfg.common = '{}';
					newCfg.common = JSON.parse(newCfg.common);
				}
				catch (e) { parseErrors.common = 'Unable to parse JSON -'+e; }
				try { newCfg.workers = JSON.parse(newCfg.workers); }
				catch (e) { parseErrors.workers = 'Unable to parse JSON -'+e; }
				if (Object.keys(parseErrors).length === 0) parseErrors = null;
				var errors = patch(validateAppConfig(newCfg), parseErrors);

				if (errors)
					return response.writeHead(422, 'request errors', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, newCfg, errors));

				self.storageHost.apps.item(appId).put(newCfg, 'application/json').then(
					function() {
						self.reloadApp(appId);
						self.broadcastOpenApps();

						response.writeHead(200, 'ok', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, newCfg, null, '<i class="icon-ok"></i> <strong>Updated!</strong>'));
					},
					function() {
						response.writeHead(502, 'bad gateway', { 'content-type':'text/html' })
							.end(views.appCfg(cfg, request.body.config, { _body:'Failed to save update' }));
					}
				);
			});
		}
		else
			response.writeHead(415, 'bad content-type').end();
	};

	function validateAppConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.id) errors.id = 'required';
		if (!cfg.startpage) errors.startpage = 'required';
		if (typeof cfg.common != 'object' || Array.isArray(cfg.common)) errors.common = 'must be an object';
		if (!cfg.workers) errors.workers = 'required';
		if (!Array.isArray(cfg.workers) || !cfg.workers.length) errors.workers = 'must be an array with at least 1 member';
		return (Object.keys(errors).length > 0) ? errors : null;
	}

	function validateWorkerConfig(cfg) {
		var errors = {};
		if (!cfg) return { _body:'required' };
		if (!cfg.title) errors.title = 'required';
		if (!cfg.id) errors.id = 'required';
		if (!cfg.src) errors.src = 'required';
		return (Object.keys(errors).length > 0) ? errors : null;
	}

	function prepWorkerConfig(workerCfg, appCfg) {
		if (appCfg.common && typeof appCfg.common == 'object')
			patch(workerCfg, appCfg.common);
		workerCfg.appId = appCfg.id;
		workerCfg.appTitle = appCfg.title;
		workerCfg.appIcon = appCfg.icon;
		workerCfg.domain = makeWorkerDomain(workerCfg, appCfg);
	}

	function makeWorkerDomain(workerId, appId) {
		if (appId && typeof appId == 'object')
			appId = appId.id;
		else if (!appId && workerId && typeof workerId == 'object')
			appId = workerId.appId;
		if (workerId && typeof workerId == 'object')
			workerId = workerId.id;
		return workerId+'.'+appId+'.usr';
	}

	function reloadWorker(server, cfg) {
		// local.env.killServer(domain);
		local.web.unregisterLocal(server.config.domain);
		server.terminate();
		// local.env.addServer(domain, new local.env.WorkerServer(server.config));
		server = local.env.servers[cfg.domain] = new local.env.WorkerServer(cfg);
		server.loadUserScript();
		local.web.registerLocal(cfg.domain, server.handleHttpRequest, server);
		return server;
	}

	var views = {
		appsMain: function(appCfgs, selection) {
			var html = '<div class="row-fluid">'+
					'<div class="well well-small span2" style="padding:9px 0"><form style="margin:0" data-subscribe="httpl://config.env/apps?view=sidenav">'+views.appsSidenav(appCfgs, selection)+'</form></div>'+
					'<div id="cfgappsmain" class="span10" data-client-region="httpl://config.env/apps?view=summary"></div>'+
				'</div>';
			return html;
		},
		appsSidenav: function(appCfgs, selection) {
			selection = selection || '';
			var appIds = Object.keys(appCfgs).join(',');
			var html = '<input type="hidden" name="selection" data-value-valueof=".active" value="'+selection+'">'+
				'<ul class="nav nav-list">';
			html += '<li class="'+((!selection||selection=='undefined') ? 'active' : '')+'"><a href="httpl://config.env/apps?view=summary" target="cfgappsmain" data-toggle="nav"><strong>Applications</strong></a></li>';
			for (var appId in appCfgs) {
				var appCfg = appCfgs[appId];
				if (!appCfg.workers) continue;
				html += views._appsSidenavItem(appCfg, selection);
			}
			html += '</ul>';
			return html;
		},
		_appsSidenavItem: function(appCfg, selection) {
			var appActiveClass = (selection == appCfg.id) ? ' active' : '';
			var html =
				'<li class="nav-header'+appActiveClass+'" value="'+appCfg.id+'">'+
					'<a href="httpl://config.env/apps/'+appCfg.id+'" target="cfgappsmain" data-toggle="nav"><i class="icon-'+appCfg.icon+'"></i> '+appCfg.title+'</a></li>'+
				'</li>';
			if (appCfg._active) {
				html += appCfg.workers
					.map(function(cfg) {
						var domain = makeWorkerDomain(cfg, appCfg.id);
						var cfgUrl = 'httpl://config.env/workers/'+domain;
						var workerActiveClass = (selection == domain) ? 'class="active"' : '';
						return '<li '+workerActiveClass+' value="'+domain+'"><a href="'+cfgUrl+'" target="cfgappsmain" data-toggle="nav">'+cfg.title+'</a></li>';
					})
					.join('');
			}
			return html;
		},
		appsSummary: function(appCfgs, inner) {
			var html = '';
			if (!inner)
				html += '<div data-subscribe="httpl://config.env/apps?view=summary&inner=1">';
			html += '<h4>Applications on '+toUpperFirst(window.location.host)+'</h4><hr/>';
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (!appCfgs[id]._readonly) continue; // readonly only
				html += views._appHeader(appCfgs[id], { nohtml:true })+'<hr/>';
			}
			html += '<br/><br/>'+
				'<h4>Your Applications <small><a href="httpl://config.env/apps/.new"><i class="icon-download-alt"></i> Load New App</a></small></h4>'+
				'<hr/>';
			var userHasApps = false;
			for (var id in appCfgs) {
				if (id.charAt(0) == '_') continue;
				if (appCfgs[id]._readonly) continue; // writeable only
				html += views._appHeader(appCfgs[id], { nohtml:true })+'<hr/>';
				userHasApps = true;
			}
			//<h2 class="muted"><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small> <span class="label">inactive</span></h2>
			if (!userHasApps)
				html += '<p class=muted>Nothing yet!</p>';
			if (!inner)
				html += '</div>';
			return html;
		},
		appCfg: function(cfg, values, errors, msg) {
			errors = errors || {};
			msg = (msg) ? '<div class="alert alert-success" data-lifespan="5">'+msg+'</div>' : '';
			var commonValue = ((typeof values.common == 'string') ? values.common : JSON.stringify(values.common,null,4)).replace(/</g,'&lt;').replace(/>/g,'&gt;');
			var workersValue = ((typeof values.workers == 'string') ? values.workers : JSON.stringify(values.workers,null,4)).replace(/</g,'&lt;').replace(/>/g,'&gt;');
			return views._appHeader(cfg)+'<hr/>'+
				((cfg._readonly) ? '<div class="alert alert-info"><i class="icon-info-sign"></i> Host applications are read-only. Click "Copy to Your Applications" to make changes.</div>' : '')+
				'<form class="form-horizontal" action="httpl://config.env/apps/'+cfg.id+'" method="post">'+
					msg+
					((errors._body) ? '<div class="alert alert-error">'+errors._body+'</div>' : '')+
					'<input type="hidden" name="id" value="'+cfg.id+'" />'+
					views._formControl('title', 'Title', 'text', values.title, errors.title, {readonly:cfg._readonly,required:true})+
					views._formControl('icon', 'Icon', 'text', values.icon, errors.icon, {readonly:cfg._readonly,required:true,help:'via <a href="http://twitter.github.io/bootstrap/base-css.html#icons" target="_blank">Glyphicons</a>'})+
					views._formControl('startpage', 'Startpage', 'url', values.startpage, errors.startpage, {width:'span6',required:true,readonly:cfg._readonly})+
					views._formControl('common', 'Common Config', 'textarea', commonValue, errors.common, {width:'span6',readonly:cfg._readonly,help:'^ Settings given to every worker'})+
					views._formControl('workers', 'Workers', 'textarea', workersValue, errors.workers, {width:'span6',rows:15,required:true,readonly:cfg._readonly})+
					((cfg._readonly) ? '' : '<div class="control-group"><div class="controls"><button class="btn">Update</button></div></div>')+
				'</form>';
		},
		appLoadNew: function(errors) {
			var errMsg = '';
			if (errors) {
				if (typeof errors.config == 'string')
					errMsg = '<div class="alert alert-error">Application file: '+errors.config+'</div>';
				else {
					errMsg = '<div class="alert alert-error"><strong>Mistakes were found in the application file:</strong><br/><ul>';
					for (var k in errors.config) {
						errMsg += '<li>`'+k+'`: '+errors.config[k]+'</li>';
					}
					errMsg += '</ul></div>';
				}
			}
			var html = '<h2>Load New Application</h2><hr/>'+
				'<form action="httpl://config.env/apps" method="post">'+
					errMsg+
					'<input type="file" name="config" required />'+
					'<button class="btn"><i class="icon-ok"></i> Load</button>'+
				'</form>';
			return html;
		},
		workerCfg: function(cfg) {
			return '<h3>'+cfg.domain+'</h3>'+
				'<ul class="nav nav-tabs">'+
					'<li class="active"><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/.grim/config" title="Configure" data-toggle="nav"><i class="icon-cog"></i></a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://config.env/workers/'+cfg.domain+'/src" title="Edit Source" data-toggle="nav"><i class="icon-edit"></i></a></li>'+
					'<li><a target="cfg-'+cfg.domain+'" href="httpl://'+cfg.domain+'/" title="Execute" data-toggle="nav"><i class="icon-hand-right"></i></a></li>'+
				'</ul>'+
				'<div id="cfg-'+cfg.domain+'" data-client-region="httpl://'+cfg.domain+'/.grim/config"></div>'+
				'<hr/>';
		},
		workerSource: function(cfg, src, appCfg) {
			var readonly = (appCfg._readonly) ? 'readonly' : '';
			return '<form action="httpl://config.env/workers/'+cfg.domain+'/src" method="patch">'+
					(appCfg._readonly ? '<div class="alert alert-info"><i class="icon-info-sign"></i> Host applications are read-only. Copy the app to Your Applications to edit the worker source.</div>' : '')+
					'<textarea name="src" class="span10" rows="20" '+readonly+'>'+src.replace(/</g,'&lt;').replace(/>/g,'&gt;')+'</textarea><br/>'+
					'<button class="btn">Update</button>'+
				'</form>';
		},
		_appHeader: function(cfg, options) {
			options = options || {};
			var muted = (cfg._active) ? '' : 'muted';
			var inactive = (cfg._active) ? '' : '<span class="label">inactive</span>';
			var accept = (options.nohtml) ? 'accept="none"' : 'accept="text/html"';
			var html = '<h2 class="'+muted+'"><i class="icon-'+cfg.icon+'"></i> '+cfg.title+' <small>*.'+cfg.id+'.usr</small> '+inactive+'</h2>';
			html += '<form action="httpl://config.env/apps/'+cfg.id+'" '+accept+'>';
			if (cfg._readonly) {
				html +=
					'<ul class="inline">'+
						'<li><button class="btn btn-link" formmethod="download"><i class="icon-download"></i> Save as File</button></li>'+
						'<li><button class="btn btn-link" formmethod="duplicate" formaccept="none"><i class="icon-download-alt"></i> Copy to Your Applications</button></li>'+
						((cfg._active) ?
							'<li><button class="btn btn-link" formmethod="disable"><i class="icon-remove"></i> Disable</button></li>' :
							'<li><button class="btn btn-link" formmethod="enable"><i class="icon-plus"></i> Enable</button></li>'
						)+
					'</ul>';
			} else {
				html +=
					'<ul class="inline">'+
						'<li><button class="btn btn-link" formmethod="download"><i class="icon-download"></i> Save as File</button></li>'+
						'<li><button class="btn btn-link" formmethod="duplicate" formaccept="none"><i class="icon-download-alt"></i> Duplicate</button></li>'+
						'<li><button class="btn btn-link" formmethod="delete"><i class="icon-remove-sign"></i> Unload</button></li>'+
						((cfg._active) ?
							'<li><button class="btn btn-link" formmethod="disable"><i class="icon-remove"></i> Disable</button></li>' :
							'<li><button class="btn btn-link" formmethod="enable"><i class="icon-plus"></i> Enable</button></li>'
						)+
					'</ul>';
			}
			html += '</form>';
			return html;
		},
		_formControl: function(id, label, type, value, error, options) {
			options = options || {};

			var cls = [];
			cls.push(options.width || 'input-large');
			cls = cls.join(' ');

			var readonly = (options.readonly) ? 'readonly' : '';
			var required = (options.required) ? 'required' : '';
			var extraAttrs = readonly+' '+required;

			if (type == 'textarea') {
				var rows = options.rows || 5;
				return '<div class="control-group '+(error?'error':'')+'">'+
						'<label class="control-label" for="'+id+'">'+label+'</label>'+
						'<div class="controls">'+
							'<textarea id="'+id+'" name="'+id+'" class="'+cls+'" rows="'+rows+'" '+extraAttrs+'>'+value+'</textarea>'+
							((error||options.help) ? '<span class="help-block">'+(error||options.help)+'</span>' : '')+
						'</div>'+
					'</div>';
			}
			return '<div class="control-group '+(error?'error':'')+'">'+
					'<label class="control-label" for="'+id+'">'+label+'</label>'+
					'<div class="controls">'+
						'<input type="'+type+'" id="'+id+'" name="'+id+'" class="'+cls+'" placeholder="'+label+'" '+extraAttrs+' value="'+value+'">'+
						((error||options.help) ? '<span class="help-inline">'+(error||options.help)+'</span>' : '')+
					'</div>'+
				'</div>';
		}
	};

	exports.ConfigServer = ConfigServer;
})(window);// WebRTC Peer Server
// ==================

(function() {

	var peerConstraints = {
		optional: [{ RtpDataChannels: true }]
	};
	var mediaConstraints = {
		optional: [],
		mandatory: { OfferToReceiveAudio: false, OfferToReceiveVideo: false }
	};
	var defaultIceServers = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] };

	// RTCPeerServer
	// =============
	// EXPORTED
	// server wrapper for WebRTC connections
	// - currently only supports Chrome
	// - `config.sigRelay`: a URI or navigator instance for a grimwire.com/rel/sse/relay
	// - `config.initiate`: should this peer send the offer? If false, will wait for one
	// - `chanOpenCb`: function, called when request channel is available
	function RTCPeerServer(config, chanOpenCb) {
		var self = this;
		if (!config) config = {};
		if (!config.sigRelay) throw "`config.sigRelay` is required";
		local.env.Server.call(this);

		// :DEBUG:
		this.debugname = config.initiate ? 'A' : 'B';

		// hook up to sse relay
		var signalHandler = onSigRelayMessage.bind(this);
		this.sigRelay = local.web.navigator(config.sigRelay);
		this.sigRelay.subscribe({ headers: { 'last-event-id': -1 } })
			.then(function(stream) {
				self.state.signaling = true;
				self.sigRelayStream = stream;
				stream.on('message', signalHandler);
			});
		this.sigRelayStream = null;

		// create peer connection
		var servers = defaultIceServers;
		if (config.iceServers)
			servers = config.iceServers.concat(servers); // :TODO: is concat what we want?
		this.peerConn = new webkitRTCPeerConnection(servers, peerConstraints);
		this.peerConn.onicecandidate = onIceCandidate.bind(this);

		// create request data channel
		this.reqChannel = this.peerConn.createDataChannel('requestChannel', { reliable: false });
		setupRequestChannel.call(this);
		this.chanOpenCb = chanOpenCb;

		// internal state
		this.__offerOnReady = !!config.initiate;
		this.__isOfferExchanged = false;
		this.__candidateQueue = []; // cant add candidates till we get the offer
		this.__ridcounter = 1; // current request id
		this.__incomingRequests = {}; // only includes requests currently being received
		this.__incomingResponses = {}; // only includes responses currently being received
		this.__reqChannelBuffer = {}; // used to buffer messages that arrive out of order

		// state flags (for external reflection)
		this.state = {
			alive: true,
			signaling: false,
			connected: false
		};

		this.signal({ type: 'ready' });
	}
	window.RTCPeerServer = RTCPeerServer;
	RTCPeerServer.prototype = Object.create(local.env.Server.prototype);

	// :DEBUG:
	RTCPeerServer.prototype.debugLog = function() {
		var args = [this.debugname].concat([].slice.call(arguments));
		console.debug.apply(console, args);
	};


	// server behaviors
	// -

	// request handler
	RTCPeerServer.prototype.handleHttpRequest = function(request, response) {
		this.debugLog('HANDLING REQUEST', request);
		
		if (request.path == '/') {
			// Self resource
			response.setHeader('link', [
				{ href: '/', rel: 'self service via' },
				{ href: '/{id}', rel: 'http://grimwire.com/rel/proxy' }
				// :TODO: any links shared by the peer
			]);
			if (request.method == 'GET') response.writeHead(200, 'ok').end(this.state);
			else if (request.method == 'HEAD') response.writeHead(200, 'ok').end();
			else response.writeHead(405, 'bad method').end();
		}
		else {
			// Proxy resource
			proxyRequestToPeer.call(this, request, response);
		}
	};

	// sends a received request to the peer to be dispatched
	function proxyRequestToPeer(request, response) {
		var self = this;
		var via = getViaDesc.call(this);
		var myHost = 'httpl://'+self.config.domain+'/';

		var targetUrl = decodeURIComponent(request.path.slice(1));
		var targetUrld = local.web.parseUri(targetUrl);
		var theirHost = targetUrld.authority ? (targetUrld.protocol + '://' + targetUrld.authority) : myHost;

		// gen subsequent request
		var req2 = new local.web.Request(request);
		req2.url = targetUrl;
		// add via
		req2.headers.via = (req2.headers.via) ? req2.headers.via.concat(via) : [via];

		// dispatch the request in the peer namespace
		req2.stream = true;
		this.peerDispatch(req2).always(function(res2) {

			// update response links to include the proxy
			if (res2.headers.link) {
				res2.headers.link.forEach(function(link) {
					var urld = local.web.parseUri(link.href);
					if (!urld.host)
						link.href = theirHost + link.href; // prepend their host if they gave relative links
					link.href = myHost + link.href; // now prepend our host
				});
			}
			// add via
			res2.headers.via = (res2.headers.via) ? res2.headers.via.concat(via) : [via];

			// pipe back
			response.writeHead(res2.status, res2.reason, res2.headers);
			res2.on('data', response.write.bind(response));
			res2.on('end', response.end.bind(response));
		});

		// pipe out
		request.on('data', req2.write.bind(req2));
		request.on('end', req2.end.bind(req2));
	}

	// helper, used to gen the via header during proxying
	function getViaDesc() {
		return {
			protocol: { name: 'httpl', version: '0.4' },
			host: this.config.domain,
			comment: 'Grimwire/0.2'
		};
	}

	RTCPeerServer.prototype.terminate = function() {
		closePeer.call(this);
	};


	// request channel behaviors
	// -

	// sends a request to the peer to dispatch in their namespace
	// - `request`: local.web.Request
	// - only behaves as if request.stream == true (no response buffering)
	RTCPeerServer.prototype.peerDispatch = function(request) {
		// generate ids
		var reqid = this.__ridcounter++;
		var resid = -reqid;

		// track the response
		var response_ = local.promise();
		var response = new local.web.Response();
		response.on('headers', function(response) {
			local.web.fulfillResponsePromise(response_, response);
		});
		this.__incomingResponses[resid] = response;

		if (this.state.connected) {
			var reqmid = 0; // message counter in the request stream
			var chan = this.reqChannelReliable;
			chan.send(reqid+':'+(reqmid++)+':h:'+JSON.stringify(request));
			// wire up the request to pipe over
			request.on('data', function(data) { chan.send(reqid+':'+(reqmid++)+':d:'+data); });
			request.on('end', function() { chan.send(reqid+':'+(reqmid++)+':e'); });
			request.on('close', function() { chan.send(reqid+':'+(reqmid++)+':c'); });
		} else {
			// not connected, send a 504
			setTimeout(function() { response.writeHead(504, 'gateway timeout').end(); }, 0);
		}

		return response_;
	};

	// request channel incoming traffic handling
	// - message format: <rid>:<mid>:<message type>[:<message data>]
	//   - rid: request/response id, used to group together messages
	//   - mid: message id, used to guarantee arrival ordering
	//   - message type: indicates message content
	//   - message data: optional, the message content
	// - message types:
	//   - 'h': headers* (new request)
	//   - 'd': data* (request content, may be sent multiple times)
	//   - 'e': end (request finished)
	//   - 'c': close (request closed)
	//   - *includes a message body
	// - responses use the negated rid (request=5 -> response=-5)
	function handleReqChannelIncomingMessage(msg) {
		this.debugLog('REQ CHANNEL RELIABLE MSG', msg);

		var parsedmsg = parseReqChannelMessage(msg);
		if (!parsedmsg) return;

		ensureReqChannelOrder.call(this, parsedmsg, function() {
			if (parsedmsg[0] > 0)
				// received a request to be dispatched within our namespace
				handlePeerRequest.apply(this, parsedmsg);
			else
				// received a response to a previous request of ours
				handlePeerResponse.apply(this, parsedmsg);
		});
	}

	function handlePeerRequest(reqid, mid, mtype, mdata) {
		var chan = this.reqChannelReliable;
		var request;
		if (mtype == 'h') {
			try { request = JSON.parse(mdata); }
			catch (e) { return console.warn('RTCPeerServer - Unparseable request headers message from peer', reqid, mtype, mdata); }

			// redispatch the request on behalf of the peer
			request.stream = true;
			request = new local.web.Request(request);
			local.web.dispatch(request, this).always(function(response) {
				var resid = -reqid; // indicate response with negated request id
				var resmid = 0; // message counter in the response stream
				chan.send(resid+':'+(resmid++)+':h:'+JSON.stringify(response));
				// wire up the response to pipe back
				response.on('data', function(data) { chan.send(resid+':'+(resmid++)+':d:'+data); });
				response.on('end', function() { chan.send(resid+':'+(resmid++)+':e'); });
				response.on('close', function() { chan.send(resid+':'+(resmid++)+':c'); });
			});

			this.__incomingRequests[reqid] = request; // start tracking
		} else {
			request = this.__incomingRequests[reqid];
			if (!request) { return console.warn('RTCPeerServer - Invalid request id', reqid, mtype, mdata); }
			switch (mtype) {
				case 'd': request.write(mdata); break;
				case 'e': request.end(); break;
				case 'c':
					request.close();
					delete this.__incomingRequests[reqid];
					delete this.__reqChannelBuffer[reqid];
					break;
				default: console.warn('RTCPeerServer - Unrecognized message from peer', reqid, mtype, mdata);
			}
		}
	}

	function handlePeerResponse(resid, mid, mtype, mdata) {
		var response = this.__incomingResponses[resid];
		if (!response)
			return console.warn('RTCPeerServer - Invalid response id', resid, mtype, mdata);
		switch (mtype) {
			case 'h':
				try { mdata = JSON.parse(mdata); }
				catch (e) { return console.warn('RTCPeerServer - Unparseable response headers message from peer', resid, mtype, mdata); }
				response.writeHead(mdata.status, mdata.reason, mdata.headers);
				break;
			case 'd': response.write(mdata); break;
			case 'e': response.end(); break;
			case 'c':
				response.close();
				delete this.__incomingResponses[resid]; // stop tracking
				delete this.__reqChannelBuffer[resid];
				break;
			default: console.warn('RTCPeerServer - Unrecognized message from peer', resid, mtype, mdata);
		}
	}

	// splits the message into its parts
	// - format: <rid>:<message type>[:<message>]
	var reqChannelMessageRE = /([\-\d]+):([\-\d]+):(.)(:.*)?/;
	function parseReqChannelMessage(msg) {
		var match = reqChannelMessageRE.exec(msg);
		if (!match) { console.warn('RTCPeerServer - Unparseable message from peer', msg); return null; }
		var parsedmsg = [parseInt(match[1], 10), parseInt(match[2], 10), match[3]];
		if (match[4])
			parsedmsg.push(match[4].slice(1));
		return parsedmsg;
	}

	// tracks messages received in the request channel and delays processing if received out of order
	function ensureReqChannelOrder(parsedmsg, cb) {
		var rid = parsedmsg[0];
		var mid = parsedmsg[1];

		var buffer = this.__reqChannelBuffer[rid];
		if (!buffer)
			buffer = this.__reqChannelBuffer[rid] = { nextmid: 0, cbs: {} };

		if (mid > buffer.nextmid) { // not the next message?
			buffer.cbs[mid] = cb; // hold onto that callback
			this.debugLog('REQ CHANNEL MSG OoO, BUFFERING', parsedmsg);
		} else {
			cb.call(this);
			buffer.nextmid++;
			while (buffer.cbs[buffer.nextmid]) { // burn through the queue
				this.debugLog('REQ CHANNEL DRAINING OoO MSG', buffer.nextmid);
				buffer.cbs[buffer.nextmid].call(this);
				delete buffer.cbs[buffer.nextmid];
				buffer.nextmid++;
			}
		}
	}

	function setupRequestChannel() {
		this.reqChannelReliable = new Reliable(this.reqChannel); // :DEBUG: remove when reliable: true is supported
		this.reqChannel.onopen = onReqChannelOpen.bind(this);
		this.reqChannel.onclose = onReqChannelClose.bind(this);
		this.reqChannel.onerror = onReqChannelError.bind(this);
		// this.reqChannel.onmessage = handleReqChannelMessage.bind(this);
		this.reqChannelReliable.onmessage = handleReqChannelIncomingMessage.bind(this);
	}

	function onReqChannelOpen(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL OPEN', e);
		this.state.connected = true;
		if (typeof this.chanOpenCb == 'function')
			this.chanOpenCb();
		// this.reqChannel.send('Hello! from '+this.debugname);
		// this.reqChannelReliable.send('Reliable Hello! from '+this.debugname);
	}

	function onReqChannelClose(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL CLOSE', e);
	}

	function onReqChannelError(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL ERR', e);
	}


	// signal relay behaviors
	// -

	// called when we receive a message from the relay
	function onSigRelayMessage(m) {
		var self = this;
		var from = m.event, data = m.data;

		if (data && typeof data != 'object') {
			console.warn('RTCPeerServer - Unparseable signal message from'+from, m);
			return;
		}

		// this.debugLog('SIG', m, from, data.type, data);
		switch (data.type) {
			case 'ready':
				// peer's ready to start
				if (this.__offerOnReady)
					sendOffer.call(this);
				break;

			case 'closed':
				closePeer.call(this);
				break;

			case 'candidate':
				this.debugLog('GOT CANDIDATE', data.candidate);
				// received address info from the peer
				if (!this.__isOfferExchanged) this.__candidateQueue.push(data.candidate);
				else this.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: data.candidate }));
				break;

			case 'offer':
				this.debugLog('GOT OFFER', data);
				// received a session offer from the peer
				this.peerConn.setRemoteDescription(new RTCSessionDescription(data));
				handleOfferExchanged.call(self);
				this.peerConn.createAnswer(
					function(desc) {
						self.debugLog('CREATED ANSWER', desc);
						desc.sdp = Reliable.higherBandwidthSDP(desc.sdp); // :DEBUG: remove when reliable: true is supported
						self.peerConn.setLocalDescription(desc);
						self.signal({
							type: 'answer',
							sdp: desc.sdp
						});
					},
					null,
					mediaConstraints
				);
				break;

			case 'answer':
				this.debugLog('GOT ANSWER', data);
				// received session confirmation from the peer
				this.peerConn.setRemoteDescription(new RTCSessionDescription(data));
				handleOfferExchanged.call(self);
				break;

			default:
				console.warn('RTCPeerServer - Unrecognized signal message from'+from, m);
		}
	}

	// helper to send a message to peers on the relay
	RTCPeerServer.prototype.signal = function(data) {
		this.sigRelay.dispatch({
			method: 'notify',
			headers: {
				authorization: this.sigRelay.authHeader,
				'content-type': 'application/json'
			},
			body: data
		}).then(null, function(res) {
			console.warn('RTCPeerServer - Failed to send signal message to relay', res);
		});
	};

	// helper initiates a session with peers on the relay
	function sendOffer() {
		var self = this;
		this.peerConn.createOffer(
			function(desc) {
				self.debugLog('CREATED OFFER', desc);
				desc.sdp = Reliable.higherBandwidthSDP(desc.sdp); // :DEBUG: remove when reliable: true is supported
				self.peerConn.setLocalDescription(desc);
				self.signal({
					type: 'offer',
					sdp: desc.sdp
				});
			},
			null,
			mediaConstraints
		);
	}

	// helper shuts down session
	function closePeer() {
		this.signal({ type: 'closed' });
		this.state.alive = false;
		this.state.signaling = false;
		this.state.connected = false;

		if (this.sigRelayStream)
			this.sigRelayStream.close();
		if (this.peerConn)
			this.peerConn.close();
	}

	// helper called whenever we have a remote session description
	// (candidates cant be added before then, so they're queued in case they come first)
	function handleOfferExchanged() {
		var self = this;
		this.__isOfferExchanged = true;
		this.__candidateQueue.forEach(function(candidate) {
			self.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: candidate }));
		});
		this.__candidateQueue.length = 0;
	}

	// called by the RTCPeerConnection when we get a possible connection path
	function onIceCandidate(e) {
		if (e && e.candidate) {
			this.debugLog('FOUND ICE CANDIDATE', e.candidate);
			// send connection info to peers on the relay
			this.signal({
				type: 'candidate',
				candidate: e.candidate.candidate
			});
		}
	}
})();var grimWidgets = {};

(function() {grimWidgets.lifespan = function(el) {
	var lifespanEls = el.querySelectorAll('[data-lifespan]');
	for (var i = 0; i < lifespanEls.length; i++) {
		(function(lifespanEl) {
			setTimeout(function() {
				if (lifespanEl)
					lifespanEl.parentNode.removeChild(lifespanEl);
			}, lifespanEl.dataset.lifespan * 1000);
		})(lifespanEls[i]);
	}
};grimWidgets.value_of = function(el, containerEl) {
  $("[data-value-valueof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      var $target = $(inputEl.dataset.valueValueof, containerEl);
      if ($target.tagName == 'INPUT' || $target.tagName == 'TEXTAREA')
        inputEl.value = $target.val();
      else
        inputEl.value = $target.attr('value');
    });
  });
  $("[data-value-idof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      inputEl.value = $(inputEl.dataset.valueIdof, containerEl).getAttribute('id');
    });
  });
  $("[data-value-classof]", el).each(function(i, inputEl) {
    $(containerEl).on('request', function(e) {
      if (!inputEl)
        return;
      inputEl.value = $(inputEl.dataset.valueClassof, containerEl).attr('class');
    });
  });  
};grimWidgets.dismissRegion = function(el, containerEl) {
  $('[data-dismiss="region"]').on('click', function() {
    if (!containerEl || !containerEl.id)
      return;
    var region = local.env.getClientRegion(containerEl.id);
    if (region)
      region.dismiss();
  });
};
})();