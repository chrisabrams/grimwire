var defaultAppConfig = {
	"index.usr"   : "servers/worker/index/lunr.js",
	"sidenav.usr" : "servers/worker/index/sidenav.js"
};

// request wrapper
Environment.config.workerBootstrapUrl = 'worker-server.min.js';
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
	lifespanPostProcess(el);
});

// instantiate env services
var configService = Link.navigator('httpl://config.env');
var indexService = Link.navigator('httpl://index.usr');
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
	index   : { type:'url', label:'Index', fallback:'httpl://index.usr' },
	storage : { type:'url', label:'Storage', fallback:'httpl://localstorage.env' },
	apps    : { type:'string', label:'Apps', fallback:JSON.stringify(defaultAppConfig), control:'textarea', readonly:true }
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
			apps = defaultAppConfig;
		}
		for (var domain in apps)
			Environment.addServer(domain, new Environment.WorkerServer({ scriptUrl:appUrl(apps[domain]) }));
		// seed the index
		var indexService = Link.navigator('httpl://index.usr');
		var indexDocsCollection = indexService.collection('docs');
		promise(
			indexDocsCollection.post({
				title:'Local Servers',
				href:'httpl://servers.env',
				tags:['worker','servers','env'],
				desc:'active local servers running in worker threads'
			}, 'application/json'),
			indexDocsCollection.post({
				title:'Configuration',
				href:'httpl://config.env',
				tags:['config','env'],
				desc:'settings of the active session'
			}, 'application/json'),
			indexDocsCollection.post({
				title:'Reader',
				href:'/reader.html',
				tags:['reader','rss','feed','env'],
				desc:'feed-reader environment',
				target:'_top'
			}, 'application/json')
		).then(function() {
			// load index
			sidenavRegion.dispatchRequest('httpl://sidenav.usr');
			contentRegion.dispatchRequest(res.body.index);
		});
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
	return window.location.origin + windowLocationDirname + path;
}