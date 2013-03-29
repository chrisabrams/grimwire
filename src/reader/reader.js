// request wrapper
Environment.config.workerBootstrapUrl = 'local/lib/worker_bootstrap.js';
Environment.setDispatchWrapper(function(request, origin, dispatch) {
	// update sidenav highlight
	if (origin instanceof Environment.ClientRegion && origin.element.id == 'sidenav')
		updateSidenavHighlight(request.url);

	// allow request
	var response = dispatch(request);
	response.then(console.log.bind(console), request);
	response.except(console.log.bind(console), request);
	return response;
});
Environment.setRegionPostProcessor(function(el) {
	var lifespanEls = el.querySelectorAll('[data-lifespan]');
	for (var i = 0; i < lifespanEls.length; i++) {
		(function(lifespanEl) {
			setTimeout(function() {
				if (lifespanEl)
					lifespanEl.parentNode.removeChild(lifespanEl);
			}, lifespanEl.dataset.lifespan * 1000);
		})(lifespanEls[i]);
	}
});

// instantiate env services
var configService = Link.navigator('httpl://config.env');
Environment.addServer('localstorage.env', new LocalStorageServer());
Environment.addServer('config.env', new ConfigServer());
Environment.addServer('servers.env', new ReflectorServer(configService));
Environment.addServer('sidenav.env', new SidenavServer(configService));

// setup base config
configService.collection('validators').post({
	url       : '.*',
	string    : '.*',
	number    : '^[0-9\\.\\-]*$',
	'int'     : '^[0-9\\-]*$',
	'bool'    : '^0|1|true|false$'
}, 'application/json');
configService.collection('schemas').item('servers').put({
	feed    : { type:'url', label:'Feed', fallback:'httpl://feed.ui' },
	storage : { type:'url', label:'Storage', fallback:'httpl://localstorage.env' },
	apps    : { type:'string', label:'Apps', fallback:'{"feed.ui":"apps/usr/feed.js","rss.proxy":"apps/usr/rssproxy.js"}', control:'textarea', readonly:true }
}, 'application/json');

// load client regions
var sidenavRegion = Environment.addClientRegion('sidenav');
var contentRegion = Environment.addClientRegion('content');
sidenavRegion.addRight('element targeting');
contentRegion.addRight('element targeting');

// load config and go
configService.collection('values').item('servers').getJson()
	.then(function(res) {
		// load apps
		var apps;
		try {
			apps = JSON.parse(res.body.apps);
		} catch(e) {
			console.log('Failed to read apps config:',e);
			apps = {"feed.usr":"apps/usr/feed.js", "rss.proxy":"apps/usr/rssproxy.js"};
		}
		for (var domain in apps)
			Environment.addServer(domain, new Environment.WorkerServer({ scriptUrl:appUrl(apps[domain]) }));
		// load feed
		sidenavRegion.dispatchRequest('httpl://sidenav.env');
		contentRegion.dispatchRequest(res.body.feed);
	});


function updateSidenavHighlight(url) {
	try { document.querySelector('#sidenav input[name="active"]').value = url; } catch(e) {}
	try { document.querySelector('#sidenav .active').classList.remove('active'); } catch (e) {}
	try { document.querySelector('#sidenav a[href="'+url+'"]').parentNode.classList.add('active'); } catch (e) {}
}

function appUrl(path) {
	if (Link.parseUri(path).protocol)
		return path;
	return window.location.origin + window.location.pathname + path;
}