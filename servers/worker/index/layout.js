function main(request, response) {
	if (request.path == '/filters') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end([
			'<ul class="nav nav-pills nav-stacked">',
				'<li class="active"><a href="httpl://lunr.index.usr/" target="main">Everything</a></li>',
				'<li><a href="httpl://lunr.index.usr/?subject=apps" target="main">Applications</a></li>',
				'<li><a href="httpl://lunr.index.usr/?subject=workers" target="main">Workers</a></li>',
				'<li><a href="httpl://lunr.index.usr/?subject=docs" target="main">Documentation</a></li>',
			'</ul>'
		].join(''));
	} else if (request.path == '/1column') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end([
			'<p><a class="btn btn-mini" href="httpl://'+local.worker.config.domain+'" target="layout">Filters</a></p>',
			'<div class="row-fluid">',
				'<div id="main" data-grim-layout="replace httpl://lunr.index.usr" class="span12"></div>',
			'</div>'
		].join(''));
	} else {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end([
			'<p><a class="btn btn-mini active" href="httpl://'+local.worker.config.domain+'/1column" target="layout">Filters</a></p>',
			'<div class="row-fluid">',
				'<div id="sidenav" data-grim-layout="replace httpl://layout.index.usr/filters" class="span2"></div>',
				'<div id="main" data-grim-layout="replace httpl://lunr.index.usr" class="span10"></div>',
			'</div>'
		].join(''));
	}
}