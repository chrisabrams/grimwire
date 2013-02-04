Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {

	// Center Space
	// ============
	
	var centerElem = document.getElementById('center');
	centerElem.addEventListener('drop', function(e) {

		var highlightableElems = Array.prototype.slice.call(document.querySelectorAll('#center >tbody > tr > td'));
		highlightableElems.forEach(function(el) {
			el.classList.remove('requesthover');
			el.classList.remove('intenthover');
		});

		if (e.target.tagName != 'TD') { return; }

		var el = Grim.ClientRegion.prototype.__createRelativeRegion('-blank', e.target);
		Environment.clientRegions[el.id].__handleDrop(e, el);
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
		if (e.target.tagName == 'TD' && e.target.parentNode.parentNode.parentNode == centerElem) {
			if (e.dataTransfer.types.indexOf('application/request+json') !== -1)
				e.target.classList.add('requesthover');
			else if (e.dataTransfer.types.indexOf('text/uri-list') !== -1)
				e.target.classList.add('requesthover');
			else if (e.dataTransfer.types.indexOf('application/intent+json') !== -1)
				e.target.classList.add('intenthover');
		}
	});
	centerElem.addEventListener('dragleave', function(e) {
		// dragleave fires when child elems are dragleft, so only unhover when a TD is left
		if (e.target.tagName == 'TD' && e.target.parentNode.parentNode.parentNode == centerElem) {
			e.target.classList.remove('requesthover');
			e.target.classList.remove('intenthover');
		}
	});
	/*centerElem.addEventListener('dragend', function(e) {
		centerElem.classList.remove('requesthover');
		centerElem.classList.remove('intenthover');
	});*/

})(Grim);