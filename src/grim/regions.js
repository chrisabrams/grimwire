(function() {
	// GrimRegion
	// ==========
	// extends local.client.Region with some custom behaviors
	function GrimRegion(id) {
		local.client.Region.call(this, id);
		this.cookies = {}; // a map of hostname -> cookie maps
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

			// :TODO: is there a better way to handle this?
			/*if (requestTarget.id != 'layout' && !response.body && response.status == 200) {
				// destroy region if it's served blank html
				local.env.removeClientRegion(requestTarget.id);
				targetRegion.element.parentNode.removeChild(targetRegion.element);
				return;
			}*/
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
			case 302:
			case 303:
				// dispatch for contents
				var request2 = { method:'get', url:response.headers.location, headers:{ accept:'text/html' }};
				this.dispatchRequest(request2);
				break;
			default:
				if (response.headers['content-type']) {
					local.client.renderResponse(requestTarget, containerEl, response);
				} else {
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
		}
	};

	// adds to local's region behaviors:
	// - cookies with scope=client are stored in the client
	GrimRegion.prototype.__updateContext = function(request, response) {
		local.client.Region.prototype.__updateContext.call(this, request, response);

		var authority = this.context.urld.authority;
		if (!(authority in this.cookies))
			this.cookies[authority] = {};

		var cookies = response.headers['set-cookie'];
		if (cookies) {
			for (var k in cookies) {
				if (cookies[k].scope != 'client')
					continue;

				if (cookies[k] === null)
					delete this.cookies[authority][k];
				else
					this.cookies[authority][k] = cookies[k];
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
			if (el.dataset.clientRegion) {
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

	// post-processors
	// -
	window.clientRegionPostProcess = function(el) {
		// find any new regions
		$('div[data-client-region]', el).each(function(i, container) {
			prepClientRegionEl(container);
			var region = new local.client.GrimRegion(container.id);
			local.env.addClientRegion(region);

			var initUrl = container.dataset.clientRegion;
			if (initUrl)
				region.dispatchRequest(initUrl);
		});

		// sanitize and whitelist styles
		$("[style]", el).each(function(i, styledElem) {
			var nStyles = styledElem.style.length;
			for (var j=0; j < nStyles; j++) {
				var k = styledElem.style[j];

				if (k.indexOf('padding') != -1 || k.indexOf('margin') != -1)
					styledElem.style.setProperty(k, clampSpacingStyles(styledElem.style[k]));

				else if (isStyleAllowed(k) == false)
					styledElem.style.removeProperty(k);
			}
		});
	};


	// styles guarding
	// -
	//http://wiki.whatwg.org/wiki/Sanitization_rules#CSS_Rules
	var styleWhitelist = [
		'color','background','font','line-height','line-spacing','text-align','text-decoration','vertical-align',
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
})();