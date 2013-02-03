
// Env Behaviors
// =============
Environment.config.workerBootstrapUrl = '/local/lib/worker_bootstrap.js';

// request wrapper
Environment.setDispatchHandler(function(origin, request) {
	// make any connectivity / permissions decisions here
	// var urld = Link.parseUri(request);

	// add the credentials, if targetting our host and currently logged in
	// if (Environment.user && /https?/i.test(urld.protocol) && /linkapjs\.com$/i.test(urld.host)) {
	//	request.headers = Link.headerer(request.headers).setAuth(Environment.user);
	// }

	// allow request
	var response = Link.dispatch(request);
	response.then(function (res) {
		if (/log\.util\.app/.test(request.url) === false) {
			log.post(res.status+' '+request.url);
		}
		return res;
	});
	response.except(function (err) {
		if (/log\.util\.app/.test(request.url) === false) {
			log.post(err.response.status+' '+request.url);
		}
		console.log(err.message, request);
		return err;
	});
	return response;
});

// dom update post-processor
Environment.setRegionPostProcessor(function(elem) {
	// addPersonaCtrls(elem);
	$('.dropdown-toggle', elem).dropdown();
});


// Init
// ====

// global navigators
var apps = Link.navigator('httpl://app');
var log = Link.navigator('httpl://v1.pfraze.log.util.app'); // :TODO: should be log.util.app

// instantiate environment servers
Environment.addServer('app', new Grim.AppServer());
Environment.addServer('scripts.env', new Grim.ScriptServer());

// instantiate apps
apps.post({ scriptUrl : '/grim/app/debug/targets.js' });
apps.post({ scriptUrl : '/grim/app/debug/forms.js' });
apps.post({ scriptUrl : '/grim/app/convert/markdown.js' });
apps.post({ scriptUrl : '/grim/app/edit/text.js' });
apps.post({ scriptUrl : '/grim/app/help/about.js' })
	.then(function(res) {
		if (res.status == 200) {
			Environment.clientRegions.firstapp.dispatchRequest('httpl://v1.pfraze.about_grimwire.help.app');
		}
	});
apps.post({ scriptUrl : '/grim/app/util/log.js' })
	.then(function(res) {
		if (res.status == 200) {
			log = Link.navigator('httpl://v1.pfraze.log.util.app'); // :TEMPORARY: remove once there's a request buffer on log.util.app
			log.post('Log up.');
			Environment.clientRegions.secondapp.dispatchRequest('httpl://v1.pfraze.log.util.app');
		}
	});

// register intents
Grim.intents.register('http://grimwire.com/intents/edit', 'httpl://v1.pfraze.text.edit.app', '-below');

// load client regions
Environment.addClientRegion(new Grim.ClientRegion('topside-bar', {droptarget:false})).dispatchRequest('httpl://app');
Environment.addClientRegion(new Grim.ClientRegion('firstapp'));
Environment.addClientRegion(new Grim.ClientRegion('secondapp'));
