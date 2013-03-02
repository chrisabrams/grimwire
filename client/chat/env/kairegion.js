// KaiRegion
// =========
// custom behaviors for kai
function KaiRegion(id, options) {
	Environment.ClientRegion.call(this, id);
}
KaiRegion.prototype = Object.create(Environment.ClientRegion.prototype);

// override to set new behaviors:
// - default to creating a new region inside of chatout
// - replace self if no context (blank) or target explicitly set to '-self'
KaiRegion.prototype.__chooseRequestTarget = function(e, request) {
	// output region requests always render back responses to themselves
	if (e.target.tagName == 'OUTPUT')
		return e.target;
	if (request.target == '-self' || !this.context.url)
		return this.element;
	return newMessageRegion('response', request.url).element;
};

// override to update visual context
KaiRegion.prototype.__handleResponse = function(e, request, response) {
	var hadContext = !!this.context.url;
	Environment.ClientRegion.prototype.__handleResponse.call(this, e, request, response);
	if (hadContext)
		this.updateHead();
};

KaiRegion.prototype.updateHead = function() {
	try {
		this.element.parentNode.querySelector('.region-head').innerHTML = this.context.url+' ('+getTime()+')';
	} catch (e) {}
};

var messageRegionIdCounter=0;
function newMessageRegion(contextType, contextIdent) {
	var el = document.createElement('div');
	el.id = 'message-'+(++messageRegionIdCounter);
	el.classList.add('region-'+contextType);
	el.innerHTML = [
		'<div class="region-head">'+contextIdent+' ('+getTime()+')</div>',
		'<div id="message-'+messageRegionIdCounter+'-body" class="region-body"></div>'
	].join('');
	document.getElementById('output').appendChild(el);

	var cr = Environment.addClientRegion(new KaiRegion(el.lastChild.id));
	Regions.chatout.push(cr);
	return cr;
}

function getTime() {
	var ts = new Date();
	return ts.getHours() + ':' + pad0(ts.getMinutes()) + ':' + pad0(ts.getSeconds());
}

function pad0(v) {
	if ((''+v).length === 1)
		return '0'+v;
	return v;
}