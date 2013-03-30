Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {
	var __id = 0;
	exports.genClientRegionId = function() { return 'client-region-'+__id++; };
	function hasType(e, t) {
		if (e.dataTransfer.types.indexOf)
			return e.dataTransfer.types.indexOf(t) !== -1;
		if (e.dataTransfer.types.contains)
			return e.dataTransfer.types.contains(t);
		throw "Unable to check type on data transfer object";
	}

	// ClientRegion
	// ============
	// EXPORTED
	// an isolated region of the DOM
	function ClientRegion(id, options) {
		Environment.ClientRegion.call(this, id);
		this.animWrapper = this.element.parentNode;
		this.parentColumn = CommonClient.findParentNode.byClass(this.element, 'column');

		options = options || {};
		if (options.droptarget !== false) {
			this.element.addEventListener('drop', this.__handleDrop.bind(this));
			this.element.addEventListener('dragover', this.__handleDragover.bind(this));
			this.element.addEventListener('dragenter', this.__handleDragenter.bind(this));
			this.element.addEventListener('dragleave', this.__handleDragleave.bind(this));
		}
		this.element.addEventListener('intend', handleIntend.bind(this));
	}
	ClientRegion.prototype = Object.create(Environment.ClientRegion.prototype);

	ClientRegion.prototype.startAnim = function(anim) {
		if (this.animWrapper && this.context.url) {
			this.animWrapper.classList.add(anim);
		}
	};
	ClientRegion.prototype.endAnim = function(anim) {
		if (this.animWrapper && this.context.url) {
			this.animWrapper.classList.remove(anim);
		}
	};

	ClientRegion.prototype.dispatchIntent = function(intent, element) {
		if (typeof intent === 'string') {
			intent = { action:intent };
		}
		var ie = new CustomEvent('intend', { bubbles:true, cancelable:true, detail:intent });
		(element || this.element).dispatchEvent(ie);
	};

	ClientRegion.prototype.terminate = function() {
		if (this.context.url) {
			// hide the interface and show a dismiss interface
			this.element.style.display = 'none';
			var alert = document.createElement('div');
			alert.className = "alert alert-block";
			alert.innerHTML = [
				'<button type="button" class="close" data-dismiss="alert">×</button>',
				'<strong>Closed ', this.context.url, '</strong> ',
				'<a class="" href="#">Restore</a>'
			].join('');
			this.animWrapper.appendChild(alert);
			alert.lastChild.addEventListener('click', __cancelTerminate.bind(this));

			// start the terminate timer
			this.terminateTimer = setTimeout(__finishTerminate.bind(this), 10000);
		} else {
			__finishTerminate.call(this);
		}
	};

	function __finishTerminate() {
		Environment.ClientRegion.prototype.terminate.call(this);
		Environment.removeClientRegion(this);

		// animate and remove nodes
		// :TODO: broken by change in how width is calculated -- hopefully returned later
		/*var animWrapper = this.element.parentNode;
		animWrapper.classList.add('die');
		setTimeout(function() { animWrapper.parentNode.removeChild(animWrapper); }, 200);*/
		this.animWrapper.parentNode.removeChild(this.animWrapper);
	}

	function __cancelTerminate(e) {
		e.preventDefault();
		if (this.terminateTimer) {
			clearTimeout(this.terminateTimer);
			this.animWrapper.removeChild(this.animWrapper.lastChild);
			this.element.style.display = 'block';
			delete this.terminateTimer;
		}
	}

	function handleIntend(e) {
		e.preventDefault();
		e.stopPropagation();

		var intent = e.detail;

		// find intent executor
		var request = { url:false, method:'post', headers:{} };
		var executor = Grim.intents.registry[intent.action];
		if (!executor) {
			console.log('No application available to execute', intent.action, intent);
			return;
		}
		request.url = executor.url;
		request.target = executor.target;

		// are we an empty (and probably new) region?
		if (!this.context.url) {
			delete request.target; // put the response in our region
		}

		// collect our data
		var contextData, contextDataType;
		var form = CommonClient.findParentNode.byTag(e.target, 'FORM');
		if (form && form.dataset['intents'] != 'none') {
			var formRequest = CommonClient.extractRequest(form, this.element);
			contextData = formRequest.body;
			contextDataType = formRequest.headers['content-type'];
		} else {
			contextData = this.element.innerHTML;
			contextDataType = this.context.type;
		}

		// form request body
		request.headers['content-type'] = 'multipart/form-data';
		request.body = {
			parts: [
				{ 'content-type':'text/uri-list', body:intent.action },
				{ 'content-type':'application/json', body:this.context.links },
				{ 'content-type':contextDataType, body:contextData }
			]
		};

		// add attachments
		// :TODO:

		this.__prepareRequest(request);

		var self = this;
		request.stream = false;
		promise(Link.dispatch(request, this))
			.then(function(response) {
				self.__handleResponse(e, request, response);
			})
			.except(function(err) {
				self.__handleError(e, request, err.response);
			});
	}

	ClientRegion.prototype.__handleResponse = function(e, request, response) {
		var requestTarget = this.__chooseRequestTarget(e, request);

		var responseIsEmpty = (response.body === null ||
								typeof response.body == 'undefined' ||
								(typeof response.body == 'string' && /^[\s\t\r\n]*$/.test(response.body)));
		if (responseIsEmpty && (response.status == 200 || response.status >= 400))
			// destroy region if it's served blank html
			return Environment.clientRegions[requestTarget.id].terminate();

		var targetClient = Environment.getClientRegion(requestTarget.id);
		if (targetClient)
			targetClient.__updateContext(request, response);

		CommonClient.handleResponse(requestTarget, this.element, response);
		Environment.postProcessRegion(requestTarget);
	};

	ClientRegion.prototype.__handleError = function(e, request, response) {
		if (!this.context.url) {
			// no content yet? just self-destruct
			return this.terminate();
		}
	};

	ClientRegion.prototype.__chooseRequestTarget = function(e, request) {
		// output region requests always render back responses to themselves
		if (e.target.tagName == 'OUTPUT' || (e.target.tagName == 'FORM' && e.target.dataset.output === 'true')) {
			return e.target;
		}

		// if the target is empty, the region itself is used
		if (!request.target) return this.element;

		// targets starting with a dash are created relative to the client region
		if (request.target.charAt(0) == '-') {
			return this.__createRelativeRegion(request.target);
		}

		// targets not starting with a dash or underscore should be ids to other elements
		// if the target is invalid, the region itself is used
		return document.getElementById(request.target) || this.element;
	};

	ClientRegion.prototype.__createRelativeRegion = function(target, parentColumn) {
		var animWrapperEl = document.createElement('div');
		animWrapperEl.className = "client-region-animwrapper init";

		var clientRegionEl = document.createElement('div');
		clientRegionEl.id = exports.genClientRegionId();
		clientRegionEl.className = "client-region";
		animWrapperEl.appendChild(clientRegionEl);

		var column = this.parentColumn || parentColumn || document.querySelector('#center .column');
		switch (target) {
			case '-above':
				column.insertBefore(animWrapperEl, this.animWrapper);
				break;
			case '-below':
				column.insertBefore(animWrapperEl, this.animWrapper.nextSibling);
				break;
			case '-blank':
				column.appendChild(animWrapperEl);
				break;
			default:
				console.log("Unrecognized link target: ", target);
				column.appendChild(animWrapperEl);
		}
        setTimeout(function() { animWrapperEl.classList.remove('init'); }, 0); // trigger transition
		Environment.addClientRegion(new ClientRegion(clientRegionEl.id));
		return clientRegionEl;
	};

	// transforms dropped 'link' objects into request events
	ClientRegion.prototype.__handleDrop = function(e, dispatchEmitterOverride) {

		e.preventDefault();
		e.stopPropagation();

		var highlightableElems = Array.prototype.slice.call(this.element.querySelectorAll('form'));
		highlightableElems.push(this.element);
		highlightableElems.forEach(function(el) {
			el.classList.remove('requesthover');
			el.classList.remove('intenthover');
		});

		// try to parse known data formats
		var request = null;
		if (hasType(e, 'application/request+json')) {
			request = JSON.parse(e.dataTransfer.getData('application/request+json'));
		} else if (hasType(e, 'text/uri-list')) {
			var data = e.dataTransfer.getData('text/uri-list');
			if (data) {
				request = { method:'get', url:data };
			}
		}
		if (request) {
			delete request.target; // we're choosing the target
			this.dispatchRequest(request);
			return false;
		}

		if (hasType(e, 'application/intent+json')) {
			// :NOTE: must dispatch the intent off of the drop target (for forms)
			this.dispatchIntent(JSON.parse(e.dataTransfer.getData('application/intent+json')), dispatchEmitterOverride || e.target);
			return false;
		}
	};

	ClientRegion.prototype.__handleDragover = function(e) {
		if (!e.dataTransfer.types) return;
		if (hasType(e, 'application/request+json')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (hasType(e, 'text/uri-list')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (hasType(e, 'application/intent+json')) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			return false;
		}
	};

	ClientRegion.prototype.__handleDragenter = function(e) {
		if (!e.dataTransfer.types) return;

		var thisElem = this.element;
		var formElem = CommonClient.findParentNode(e.target, function(elem) {
			return (elem.tagName == 'FORM' && elem.dataset['intents'] != 'none') || elem == thisElem;
		});

		
		if (hasType(e, 'application/request+json')) {
			this.element.classList.add('requesthover');
		} else if (hasType(e, 'text/uri-list')) {
			this.element.classList.add('requesthover');
		} else if (hasType(e, 'application/intent+json')) {
			if (formElem) formElem.classList.add('intenthover');
			this.element.classList.add('intenthover');
		}
	};

	ClientRegion.prototype.__handleDragleave = function(e) {
		var rect;

		// check if there's a form
		var thisElem = this.element;
		var formElem = CommonClient.findParentNode(e.target, function(elem) {
			return elem.tagName == 'FORM' || elem == thisElem;
		});

		// do the form in addition to the containing node
		if (formElem != this.element) {
			// dragleave is fired on all children, so only pay attention if it dragleaves our region
			rect = formElem.getBoundingClientRect();
			if (e.clientX >= (rect.left + rect.width) || e.clientX <= rect.left || e.clientY >= (rect.top + rect.height) || e.clientY <= rect.top) {
				formElem.classList.remove('intenthover');
			}
		}

		// dragleave is fired on all children, so only pay attention if it dragleaves our region
		rect = this.element.getBoundingClientRect();
		if (e.clientX >= (rect.left + rect.width) || e.clientX <= rect.left || e.clientY >= (rect.top + rect.height) || e.clientY <= rect.top) {
			this.element.classList.remove('requesthover');
			this.element.classList.remove('intenthover');
		}
	};

	exports.ClientRegion = ClientRegion;
})(Grim);