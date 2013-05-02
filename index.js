var $layoutContainerEl = $('#grim-layout');
var $topbarEl = $('#grim-topbar');
var $topbarAppsEl = $('#grim-topbar-apps');
if ($layoutContainerEl.length === 0) throw "#grim-layout element not found";
if ($topbarEl.length === 0) throw "#grim-topbar element not found";
if ($topbarAppsEl.length === 0) throw "#grim-topbar-apps element not found";
var layoutRegion = local.env.addClientRegion(new local.client.GrimRegion('grim-layout'));

// request wrapper
// -
local.env.config.workerBootstrapUrl = 'worker.js';
local.env.setDispatchWrapper(function(request, origin, dispatch) {
	// attach origin information
	if (request.urld.protocol == 'httpl') {
		// attach links
		local.http.reqheader(request, 'link', { href:'httpl://storage.env/'+request.urld.host, rel:'http://grimwire.com/rel/storage' });
		// ^ when multiple peers' servers enter the namespace, this will direct the Worker to the correct user's storage

		// attach cookies
		var storedCookies = storageServer.getItem(request.urld.host, '.cookies');
		var reqCookies = {}; // extract cookie values
		if (storedCookies && storedCookies.items) {
			for (var k in storedCookies.items) {
				reqCookies[k] = storedCookies.items[k].value || storedCookies.items[k];
				// ^ cookies may be given as a single value or as an object with {value:...}

				// add flagged values to the query object
				if (storedCookies.items[k].query)
					request.query[k] = request.query[k] || storedCookies.items[k].value;
			}
		}
		local.http.reqheader(request, 'cookie', reqCookies);
	}

	// allow request
	var response = dispatch(request);
	response.then(handleResponse, handleResponse);
	function handleResponse(res) {
		// log
		if (Object.keys(request.query).length)
			console.log(res.status, request.method, request.url, JSON.stringify(request.query));
		else
			console.log(res.status, request.method, request.url);

		// update cookies
		var cookies = local.http.resheader(res, 'cookie');
		if (cookies) {
			var storedCookies = storageServer.getItem(request.urld.host, '.cookies') || {id:'.cookies',items:{}};
			if (!storedCookies.items || typeof storedCookies.items != 'object')
				storedCookies.items = {}; // save us from corruption
			for (var k in cookies) {
				if (cookies[k] === null)
					delete storedCookies.items[k];
				else
					storedCookies.items[k] = cookies[k];
			}
			storageServer.setItem(request.urld.host, storedCookies);
		}
	}
	return response;
});


// client post-processor
// -
local.env.setRegionPostProcessor(function(el) {
	// grim widgets
	lifespanPostProcess(el);
	grimLayoutPostProcess(el);
	$("[data-toggle=nav]", el).on('request', function(e) {
		$('.active', $(this).parent().parent()).removeClass('active');
		$(this).parent().addClass('active');
	});
	// bootstrap widgets
	$(el).tooltip({ selector: "[data-toggle=tooltip]" });
	$("[data-toggle=popover]", el).popover().click(function(e) { e.preventDefault(); });
	$("[data-loading-text]", el).click(function() { $(this).button('loading'); });
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