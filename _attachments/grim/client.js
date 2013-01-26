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
		elem.className = "client-region"
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

	exports.ClientRegion = ClientRegion;
})(Grim);