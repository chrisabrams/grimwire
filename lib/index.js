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
	var $requestInProgress;
	if (origin && origin instanceof local.client.Region) {
		$requestInProgress =  $('<div class="request-in-progress"></div>');
		$(document.body).append($requestInProgress);
	}

	// attach origin information
	if (request.urld.protocol == 'httpl') {
		attachCookies(request, origin);

		// attach links
		if (!request.headers.link)
			request.headers.link = [];
		request.headers.link.push({ href:'httpl://storage.env/'+request.urld.host, rel:'http://grimwire.com/rel/appstorage' });
		// ^ when multiple peers' servers enter the namespace, this will direct the Worker to the correct user's storage
	}

	// allow request
	var response = dispatch(request);
	response.always(function (response) {
		console.log(response.status, request.method, request.url);
		if ($requestInProgress)
			$requestInProgress.detach();
		updateCookies(request, origin, response);
	});
	return response;
});


// client post-processor
// -
local.env.setRegionPostProcessor(function(el, containerEl) {
	// grim widgets
	clientRegionPostProcess(el, containerEl);
	grimWidgets.lifespan(el, containerEl);
	grimWidgets.value_of(el, containerEl);

	// bootstrap widgets
	$(el).tooltip({ selector: "[data-toggle=tooltip]" });
	$("[data-toggle=popover]", el).popover().click(function(e) { e.preventDefault(); });
	$("[data-loading-text]", el).click(function() { $(this).button('loading'); });
	$("[data-toggle=nav]", el).on('click', function(e) {
		$('.active', $(this).parents('.nav')[0]).removeClass('active');
		$(this).parent().addClass('active');
	});

	// other widgets
	$("pre[class|=language]", el).each(function(i, el) { Prism.highlightElement(el); });
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
// stop any action on href="#" (noop)
document.body.addEventListener('click', function(e) {
	if (e.button !== 0) { return; } // handle left-click only
	if (e.target.tagName != 'A') { return; } // handle link clicks only
	if (e.target.attributes.href.value == '#')
		e.preventDefault();
});
// stick the transforms on scroll
$('#grim-transformsbar').sticky({ topSpacing: 6 });


// Browser compat messages
// -
(function() {
	var is_chrome = navigator.userAgent.indexOf('Chrome') > -1;
	var is_explorer = navigator.userAgent.indexOf('MSIE') > -1;
	var is_firefox = navigator.userAgent.indexOf('Firefox') > -1;
	var is_safari = navigator.userAgent.indexOf("Safari") > -1;
	var is_opera = navigator.userAgent.indexOf("Presto") > -1;
	if ((is_chrome)&&(is_safari)) {is_safari=false;}

	if (is_safari)
		$('#grim-layout').html('<div class="alert alert-error alert-block"><h4>Error!</h4><p>Safari has an <a href="https://github.com/grimwire/local/issues/54" target="_blank">outstanding issue</a> which keeps it from supporting Grimwire. We\'re sorry for the inconvenience! Please try Chrome or Firefox.</p></div>');
	if (is_explorer)
		$('#grim-layout').html('<div class="alert alert-error alert-block"><h4>Error!</h4><p>Internet Explorer is not yet supported. We\'re sorry for the inconvenience! Please try Chrome or Firefox.</p></div>');
})();