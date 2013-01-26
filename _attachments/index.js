// :DEBUG:
// =======

$('.sigils i').on('click', function(e) {
	$(e.target).toggleClass('charged');
});



// Definitions
// ===========

Environment.config.workerBootstrapUrl = '/local/lib/worker_bootstrap.js'

// helpers
function logError(err, request) {
	console.log(err.message, request);
	return err;
}

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
	response.except(logError, request);
	return response;
});

// dom update post-processor
Environment.setRegionPostProcessor(function(elem) {
	// addPersonaCtrls(elem);
});



// Init
// ====

// instantiate environment servers
// var personaServer = new PersonaServer();
// Environment.addServer('user.env', personaServer);

// instantiate apps
Environment.addServer('targets.app', new Environment.WorkerServer({
	scriptUrl : '/grim/apps/debug/targets.js'
}));

// load client regions
Environment.addClientRegion(new Grim.ClientRegion('app-targets')).dispatchRequest('httpl://targets.app');