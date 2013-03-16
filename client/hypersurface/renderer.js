HyperSurface = (typeof HyperSurface == 'undefined') ? {} : HyperSurface;
HyperSurface.Renderer = (typeof HyperSurface.Renderer == 'undefined') ? {} : HyperSurface.Renderer;
(function(exports) {

	// Renderer
	// ========
	// EXPORTED
	// renders the document into a 3d representation

	var renderer;
	var scene, camera;
	var statsFPS, statsMS;

	exports.init = function() {
		// initialize WebGL canvas
		renderer = new THREE.WebGLRenderer();
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);
		window.addEventListener('resize', onWindowResize, false);

		// initialize stats uis
		statsFPS = new Stats();
		statsFPS.domElement.style.position = 'absolute';
		statsFPS.domElement.style.top = '0px';
		document.body.appendChild(statsFPS.domElement);
		statsMS = new Stats();
		statsMS.setMode(1);
		statsMS.domElement.style.position = 'absolute';
		statsMS.domElement.style.top = '0px';
		statsMS.domElement.style.left = '80px';
		document.body.appendChild(statsMS.domElement);

		// initialize scene
		exports.scene = scene = new THREE.Scene();
		exports.camera = camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);
		camera.position.z = 1.75;

		// kick off rendering
		tick();
	};

	function tick() {
		tickUI();
		tickPhysics();
		renderer.render(scene, camera);
		requestAnimationFrame(tick);
		statsFPS.update(); statsMS.update();
	}

	function tickUI() {
		var timer = Date.now() * 0.0005;
		camera.position.x = Math.cos( timer ) * 2;
		camera.position.y = Math.sin( timer );
		camera.position.z = Math.sin( timer ) * 2;
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