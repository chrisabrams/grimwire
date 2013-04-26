function main(request, response) {
	if (request.path == '/filters') {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end([
			'<ul class="nav nav-pills nav-stacked">',
				'<li class="active"><a href="#">Everything</a></li>',
				'<li><a href="#">Applications</a></li>',
				'<li><a href="#">Workers</a></li>',
				'<li><a href="#">Documentation</a></li>',
			'</ul>'
		].join(''));
	} else {
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end([
			'<div class="row-fluid">',
				'<div id="sidenav" data-grim-layout="replace httpl://layout.index.usr/filters" class="span2"></div>',
				'<div id="main" data-grim-layout="replace httpl://lunr.index.usr" class="span10"></div>',
			'</div>'
		].join(''));
	}
}