var defaultAppConfig = {
	"index.usr"   : "servers/worker/index/lunr.js",
	"sidenav.usr" : "servers/worker/index/sidenav.js"
};
var baseIndexData = [
	{
		title:'Local Servers',
		href:'httpl://servers.env',
		tags:['worker','servers','session'],
		desc:'Active local servers running in worker threads'
	}, {
		title:'Configuration',
		href:'httpl://config.env',
		tags:['config','session'],
		desc:'Settings of the active session'
	}, {
		title:'Reader.html',
		href:'reader.html',
		tags:['reader','rss','feed','env'],
		desc:'feed-reader environment',
		target:'_top'
	}, {
		title:'Grimwire Repo',
		href:'https://github.com/grimwire/grimwire',
		tags:['code','git','repo'],
		desc:'github repository for grimwire',
		target:'_top'
	}, {
		title:'LocalJS Repo',
		href:'https://github.com/grimwire/local',
		tags:['code','git','repo'],
		desc:'github repository for grimwire\'s supporting library, local',
		target:'_top'
	}, {
		title:'LocalJS Docs',
		href:'http://grimwire.com/local',
		tags:['documentation','local','help'],
		desc:'documentation on grimwire\'s supporting library, local',
		target:'_top'
	}, {
		title:'Twitter Bootstrap Docs',
		href:'http://twitter.github.com/bootstrap/index.html',
		tags:['documentation','bootstrap','help'],
		desc:'documentation on the twitter bootstrap css library',
		target:'_top'
	}, {
		title:'APIHub',
		href:'http://www.apihub.com/',
		tags:['documentation','api','help'],
		desc:'web api listing for finding backend services',
		target:'_top'
	}
];

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
// var indexService = Link.navigator('httpl://index.usr');
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
		// seed the index
		var indexService = Link.navigator('httpl://index.usr');
		var indexDocsCollection = indexService.collection('docs');
		indexDocsCollection.post(baseIndexData, 'application/json').succeed(function() {
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
	return window.location.protocol + '//' + window.location.host + windowLocationDirname + path;
}