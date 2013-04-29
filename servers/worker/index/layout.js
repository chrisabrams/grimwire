var config = local.worker.config;
var mainUrl = config.usr.mainUrl || config.mainUrl || 'httpl://lunr.index.usr';
var sidenavUrl = config.usr.sidenavUrl || config.sidenavUrl || 'httpl://layout.index.usr/filters';
function main(request, response) {
	if (!request.path || request.path == '/' || request.path == '/2column') {
		respondHTML(
		'<p><a class="btn btn-mini active" href="httpl://'+config.domain+'/1column" target="layout">Filters</a></p>'+
		'<div class="row-fluid">'+
			'<div id="sidenav" data-grim-layout="replace '+sidenavUrl+'" class="span2"></div>'+
			'<div id="main" data-grim-layout="replace '+mainUrl+'" class="span10"></div>'+
		'</div>'
		);
	} else if (request.path == '/1column') {
		respondHTML(
		'<p><a class="btn btn-mini" href="httpl://'+config.domain+'/2column" target="layout">Filters</a></p>'+
		'<div class="row-fluid">'+
			'<div id="main" data-grim-layout="replace '+mainUrl+'" class="span12"></div>'+
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
			if (!request.body.mainUrl || !request.body.sidenavUrl) {
				msg = '<div class="alert alert-error">Please enter values for all fields.</div>';
			} else {
				local.http.dispatch({
					method: 'patch',
					url: 'httpl://config.env/workers/'+config.domain,
					body: { mainUrl:request.body.mainUrl, sidenavUrl:request.body.sidenavUrl },
					headers: { 'content-type':'application/json' }
				});
				mainUrl = request.body.mainUrl;
				sidenavUrl = request.body.sidenavUrl;
				msg = '<div class="alert alert-success" data-lifespan="5">Updated</div>';
			}
		}
		respondHTML(
		'<form action="httpl://'+config.domain+'/.grim/config" method="post">'+
			msg+
			'<label for="index-layout-mainurl">Main URL</label>'+
			'<div class="controls"><input type="url" id="index-layout-mainurl" name="mainUrl" class="input-xxlarge" value="'+mainUrl+'" placeholder="httpl://worker.app.usr" required /></div>'+
			'<label for="index-layout-sidenavurl">Sidenav URL</label>'+
			'<div class="controls"><input type="url" id="index-layout-sidenavurl" name="sidenavUrl" class="input-xxlarge" value="'+sidenavUrl+'" placeholder="httpl://worker.app.usr"  required /></div>'+
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
