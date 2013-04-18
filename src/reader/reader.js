var defaultAppConfig = {
	"feed.usr"    : "servers/worker/reader/feed.js",
	"sidenav.usr" : "servers/worker/reader/sidenav.js",
	"rss.proxy"   : "servers/worker/reader/rssproxy.js"
};

// request wrapper
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
Environment.setRegionPostProcessor(function(el) {
	lifespanPostProcess(el);
	if (el.id == 'content')
		updateSidenavHighlight(contentRegion.context.url);
});

// instantiate env services
var configService = Link.navigator('httpl://config.env');
Environment.addServer('localstorage.env', new LocalStorageServer());
Environment.addServer('config.env', new ConfigServer());
Environment.addServer('servers.env', new ReflectorServer(configService));

// setup base config
configService.collection('validators').post({
	url       : '.*',
	string    : '.*',
	number    : '^[0-9\\.\\-]*$',
	'int'     : '^[0-9\\-]*$',
	'bool'    : '^0|1|true|false$'
}, 'application/json');
configService.collection('schemas').item('servers').put({
	feed    : { type:'url', label:'Feed', fallback:'httpl://feed.usr' },
	storage : { type:'url', label:'Storage', fallback:'httpl://localstorage.env' },
	apps    : { type:'string', label:'Apps', fallback:JSON.stringify(defaultAppConfig), control:'textarea', readonly:true }
}, 'application/json');

// load client regions
var sidenavRegion = Environment.addClientRegion('sidenav');
var contentRegion = Environment.addClientRegion('content');

// load config and go
configService.collection('values').item('servers').getJson()
	.succeed(function(res) {
		// load apps
		var apps;
		try {
			apps = JSON.parse(res.body.apps);
		} catch(e) {
			console.log('Failed to read apps config:',e);
			apps = defaultAppConfig;
		}
		for (var domain in apps)
			Environment.addServer(domain, new Environment.WorkerServer({ scriptUrl:appUrl(apps[domain]) }));
		// load feed
		sidenavRegion.dispatchRequest('httpl://sidenav.usr');
		contentRegion.dispatchRequest(res.body.feed);
	});


function updateSidenavHighlight(url) {
	try { document.querySelector('#sidenav input[name="active"]').value = url; } catch(e) {}
	try { document.querySelector('#sidenav .active').classList.remove('active'); } catch (e) {}
	try { document.querySelector('#sidenav a[href="'+url+'"]').parentNode.classList.add('active'); } catch (e) {}
}

var windowLocationDirname = window.location.pathname.split('/');
windowLocationDirname[windowLocationDirname.length - 1] = '';
windowLocationDirname = windowLocationDirname.join('/');
function appUrl(path) {
	if (Link.parseUri(path).protocol)
		return path;
	return window.location.protocol + '//' + window.location.host + windowLocationDirname + path;
}