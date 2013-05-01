var $layoutContainerEl = $('#grim-layout');
var $topbarEl = $('#grim-topbar');
var $topbarAppsEl = $('#grim-topbar-apps');
if ($layoutContainerEl.length === 0) throw "#grim-layout element not found";
if ($topbarEl.length === 0) throw "#grim-topbar element not found";
if ($topbarAppsEl.length === 0) throw "#grim-topbar-apps element not found";
var layoutRegion = local.env.addClientRegion(new local.client.GrimRegion('grim-layout'));

// request wrapper
// -
local.env.config.workerBootstrapUrl = 'worker.min.js';
local.env.setDispatchWrapper(function(request, origin, dispatch) {
	// allow request
	var response = dispatch(request);
	response.then(
		function(res) { console.log(res.status, request.method, request.url); },
		function(res) { console.log(res.status, request.method, request.url); }
	);
	return response;
});


// client post-processor
// -
local.env.setRegionPostProcessor(function(el) {
	lifespanPostProcess(el);
	grimLayoutPostProcess(el);
});


// environment services
// -
var hosts = {
	storage: local.http.navigator('httpl://storage.env'),
	config:  local.http.navigator('httpl://config.env')
	// workers: local.http.navigator('httpl://workers.env')
};
var storageServer = new StorageServer(sessionStorage);
var configServer = new ConfigServer(hosts.storage);
// var workerServer = new ReflectorServer(hosts.config);
local.env.addServer('storage.env', storageServer);
local.env.addServer('config.env', configServer);
// local.env.addServer('workers.env', workerServer);


// environment event handlers
// -
(function() {
	var appConfigsCollection = hosts.config.collection('apps');

	appConfigsCollection.subscribe().succeed(function(apps) {
		apps.on('update', function(e) {
			renderTopbarApps(e.data);
			highlightActiveApp(configServer.activeAppId);
		});
	});

	appConfigsCollection.item('.active').subscribe().succeed(function(activeApp) {
		activeApp.on('update', function(e) {
			var config = e.data;
			document.title = 'Grimwire - ' + (config.title || 'Untitled Application');
			highlightActiveApp(config.id);
			layoutRegion.dispatchRequest(config.startpage);
		});
	});
})();


// host config load
// -
configServer.loadFromHost()
	.succeed(function() { return configServer.openEnabledApps(); })
	.succeed(function() {
		configServer.setActiveApp(window.location.hash.slice(1));
		configServer.broadcastOpenApps();
	});


// UI renderers
// -
function renderTopbarApps(appCfgs) {
	var html = [];
	for (var id in appCfgs) {
		if (id.charAt(0) == '_') continue; // env app, no nav item
		html.push('<li><a href="#',id,'"><i class="icon-',(appCfgs[id].icon || 'folder-close'),'"></i> ',appCfgs[id].title,'</a></li>');
		html.push('<li class="divider-vertical"></li>');
	}
	$topbarAppsEl.html(html.join(''));
}
function highlightActiveApp(appId) {
	$('.active', $topbarEl).removeClass('active');
	$('[href="#'+appId+'"]', $topbarEl).parent().addClass('active');
}


// UI behaviors
// -
window.addEventListener('hashchange', function() {
	configServer.setActiveApp(window.location.hash.slice(1));
});