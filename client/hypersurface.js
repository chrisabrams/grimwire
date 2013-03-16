HyperSurface.Renderer.init();


// Env Behaviors
// =============
Environment.config.workerBootstrapUrl = '/local/lib/worker_bootstrap.js';

// request wrapper
Environment.setDispatchWrapper(function(request, origin, dispatch) {
	// allow request
	var response = dispatch(request);
	response.then(console.log.bind(console), request);
	response.except(console.log.bind(console), request);
	return response;
});

// dom update post-processor
Environment.setRegionPostProcessor(function(elem) {
});

// Init
// ====

// global navigators
// var apps = Link.navigator('httpl://app');
// var log = Link.navigator('httpl://v1.pfraze.log.util.app'); // :TODO: should be log.util.app

// instantiate environment servers
// Environment.addServer('app', new Grim.AppServer());
// Environment.addServer('scripts.env', new Grim.ScriptServer());
// Environment.addServer('localstorage.env', new Grim.LocalStorageServer());

var testStructure = new HyperSurface.Structure('test-structure');
Environment.addClientRegion(testStructure);

// :DEBUG:
var primitives = document.querySelectorAll('#scene > *');
for (var i=0; i < primitives.length; i++) {
	if (primitives[i].id)
		continue;
	var scene = HyperSurface.buildSceneFromDoc(primitives[i]);
	HyperSurface.Renderer.scene.add(scene);
}