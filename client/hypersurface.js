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

/*var testStructure = new HyperSurface.Structure('test-structure');
Environment.addClientRegion(testStructure);

// :DEBUG:
var primitives = document.querySelectorAll('#scene > *');
for (var i=0; i < primitives.length; i++) {
	if (primitives[i].id)
		continue;
	var scene = HyperSurface.buildSceneFromDoc(primitives[i]);
	HyperSurface.Renderer.scene.add(scene);
}*/

/*Environment.addServer('scene.dbg', new Environment.WorkerServer({ scriptUrl:'/hypersurface/scene.dbg.js' }));
Link.dispatch({ method:'get', url:'httpl://hypersurface.dbg', headers: { accept:'application/threejs.scene+json'}})
	.then(function(res) {
		var sceneLoader = new THREE.SceneLoader();
		sceneLoader.parse(res.body, function(result) {
			HyperSurface.Renderer.scene.add(result.scene);
		}, 'httpl://scene.dbg/');
	})
	.except(console.log.bind(console));*/

var HSDocument = HyperSurface.makeDocumentAPI(HyperSurface.CoreAPI);

var doc = new HSDocument();
var cube = doc.addGeometry('cube');
cube.addMaterial('basic').style({ wireframe:true, color:0x3299BB });
cube.addGeometry('sphere').style({ segments:[10,10], radius:0.5 })
    .addMaterial('basic').style({ color:0xE9E9E9 });

var someHTML = '<h1>Hello World</h1>';
cube.addSurface('html', { orient:'top' }, { offset:[0,0,0.75] });
cube.addSurface('html', { orient:'bottom' }, { offset:[0,0,0.75] });
cube.addSurface('html', { orient:'left' }, { offset:[0,0,0.75] });
cube.addSurface('html', { orient:'right' }, { offset:[0,0,0.75] });
cube.addSurface('html', { orient:'front' }, { offset:[0,0,0.75] });
cube.addSurface('html', { orient:'back' }, { offset:[0,0,0.75] });
console.log(doc);
var docJson = JSON.stringify(doc);

HyperSurface.Renderer.scene.add(HyperSurface.parseDocument(docJson, HyperSurface.CoreAPI));
