grimWidgets.lifespan = function(el) {
	var lifespanEls = el.querySelectorAll('[data-lifespan]');
	for (var i = 0; i < lifespanEls.length; i++) {
		(function(lifespanEl) {
			setTimeout(function() {
				if (lifespanEl)
					lifespanEl.parentNode.removeChild(lifespanEl);
			}, lifespanEl.dataset.lifespan * 1000);
		})(lifespanEls[i]);
	}
};