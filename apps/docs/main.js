var config = local.worker.config;

// a tree-structure describing the docs
// - attributes that start with '_' describe the current node
// - other attributes are subnodes
// - if no `_template` is defined, will try to find one using a generated slug
// - if `_template` is set to false, clicking the nav item will not update the content view
// - if `_nav` is set to fase, the document will not be included in the sidenav
// :NOTE: this could be moved into configuration
var Documentation = {
	_template: 'layout',
	_template_vars: { 'sidenav':renderSidenav },
	intro: {
		_title: 'Introduction',
		structured: { _nav:false },
		'user-driven': { _nav:false },
		'multi-threaded': { _nav:false },
		decentralized: { _nav:false }
	},
	'getting-started': {
		_title: 'Getting Started',
		_template: false,
		'using-grimwire': { _title:'Using Grimwire' },
		building: { _title:'Building' },
		contributing: { _title:'Contributing' }
	},
	applications: {
		_title: 'Applications',
		_template: false,
		configuration: { _title:'Configuration' },
		'worker-servers': { _title:'Worker Servers' },
		'client-regions': { _title:'Client Regions' },
		'sessions-and-security': { _title:'Sessions &amp; Security' },
		styling: { _title:'Styling' }
	},
	toolset: {
		_title: 'Toolset',
		_template: false,
		navigator: { _title:'Navigator' },
		sses: { _title:'Server-Sent Events' },
		'cookies-and-storage': { _title:'Cookies &amp; Storage' },
		'html-deltas': { _title:'HTML Deltas' },
		'data-apis': {
			_title: 'Data-* APIs',
			bootstrap: { _title:'Bootstrap Components' },
			subscribe: { _title:'subscribe' },
			'grim-layout': { _title:'grim-layout' }
		}
	},
	local: {
		_title: 'Local API',
		_template: false,
		promises: { _title:'Promises' },
		http: { _title:'HTTP' },
		worker: { _title:'Worker' },
		client: { _title:'Client' },
		env: { _title:'Environment' },
		util: { _title:'Utilities' }
	}
};

function main(request, response) {
	if (request.method == 'GET') {
		var doc = lookupDoc(request);
		if (!doc)
			return response.writeHead(404, 'not found').end();

		if (/html-deltas/.test(request.headers.accept)) {
			var section = doc.path[0];
			var deltas = { addClass:{}, removeClass:{} };
			deltas.addClass['#docs-nav .item:not(.'+section+')'] = 'hidden';
			deltas.removeClass['#docs-nav .item.'+section] = 'hidden';

			if (doc.desc._template !== false)
				deltas.navigate = { '#docs-content':'httpl://'+config.domain+request.path };

			response.writeHead(200, 'ok', {'content-type':'application/html-deltas+json'});
			response.end(deltas);
		}
		else if (/html/.test(request.headers.accept)) {
			response.writeHead(200, 'ok', {'content-type':'text/html'});
			response.end(doc.renderDoc());
		}
		else
			response.writeHead(406, 'bad accept').end();
	}
}

// finds a node in the `Documentation` tree using the request path
function lookupDoc(request) {
	var path = request.path.split('/').slice(1);
	if (!path[0])
		return docInterface(Documentation, path, request);
	var node = Documentation;
	for (var i=0; i < path.length; i++) {
		node = node[path[i]];
		if (!node)
			return null;
	}
	return docInterface(node, path, request);
}

// provides a set of functions for using the `Documentation` node
function docInterface(doc, path, request) {
	return {
		desc: doc,
		path: path,
		renderDoc: function() {
			var templateName = doc._template || request.path.slice(1).replace(/\//g, '_');
			var template = require('templates/' + templateName + '.html') || '<h2>Error</h2><p>Template not found at <code>templates/'+templateName+'.html</code></p>';
			template = template.replace(/\{\{domain\}\}/g, config.domain);
			if (doc._template_vars) {
				for (var k in doc._template_vars) {
					var v = doc._template_vars[k];
					if (typeof v == 'function')
						v = v();
					template = template.replace(RegExp('{{'+k+'}}', 'g'), v);
				}
			}
			return template;
		}
	};
}

var sidenavHtml = null;
function renderSidenav() {
	if (sidenavHtml) return sidenavHtml;
	sidenavHtml = '';
	var first = true;
	for (var sectionSlug in Documentation) {
		if (sectionSlug.charAt(0) == '_') continue;
		var section = Documentation[sectionSlug];
		if (section._nav === false) continue;

		// section header
		var active = (first) ? 'active' : '';
		var muted = (section._template === false) ? 'class="muted"' : '';
		var toggle = (section._template !== false) ? 'data-toggle="nav"' : '';
		sidenavHtml += '<li class="divider"></li>';
		sidenavHtml += '<li class="nav-header '+active+'">';
		sidenavHtml += '<a '+muted+' href="httpl://'+config.domain+'/'+sectionSlug+'" type="application/html-deltas+json" '+toggle+'>';
		sidenavHtml += section._title || sectionSlug;
		sidenavHtml += '</a></li>';

		sidenavHtml += renderSidenavSection(sectionSlug, section);

		first = false;
	}
	return sidenavHtml;
}

function renderSidenavSection(sectionSlug, section) {
	var sectionHtml = '';
	for (var itemSlug in section) {
		if (itemSlug.charAt(0) == '_') continue;
		var item = section[itemSlug];
		if (item._nav === false) continue;

		sectionHtml += '<li class="'+sectionSlug+' item hidden"><a href="httpl://'+config.domain+'/'+sectionSlug+'/'+itemSlug+'" type="application/html-deltas+json" data-toggle="nav">';
		sectionHtml += item._title || itemSlug;
		sectionHtml += '</a>';
		sectionHtml += renderSidenavSubitems(sectionSlug, itemSlug, item);
		sectionHtml += '</li>';
	}
	return sectionHtml;
}

function renderSidenavSubitems(sectionSlug, itemSlug, item) {
	var subitemHtml = '';
	var first = true;
	for (var subitemSlug in item) {
		if (subitemSlug.charAt(0) == '_') continue;
		var subitem = item[subitemSlug];
		if (subitem._nav === false) continue;

		if (first)
			subitemHtml += '<ul>';
		subitemHtml += '<li><a href="httpl://'+config.domain+'/'+sectionSlug+'/'+itemSlug+'/'+subitemSlug+'" type="application/html-deltas+json" data-toggle="nav">';
		subitemHtml += subitem._title || subitemSlug;
		subitemHtml += '</a></li>';
		first = false;
	}
	if (!first)
		subitemHtml += '</ul>';
	return subitemHtml;
}