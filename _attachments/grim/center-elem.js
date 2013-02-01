Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// Center Space
	// ============
	
	var centerElem = document.getElementById('center');
	centerElem.addEventListener('drop', function(e) {

		var elem = document.createElement('div');
		elem.id = Grim.genClientRegionId();
		elem.className = "client-region";
		centerElem.appendChild(elem);

		var region = Environment.addClientRegion(new Grim.ClientRegion(elem.id));
		region.__handleDrop(e);
	});
	centerElem.addEventListener('dragover',  function(e) {
		if (e.dataTransfer.types.indexOf('application/request+json') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		} else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'link';
			return false;
		}
	});
	centerElem.addEventListener('dragenter', function(e) {
		if (e.target == centerElem) {
			if (e.dataTransfer.types.indexOf('application/request+json') !== -1)
				centerElem.classList.add('drophover');
			else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1)
				centerElem.classList.add('drophover');
		}
	});
	centerElem.addEventListener('dragleave', function(e) {
		if (e.target == centerElem)
			centerElem.classList.remove('drophover');
	});
	centerElem.addEventListener('dragend', function(e) {
		centerElem.classList.remove('drophover');
	});

})(Grim);