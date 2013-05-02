var config = local.worker.config;
var mainHref = config.usr.mainHref || config.mainHref || 'httpl://lunr.index.usr';
var sidenavHref = config.usr.sidenavHref || config.sidenavHref || 'httpl://layout.index.usr/filters';
function main(request, response) {
	var storageN = local.http.reqapi(request, 'storage');
	var userPrefsN = storageN.item('prefs');
	userPrefsN.getJson()
		.then(function(res) { return res.body || {}; }, function() { return {}; })
		.succeed(function(prefs) {
			var path = request.path;
			if (!path || path == '/')
				path = (prefs.filtersOn) ? '/2column' : '/1column';
			if (path == '/2column') {
				respondHTML(
				'<form action="httpl://'+config.domain+'/1column" method="select">'+
					'<button class="btn btn-mini active">Filters</button>'+
				'</form>'+
				'<div class="row-fluid">'+
					'<div id="sidenav" data-grim-layout="replace '+sidenavHref+'" class="span2"></div>'+
					'<div id="main" data-grim-layout="replace '+mainHref+'" class="span10"></div>'+
				'</div>'
				);
				if (request.method == 'SELECT') {
					prefs.filtersOn = true;
					userPrefsN.put(prefs, 'application/json', null, { retry:true });
				}
			} else if (path == '/1column') {
				respondHTML(
				'<form action="httpl://'+config.domain+'/2column" method="select">'+
					'<button class="btn btn-mini">Filters</button>'+
				'</form>'+
				'<div class="row-fluid">'+
					'<div id="main" data-grim-layout="replace '+mainHref+'" class="span12"></div>'+
				'</div>'
				);
				if (request.method == 'SELECT') {
					prefs.filtersOn = false;
					userPrefsN.put(prefs, 'application/json', null, { retry:true });
				}
			} else if (path == '/filters') {
				respondHTML(
				'<ul class="nav nav-pills nav-stacked">'+
					'<li class="active"><a href="httpl://lunr.index.usr/" target="main" data-toggle="nav">Everything</a></li>'+
					'<li><a href="httpl://lunr.index.usr/?subject=apps" target="main" data-toggle="nav">Applications</a></li>'+
					'<li><a href="httpl://lunr.index.usr/?subject=workers" target="main" data-toggle="nav">Workers</a></li>'+
					'<li><a href="httpl://lunr.index.usr/?subject=docs" target="main" data-toggle="nav">Documentation</a></li>'+
				'</ul>'
				);
			} else if (path == '/.grim/config') {
				var msg = '';
				if (/POST/i.test(request.method)) {
					if (!request.body.mainHref || !request.body.sidenavHref) {
						msg = '<div class="alert alert-error">Please enter values for all fields.</div>';
					} else {
						local.http.dispatch({
							method: 'patch',
							url: 'httpl://config.env/workers/'+config.domain,
							body: { mainHref:request.body.mainHref, sidenavHref:request.body.sidenavHref },
							headers: { 'content-type':'application/json' }
						});
						mainHref = request.body.mainHref;
						sidenavHref = request.body.sidenavHref;
						msg = '<div class="alert alert-success" data-lifespan="5">Updated</div>';
					}
				}
				respondHTML(
				'<form action="httpl://'+config.domain+'/.grim/config" method="post">'+
					msg+
					'<label for="index-layout-mainHref">Main URL</label>'+
					'<div class="controls"><input type="url" id="index-layout-mainHref" name="mainHref" class="input-xxlarge" value="'+mainHref+'" placeholder="httpl://worker.app.usr" required /></div>'+
					'<label for="index-layout-sidenavHref">Sidenav URL</label>'+
					'<div class="controls"><input type="url" id="index-layout-sidenavHref" name="sidenavHref" class="input-xxlarge" value="'+sidenavHref+'" placeholder="httpl://worker.app.usr"  required /></div>'+
					'<button class="btn">Submit</button>'+
				'</form>'
				);
			} else
				response.writeHead(404, 'not found').end();
			function respondHTML(html) {
				response.writeHead(200, 'ok', {'content-type':'text/html'});
				response.end(html);
			}
		});
}
