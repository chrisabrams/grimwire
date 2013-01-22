var index = 0;
var sigils = Array.prototype.slice.call(document.querySelectorAll('.sigils i'));
var sigilsLen = sigils.length;
setInterval(function() {
	sigils[index].classList.remove('charged');
	index++;
	if (index >= sigilsLen) { index = 0; }
	sigils[index].classList.add('charged');
}, 3000);
