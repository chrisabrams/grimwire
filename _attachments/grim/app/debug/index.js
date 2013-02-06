importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

function renderNavTab(page, tab, label) {
	return [
	'<li',(page==tab)?' class="active"':'', '>',
		'<a href="httpl://v1.pfraze.index.debug.app/?page=', tab, '">',label,'</a>',
	'</li>'
	].join('');
}

function renderPage(page) {
	switch (page) {
		case 'targets':
			return [
			'<form>',
				'<input type="hidden" name="url" value="http://grimwire.com/grim/app/debug/targets.js" />',
				'<p><strong>Targets Test</strong></p>',
				'<p>Example of all custom target behaviors for requests, such as -blank and -below.</p>',
			'</form>'
			].join('');

		case 'url':
			return [
			'<form>',
				'<p>Script Url:</p>',
				'<input class="input-block-level" type="text" name="url" />',
			'</form>'
			].join('');

		case 'script':
			return [
			'<form>',
				'<p>Script:</p>',
				'<textarea class="input-block-level" name="script"></textarea>',
			'</form>'
			].join('');

		case 'forms':
		default:
			return [
			'<form>',
				'<input type="hidden" name="url" value="http://grimwire.com/grim/app/debug/forms.js" />',
				'<p><strong>Forms Test</strong></p>',
				'<p>All form behaviors in the environment.</p>',
			'</form>'
			].join('');
	}
}

app.onHttpRequest(function(request, response) {
	Link.router(request).mpa('get', '/', /html/, function() {
		Link.responder(response).ok('html').end([
			'<p><span class="label">Grimwire Debug Apps</span></p>',
			'<div class="tabbable tabs-left">',
				'<ul class="nav nav-tabs">',
					renderNavTab(request.query.page || 'forms', 'forms', 'Forms Test'),
					renderNavTab(request.query.page, 'targets', 'Targets Test'),
					renderNavTab(request.query.page, 'url', 'Script URL'),
					renderNavTab(request.query.page, 'script', 'Script'),
				'</ul>',
				'<div class="tab-content">',
					'<div class="tab-pane active" id="lA">',
						renderPage(request.query.page),
					'</div>',
				'</div>',
			'</div>'
		].join(''));
	}).error(response);
});
app.postMessage('loaded', {
	category : 'Debug',
	name     : 'Index',
	author   : 'pfraze',
	version  : 'v1'
});