
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
	var isClientRegion = (origin instanceof Grim.ClientRegion);
	if (isClientRegion)
		origin.startAnim('request');

	// allow request
	var response = Link.dispatch(request);
	response.then(function (res) {
		if (/log\.util\.app/.test(request.url) === false) {
			log.post(res.status+' '+request.url);
		}
		if (isClientRegion)
			origin.endAnim('request');
		return res;
	});
	response.except(function (err) {
		if (/log\.util\.app/.test(request.url) === false) {
			log.post(err.response.status+' '+request.url);
		}
		if (isClientRegion) {
			origin.endAnim('request');
			// render the error interface
			origin.dispatchRequest({
				method:'post',
				url:'httpl://app/err',
				target:'-below',
				headers:{ accept:'text/html', 'content-type':'application/json' },
				body:{ request:request, response:err.response }
			});
		}
		console.log(err.message, request, err.response);
		return err;
	});
	return response;
});

// dom update post-processor
Environment.setRegionPostProcessor(function(elem) {
	// addPersonaCtrls(elem);
	$('.dropdown-toggle', elem).dropdown();
	
	// :DEBUG:
	$('.persona', elem).css('cursor','pointer').click(function() { alert('Sorry, not yet implemented.'); });
});

// top bar shadow-on-scroll
(function() {
	var topbarIsShadowed = false;
	var $topbar = $('#topside-bar');
	$(window).scroll(function() {
		if (!topbarIsShadowed && window.scrollY > 10) {
			$topbar.addClass('shadowed');
			topbarIsShadowed = true;
		} else if (topbarIsShadowed && window.scrollY < 10) {
			$topbar.removeClass('shadowed');
			topbarIsShadowed = false;
		}
	});
})();

// Init
// ====

// global navigators
var apps = Link.navigator('httpl://app');
var log = Link.navigator('httpl://v1.pfraze.log.util.app'); // :TODO: should be log.util.app

// instantiate environment servers
Environment.addServer('app', new Grim.AppServer());
Environment.addServer('scripts.env', new Grim.ScriptServer());
Environment.addServer('localstorage.env', new Grim.LocalStorageServer());

// instantiate apps
// apps.post({ url : '/grim/app/debug/targets.js' });
// apps.post({ url : '/grim/app/debug/forms.js' });
apps.post({ url : '/grim/app/debug/index.js' });
apps.post({ url : '/grim/app/convert/markdown.js' });
apps.post({ url : '/grim/app/edit/text.js' });
apps.post({ url : '/grim/app/help/about.js' })
	.then(function(res) {
		if (res.status == 200) {
			Environment.clientRegions.firstapp.dispatchRequest('httpl://v1.pfraze.about_grimwire.help.app');
		}
	});
apps.post({ url : '/grim/app/util/form.js' })
apps.post({ url : '/grim/app/util/log.js' })
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
