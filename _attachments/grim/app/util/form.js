importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

var prevRequestsCollection = Link.navigator('httpl://localstorage.env').collection('pfraze_form_util');

function respondInterface(prevRequestsRes, request, response) {
	var prevRequestsList = '';
	if (!(prevRequestsRes instanceof Error)) {
		prevRequestsList = [
			'<ul class="nav nav-tabs nav-stacked">',
				prevRequestsRes.body.map(function(pr) {
					var request = {
						method  : pr.method,
						url     : pr.url,
						headers : { 'content-type':'applicaton/json', accept:'html' },
						body    : pr.body
					};
					var href = 'httpl://v1.pfraze.form.util.app/?'+Link.contentTypes.serialize(request, 'application/x-www-form-urlencoded');
					return [
						'<li style="white-space:nowrap;overflow:hidden;max-width: 460px;">',
							'<a href="',href,'" title="',href,'">',
								pr.method.toUpperCase(),' ',pr.url.toLowerCase(),
							'</a>',
						'</li>'
					].join('');
				}).join(''),
			'</ul>'
		].join('');
	}
	var query = request.query || {};
	var body = (query.body && typeof query.body == 'object') ? JSON.stringify(query.body) : query.body;
	if (body == 'undefined') body = '';
	Link.responder(response).ok('html').end([
		'<style>#pfraze_form_util .control-label { width:50px; } #pfraze_form_util .controls { margin-left:60px; }</style>',
		'<form method="post" action="httpl://v1.pfraze.form.util.app" enctype="application/json" class="form-horizontal" id="pfraze_form_util">',
			'<div class="control-group">',
				'<label for="pfraze_form_method" class="control-label">Method</label>',
				'<div class="controls"><input type="text" name="method" id="pfraze_form_method" class="span2" value="',query.method,'" /></div>',
			'</div>',
			'<div class="control-group">',
				'<label for="pfraze_form_action" class="control-label">Action</label>',
				'<div class="controls"><input type="text" name="action" id="pfraze_form_action" class="span5" value="',query.url,'" /></div>',
			'</div>',
			'<div class="control-group">',
				'<label form="pfraze_form_body" class="control-label">Body</label>',
				'<div class="controls"><textarea name="body" id="pfraze_form_body">',body,'</textarea></div>',
			'</div>',
			'<div class="control-group">',
				'<div class="controls"><input class="btn" name="button" draggable=true type="submit" value="Submit"/></div>',
			'</div>',
		'</form>',
		prevRequestsList
	].join(''));
}

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			prevRequestsCollection.getJson().then(respondInterface, request, response);
		})
		.mpta('post', '/', /json/, /html/, function() {
			var body;
			try { body = JSON.parse(request.body.body); } catch (e) { body = request.body.body; }
			var pipeRequest = {
				method  : request.body.method,
				url     : request.body.action,
				headers : { 'content-type':'application/json' },
				body    : body
			};
			prevRequestsCollection.post(pipeRequest,'application/json').except(console.log);
			Link.responder(response).pipe(Link.dispatch(pipeRequest));
		})
		.error(response);
});
app.postMessage('loaded', {
	author   : 'pfraze',
	name     : 'Form',
	category : 'Util',
	version  : 'v1'
});