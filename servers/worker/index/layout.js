var config = local.worker.config;
var mainHref = config.usr.mainHref || config.mainHref || 'httpl://lunr.index.usr';
var sidenavHref = config.usr.sidenavHref || config.sidenavHref || 'httpl://layout.index.usr/filters';
function main(request, response) {
	if (!request.path || request.path == '/' || request.path == '/2column') {
		respondHTML(
		'<p><a class="btn btn-mini active" href="httpl://'+config.domain+'/1column">Filters</a></p>'+
		'<div class="row-fluid">'+
			'<div id="sidenav" data-grim-layout="replace '+sidenavHref+'" class="span2"></div>'+
			'<div id="main" data-grim-layout="replace '+mainHref+'" class="span10"></div>'+
		'</div>'
		);
	} else if (request.path == '/1column') {
		respondHTML(
		'<p><a class="btn btn-mini" href="httpl://'+config.domain+'/2column">Filters</a></p>'+
		'<div class="row-fluid">'+
			'<div id="main" data-grim-layout="replace '+mainHref+'" class="span12"></div>'+
		'</div>'
		);
	} else if (request.path == '/filters') {
		respondHTML(
		'<ul class="nav nav-pills nav-stacked">'+
			'<li class="active"><a href="httpl://lunr.index.usr/" target="main" data-toggle="pill">Everything</a></li>'+
			'<li><a href="httpl://lunr.index.usr/?subject=apps" target="main" data-toggle="pill">Applications</a></li>'+
			'<li><a href="httpl://lunr.index.usr/?subject=workers" target="main" data-toggle="pill">Workers</a></li>'+
			'<li><a href="httpl://lunr.index.usr/?subject=docs" target="main" data-toggle="pill">Documentation</a></li>'+
		'</ul>'
		);
	} else if (request.path == '/.grim/config') {
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
}
