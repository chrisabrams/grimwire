Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// Definitions
	// ===========
	function extractIntent(elem) {
		if (elem.tagName != 'INTENT') return {};

		var intent = {
			action : elem.getAttribute('action'),
			type   : elem.getAttribute('type')
		};
		return intent;
	}

	
	function handleDragstart(e) {
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
	document.addEventListener('dragstart', handleDragstart);
	
})(Grim);