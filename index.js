var $layoutContainerEl = $('#grim-layout-container');
var $topbarAppsEl = $('#grim-topbar-apps');
if ($layoutContainerEl.length === 0) throw "#grim-layout-container element not found";
if ($topbarAppsEl.length === 0) throw "#grim-topbar-apps element not found";


// request wrapper
// -
Environment.config.workerBootstrapUrl = 'worker-server.min.js';
Environment.setDispatchWrapper(function(request, origin, dispatch) {
	// allow request
	var response = dispatch(request);
	response.then(
		function(res) { console.log(res.status, request.method, request.url); },
		function(err) { console.log(err.response.status, request.method, request.url); }
	);
	return response;
});


// client post-processor
// -
Environment.setRegionPostProcessor(function(el) {
	lifespanPostProcess(el);
});


// environment services
// -
var hosts = {
	storage: Link.navigator('httpl://storage.env'),
	config: Link.navigator('httpl://config.env'),
	workers: Link.navigator('httpl://workers.env')
};
var storageServer = new StorageServer(sessionStorage);
var configServer = new ConfigServer(hosts.storage);
var workerServer = new ReflectorServer(hosts.config);
Environment.addServer('storage.env', storageServer);
Environment.addServer('config.env', configServer);
Environment.addServer('workers.env', workerServer);


// environment event handlers
// -
(function() {
	var configsCollection = hosts.config.collection('applications');

	configsCollection.subscribe().succeed(function(apps) {
		apps.on('update', function(e) {
			renderTopbarApps(e.data);
			highlightActiveApp(configServer.activeAppId);
		});
	});

	configsCollection.item('.active').subscribe().succeed(function(activeApp) {
		activeApp.on('open', function(e) {
			var config = e.data;
			document.title = (config.title || 'Untitled Application') + ' &there4; Grimwire OS';
			highlightActiveApp(config.id);
			renderLayout(config.layout);
		});
	});
})();


// host config load
// -
configServer.loadFromHost()
	.succeed(function(configs) {
		var appId = window.location.hash.slice(1);
		if (!configs[appId]) appId = configs.__defaultApp;
		return configServer.openApp(appId);
	});


// UI renderers
// -
function renderTopbarApps(appCfgs) {
	var html = [];
	for (var id in appCfgs) {
		html.push('<li><a href="#',id,'"><i class="icon-',(appCfgs[id].icon || 'folder-close'),'"></i> ',appCfgs[id].title,'</a></li>');
		html.push('<li class="divider-vertical"></li>');
	}
	$topbarAppsEl.html(html.join(''));
}
function highlightActiveApp(appId) {
	$('.active', $topbarAppsEl).removeClass('active');
	$('#grim-topbar-apps-'+appId).addClass('active');
}
function renderLayout(layoutCfg) {
	var regionUrls=[], nRegions=0;

	// build html
	var html = [];
	layoutCfg.forEach(function(rowCfg) {
		if (!Array.isArray(rowCfg)) rowCfg = [rowCfg];
		html.push('<div class="row">');
		rowCfg.forEach(function(columnCfg) {
			if (!columnCfg.width) return console.warn('Invalid layout config: `width` is required', columnCfg);
			html.push(
				'<div class="span{{width}}" {{id}}>'
					.replace('{{width}}', columnCfg.width)
					.replace('{{id}}', (columnCfg.id) ? 'id="'+columnCfg.id+'"' : '')
			);
			if (columnCfg.regions) {
				if (!Array.isArray(columnCfg.regions)) columnCfg.regions = [columnCfg.regions];
				columnCfg.regions.forEach(function(url) {
					regionUrls.push(url);
					html.push('<div class="client-region" id="client-region-'+(nRegions++)+'"></div>');
				});
			}
			html.push('</div>');
		});
		html.push('</div>');
	});

	// replace all client regions
	$('.client-region', $layoutContainerEl).forEach(function($el) {
		Environment.removeClientRegion($el.id);
	});
	$layoutContainerEl.html(html.join(''));
	regionUrls.forEach(function(url, i) {
		Environment.addClientRegion('client-region-'+i).dispatchRequest(url);
	});
}


// UI behaviors
// -
$topbarAppsEl.click(function(e) {
	configServer.openApp($(e.target).getAttribute('href').slice(1));
});