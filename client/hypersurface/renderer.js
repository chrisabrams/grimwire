HyperSurface = (typeof HyperSurface == 'undefined') ? {} : HyperSurface;
HyperSurface.Renderer = (typeof HyperSurface.Renderer == 'undefined') ? {} : HyperSurface.Renderer;
(function(exports) {

	// Renderer
	// ========
	// EXPORTED
	// renders the document into a 3d representation

	var renderer;
	var scene, camera;

	exports.init = function() {
		// initialize WebGL canvas
		renderer = new THREE.WebGLRenderer();
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);
		window.addEventListener('resize', onWindowResize, false);

		// initialize scene
		exports.scene = scene = new THREE.Scene();
		exports.camera = camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
		camera.position.z = 5;

		// kick off rendering
		tick();
	};

	function tick() {
		tickUI();
		tickPhysics();
		renderer.render(scene, camera);
		requestAnimationFrame(tick);
	}

	function tickUI() {
		var timer = Date.now() * 0.0005;
		camera.position.x = Math.cos( timer ) * 5;
		camera.position.z = Math.sin( timer ) * 5;
		camera.lookAt(scene.position);
	}

	function tickPhysics() {
		// :TODO:
		// also, in the renderer?
	}

	function onWindowResize() {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();

		renderer.setSize( window.innerWidth, window.innerHeight );
	}
	

})(HyperSurface.Renderer);