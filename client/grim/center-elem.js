Grim = (typeof Grim == 'undefined') ? {} : Grim;
(function(exports) {
	function hasType(e, t) {
		if (e.dataTransfer.types.indexOf)
			return e.dataTransfer.types.indexOf(t) !== -1;
		if (e.dataTransfer.types.contains)
			return e.dataTransfer.types.contains(t);
		throw "Unable to check type on data transfer object";
	}

	// Center Space
	// ============
	
	var centerElem = document.getElementById('center');
	centerElem.addEventListener('drop', function(e) {

		var highlightableElems = Array.prototype.slice.call(document.querySelectorAll('#center .column'));
		highlightableElems.forEach(function(el) {
			el.classList.remove('requesthover');
			el.classList.remove('intenthover');
		});

		if (e.target.classList.contains('column') === false) { return; }

		var el = Grim.ClientRegion.prototype.__createRelativeRegion('-blank', e.target);
		Environment.clientRegions[el.id].__handleDrop(e, el);
	});
	centerElem.addEventListener('dragover',  function(e) {
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
	});
	centerElem.addEventListener('dragenter', function(e) {
		if (!e.dataTransfer.types) return;
		if (e.target.classList && e.target.classList.contains('column') && e.target.parentNode.parentNode.parentNode.parentNode == centerElem) {
			if (hasType(e, 'application/request+json'))
				e.target.classList.add('requesthover');
			else if (hasType(e, 'text/uri-list'))
				e.target.classList.add('requesthover');
			else if (hasType(e, 'application/intent+json'))
				e.target.classList.add('intenthover');
		}
	});
	centerElem.addEventListener('dragleave', function(e) {
		// dragleave fires when child elems are dragleft, so only unhover when a TD is left
		if (e.target.classList && e.target.classList.contains('column') && e.target.parentNode.parentNode.parentNode.parentNode == centerElem) {
			e.target.classList.remove('requesthover');
			e.target.classList.remove('intenthover');
		}
	});
	/*centerElem.addEventListener('dragend', function(e) {
		centerElem.classList.remove('requesthover');
		centerElem.classList.remove('intenthover');
	});*/

})(Grim);