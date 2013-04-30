(function() {
	// GrimRegion
	// ==========
	// extends local.client.Region with some custom behaviors
	function GrimRegion(id) {
		local.client.Region.call(this, id);
	}
	GrimRegion.prototype = Object.create(local.client.Region.prototype);
	local.client.GrimRegion = GrimRegion;

	// adds to local's region behaviors:
	// - destroy region if an empty 200
	GrimRegion.prototype.__handleResponse = function(e, request, response) {
		var requestTarget = this.__chooseRequestTarget(e, request);
		if (!requestTarget)
			return;

		var targetRegion = local.env.getClientRegion(requestTarget.id);
		if (targetRegion) {
			targetRegion.__updateContext(request, response);

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
				if (response.headers['content-type']) {
					// replace target innards
					local.client.renderResponse(requestTarget, this.element, response);
				} else {
					// render a notice of the response
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
	// - can target "data-grim-layout" containers
	GrimRegion.prototype.__chooseRequestTarget = function(e, request) {
		if (request.target == '_element')
			return e.target;

		var el = document.getElementById(request.target);
		if (el) {
			if (el.id == 'layout') return el;
			if (el.dataset.grimLayout) {
				var subEl;
				var behavior = el.dataset.grimLayout.split(' ')[0];
				switch (behavior) {
					default:
						console.error('Unknown layout behavior "'+behavior+'" specified in #'+el.id+', defaulting to "replace".');
					case 'replace': // when targeted, navigate the only contained region
					case 'stack': // :DEBUG: until implemented, treat stack as replace
						subEl = el.querySelector('.client-region');
						if (subEl)
							return subEl;
					case 'share': // when targeted, create a new region in the container
						subEl = makeClientRegionEl();
						local.env.addClientRegion(subEl.id);
						return subEl;
				}
				return el;
			}
			console.error('Request targeted at #'+request.target+', which has no layout behavior specified with data-grim-layout. Dropping response.');
			return null;
		}

		return this.element;
	};

	// post-processors
	// -
	window.grimLayoutPostProcess = function(el) {
		// find any new layout containers
		$('[data-grim-layout]', el).each(function(i, container) {
			// if an initial URL is specified, create a client region and populate with response of a GET to that url
			var params = container.dataset.grimLayout.split(' ');
			var initUrl = params[1];
			if (initUrl) {
				var el = makeClientRegionEl(container);
				var region = new local.client.GrimRegion(el.id);
				local.env.addClientRegion(region);
				region.dispatchRequest(initUrl);
			}
		});
	};


	// helpers
	// -
	var __crid_counter=100;
	function makeClientRegionEl(parentEl) {
		var el = document.createElement('div');
		el.id = 'client-region-'+__crid_counter++;
		parentEl.appendChild(el);
		return el;
	}
})();