Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {
	var __id = 0;
	function __popId() { return 'client-region-'+__id++; }

	// ClientRegion
	// ============
	// EXPORTED
	// an isolated region of the DOM
	function ClientRegion(id) {
		Environment.ClientRegion.call(this, id);
		this.element.addEventListener('drop', __handleDrop.bind(this));
		this.element.addEventListener('dragover', __handleDragover.bind(this));
		this.element.addEventListener('dragenter', __handleDragenter.bind(this));
		this.element.addEventListener('dragleave', __handleDragleave.bind(this));
		this.element.addEventListener('dragend', __handleDragend.bind(this));
	}
	ClientRegion.prototype = Object.create(Environment.ClientRegion.prototype);

	ClientRegion.prototype.__chooseRequestTarget = function(e, request) {
		// output region requests always render back responses to themselves
		if (e.target.tagName == 'OUTPUT') {
			return e.target;
		}

		// if the target is empty, the region itself is used
		if (!request.target) return this.element;

		// targets starting with a dash are created relative to the client region
		if (request.target.charAt(0) == '-') {
			return this.__createRelativeRegion(e, request);
		}

		// targets not starting with a dash or underscore should be ids to other elements
		// if the target is invalid, the region itself is used
		return document.getElementById(request.target) || this.element;
	};

	ClientRegion.prototype.__createRelativeRegion = function(e, request) {
		var elem = document.createElement('div');
		elem.id = __popId();
		elem.className = "client-region";
		switch (request.target) {
			case '-above':
				this.element.parentNode.insertBefore(elem, this.element);
				break;
			case '-below':
				this.element.parentNode.insertBefore(elem, this.element.nextSibling);
				break;
			default:
				console.log("Unrecognized link target: ", request.target, e);
				return this.element;
		}
		Environment.addClientRegion(new ClientRegion(elem.id));
		return elem;
	};

	// transforms dropped 'link' objects into request events
	function __handleDrop(e) {

		this.element.classList.remove('drophover');

		// try to parse known data formats
		var request = null;
		var data = e.dataTransfer.getData('application/request+json');
		if (data) {
			request = JSON.parse(data);
		} else {
			data = e.dataTransfer.getData('text/uri-list');
			if (data) {
				request = { method:'get', url:data };
			}
		}
		if (!request) {
			return; // let somebody else handle the event
		}
		delete request.target; // we're choosing the target

		// dispatch
		e.preventDefault();
		e.stopPropagation();
		this.dispatchRequest(request);
		return false;
	}

	function __handleDragover(e) {
		if (e.dataTransfer.types.indexOf('application/request+json') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		}
	}

	function __handleDragenter(e) {
		// if (e.target != this.element) { return; }
		if (e.dataTransfer.types.indexOf('application/request+json') !== -1) {
			this.element.classList.add('drophover');
		} else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1) {
			this.element.classList.add('drophover');
		}
	}

	function __handleDragleave(e) {
		// dragleave is fired on all children, so only pay attention if it dragleaves our region
		var rect = this.element.getBoundingClientRect();
		if (e.clientX >= (rect.left + rect.width) || e.clientX <= rect.left || e.clientY >= (rect.top + rect.height) || e.clientY <= rect.top) {
			this.element.classList.remove('drophover');
		}
	}

	function __handleDragend(e) {
		this.element.classList.remove('drophover');
	}

	exports.ClientRegion = ClientRegion;
})(Grim);