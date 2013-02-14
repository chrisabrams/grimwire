Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// Intent Registry
	// ===============

	var intents = {
		registry:{}
	};
	intents.register = function(intentUrl, executorUrl, target) {
		this.registry[intentUrl] = { url:executorUrl, target:target };
	};
	intents.unregister = function(intentUrl) {
		delete this.registry[intentUrl];
	};

	exports.intents = intents;

	// Intent Handling
	// ===============
	function extractIntent(elem) {
		if (elem.tagName != 'INTENT') return {};

		var intent = {
			action : elem.getAttribute('action'),
			type   : elem.getAttribute('type')
		};
		return intent;
	}

	
	function handleIntentDragstart(e) {
		var elem = e.target;
		if (elem.tagName != 'INTENT') return;

		var intent = extractIntent(elem);
		
		if (intent && intent.action) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('application/intent+json', JSON.stringify(intent));
		} else {
			e.dataTransfer.effectAllowed = 'none';
		}
	}

	// Init
	// ====
	document.addEventListener('dragstart', handleIntentDragstart);
	intents.register('http://grimwire.com/intents/load', 'httpl://app/load-confirmer', '-below');
	intents.register('http://grimwire.com/intents/torch', 'httpl://app/null');
	intents.register('http://grimwire.com/intents/inspect', 'httpl://app/inspector', '-below');
	intents.register('http://grimwire.com/intents/render', 'httpl://app/echo');
	
})(Grim);