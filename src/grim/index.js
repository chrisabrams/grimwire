
// Env Behaviors
// =============
Environment.config.workerBootstrapUrl = 'worker-server.min.js';

// request wrapper
Environment.setDispatchWrapper(function(request, origin, dispatch) {
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
	var response = dispatch(request);
	response.then(function (res) {
		if (/log-js\.util/.test(request.url) === false) {
			console.log(request, res);
			log.post('<span class="label label-success">'+res.status+'</span> '+request.method.toUpperCase()+' '+request.url);
		}
		if (isClientRegion)
			origin.endAnim('request');
		return res;
	});
	response.except(function (err) {
		if (/log-js\.util/.test(request.url) === false) {
			var reason = err.response.reason || '&lsaquo;no reason given&rsaquo;';
			log.post({
				message:'<span class="label label-important">'+err.response.status+'</span> '+request.method.toUpperCase()+' '+request.url+
						'<br/><strong>'+reason+'</strong>',
				type:'error'
			});
		}
		if (isClientRegion) {
			origin.endAnim('request');
			// render the error interface
			if (err.response.code >= 400) {
				origin.dispatchRequest({
					method:'post',
					url:'httpl://app/err',
					target:'-below',
					headers:{ accept:'text/html', 'content-type':'application/json' },
					body:{ request:request, response:err.response }
				});
			}
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
var log = Link.navigator('httpl://log-js.util.worker.servers');

// instantiate environment servers
Environment.addServer('app', new Grim.AppServer());
Environment.addServer('scripts.env', new Grim.ScriptServer());

// instantiate apps
apps.post({ url: 'servers/worker/debug/index.js' });
apps.post({ url: 'servers/worker/edit/text.js' });
apps.post({ url: 'servers/worker/util/form.js' });
apps.post({ url: 'servers/worker/util/keyp.js' });
apps.post({ url: 'servers/worker/util/log.js' })
	.then(function(res) {
		if (res.status == 200) {
			log = Link.navigator('httpl://log-js.util.worker.servers'); // :TEMPORARY: remove once there's a request buffer on log.util.app
			log.post('Log up.');
			Environment.addClientRegion(new Grim.ClientRegion('thirdapp'))
				.dispatchRequest('httpl://log-js.util.worker.servers');
		}
	});
apps.post({ url: 'servers/worker/convert/markdown.js' })
	.then(function(res) {
		Environment.addClientRegion(new Grim.ClientRegion('secondapp'))
			.dispatchRequest('httpl://markdown-js.convert.worker.servers?url=doc/about.md');
	});
apps.post({ url: 'servers/worker/social/users.js' })
	.then(function(res) {
		Environment.addClientRegion(new Grim.ClientRegion('firstapp'))
			.dispatchRequest('httpl://users-js.social.worker.servers/pfraze/apps');
	});

// register custom intents
Grim.intents.register('http://grimwire.com/intents/edit', 'httpl://text-js.edit.worker.servers');

// load apps top bar
Environment.addClientRegion(new Grim.ClientRegion('topside-bar', {droptarget:false})).dispatchRequest('httpl://app');