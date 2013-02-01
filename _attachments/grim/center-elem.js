Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// Center Space
	// ============
	
	var centerElem = document.getElementById('center');
	centerElem.addEventListener('drop', function(e) {

		centerElem.classList.remove('requesthover');
		centerElem.classList.remove('intenthover');

		var elem = document.createElement('div');
		elem.id = Grim.genClientRegionId();
		elem.className = "client-region";
		centerElem.appendChild(elem);

		var region = Environment.addClientRegion(new Grim.ClientRegion(elem.id));
		region.__handleDrop(e);
	});
	centerElem.addEventListener('dragover',  function(e) {
		if (!e.dataTransfer.types) return;
		if (e.dataTransfer.types.indexOf('application/request+json') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (e.dataTransfer.types.indexOf('application/intent+json') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			return false;
		}
	});
	centerElem.addEventListener('dragenter', function(e) {
		if (!e.dataTransfer.types) return;
		if (e.target == centerElem) {
			if (e.dataTransfer.types.indexOf('application/request+json') !== -1)
				centerElem.classList.add('requesthover');
			else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1)
				centerElem.classList.add('requesthover');
			else if (e.dataTransfer.types.indexOf('application/intent+json') !== -1)
				centerElem.classList.add('intenthover');
		}
	});
	centerElem.addEventListener('dragleave', function(e) {
		if (e.target == centerElem) { // dragleave fires when child elems are dragleft... and that's our time to shine
			centerElem.classList.remove('requesthover');
			centerElem.classList.remove('intenthover');
		}
	});
	centerElem.addEventListener('dragend', function(e) {
		centerElem.classList.remove('requesthover');
		centerElem.classList.remove('intenthover');
	});

})(Grim);