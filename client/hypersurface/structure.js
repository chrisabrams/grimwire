HyperSurface = (typeof HyperSurface == 'undefined') ? {} : HyperSurface;
(function(exports) {
	var __id = 0;
	exports.genStructureId = function() { return 'structure-'+__id++; };

	// Structure
	// =========
	// EXPORTED
	// a tree of geometries with physical, chemical, and material properties
	function Structure(id) {
		Environment.ClientRegion.call(this, id);
		this.scene = buildSceneFromDoc(this.element);
		HyperSurface.Renderer.scene.add(this.scene);
	}
	Structure.prototype = Object.create(Environment.ClientRegion.prototype);

	Structure.prototype.__handleResponse = function(e, request, response) {
		response.headers = response.headers || {};

		var requestTarget = this.__chooseRequestTarget(e, request);
		var requestTargetClientRegion = Environment.getClientRegion(requestTarget.id) || this;

		if (requestTargetClientRegion) {
			var responseIsEmpty = (response.body === null || typeof response.body == 'undefined' || /^[\s\t\r\n]*$/.test(response.body));
			if (responseIsEmpty && (response.status == 200 || response.status >= 400))
				// destroy region if it's served blank html
				return requestTargetClientRegion.terminate();

			requestTargetClientRegion.__updateContext(request, response);
		}

		// non-render statuses
		switch (response.status) {
		case 204:
			// no content
			return;
		case 205:
			// reset form
			// :TODO: should this try to find a parent form to targetElem?
			if (targetElem.tagName === 'FORM') {
				targetElem.reset();
			}
			return;
		case 303:
			// dispatch for contents
			var request2 = { method:'get', url:response.headers.location, headers:{ accept:'text/html' }};
			this.dispatchRequest(targetElem, request2);
			return;
		}

		requestTargetClientRegion.renderResponseBody(requestTarget, response.body, response.headers['content-type']);
		Environment.postProcessRegion(requestTarget);
	};

	Structure.prototype.__chooseRequestTarget = function(e, request) {
		// output elements auto-target themselves
		if (e.target.tagName == 'OUTPUT' || (e.target.tagName == 'FORM' && e.target.dataset.output === 'true'))
			return e.target;

		if (!request.target) return this.element;
		
		// :TODO: new structure creation

		if (this.hasRights('element targeting'))
			// :TODO: constrain to elements within the structure
			return document.getElementById(request.target) || this.element;
		else
			return this.element;
	};

	Structure.prototype.renderResponseBody = function(targetElem, body, ctype) {
		// find the scene that corellates to the target document element
		var targetScene = this.scene;
		if (targetScene.name != targetElem.id)
			targetScene = this.geometry.getChildByName(targetElem.id, true);
		if (!targetScene)
			return console.log("FAILED to find scene for document element", targetElem, response, this);

		// remove old scene
		var parentScene = targetScene.parent || HyperSurface.Renderer.scene;
		parentScene.remove(targetScene);

		// parse the structure into nodes using the document api
		var hsml = '';
		if (body) {
			if (/text\/h(s|t)ml/.test(ctype)) {
				hsml = body.toString();
			} else {
				// escape non-hsml so that it can render correctly
				if (typeof body == 'string')
					hsml = body.replace(/</g, '&lt;').replace(/>/g, '&gt;');
				else
					hsml = JSON.stringify(body);
			}
		}
		targetElem.innerHTML = hsml;

		// create new scene
		var newScene = buildSceneFromDoc(targetElem);
		parentScene.add(newScene);
		if (targetScene.name == this.scene.name)
			this.scene = newScene;
	};

	function buildSceneFromDoc(elem) {
		// prepare styles
		// :DEBUG: hypersurface styles are stored as JSON in the "hsml-style" attribute
		var styles = setStyleFallbacks(elem, JSON.parse(elem.getAttribute('hsml-style') || '{}'));
		normalizeStyleUnits(elem, styles);

		// build geometry
		var geometry;
		if (elem.tagName == 'PLANE')
			geometry = new THREE.PlaneGeometry(+styles.width.v, +styles.height.v, +styles.segmentsX.v, +styles.segmentsY.v);
		else if (elem.tagName == 'CUBE')
			geometry = new THREE.CubeGeometry(+styles.width.v, +styles.height.v, +styles.depth.v, +styles.segmentsX.v, +styles.segmentsY.v, +styles.segmentsZ.v);
		else if (elem.tagName == 'CYLINDER')
			geometry = new THREE.CylinderGeometry(+styles.radiusTop.v, +styles.radiusBottom.v, +styles.height.v, +styles.segmentsX.v, +styles.segmentsY.v, false);
		else if (elem.tagName == 'SPHERE')
			geometry = new THREE.SphereGeometry(+styles.radius.v, +styles.segmentsX.v, +styles.segmentsY.v, false);
		else {
			console.log('FAILED to create unrecognized scene primitive', elem.tagName, elem);
			return null;
		}

		// build material
		var material = new THREE.MeshBasicMaterial({
			color:              +styles.materialColor.v,
			wireframe:           styles.wireframe.v,
			wireframeLinewidth: +styles.wireframeLinewidth.v,
			wireframeLinecap:    styles.wireframeLinecap.v,
			wireframeLinejoin:   styles.wireframeLinejoin.v
		});
		

		// build scene
		var scene = new THREE.Mesh(geometry, material);
		// :TODO: embed state

		scene.position = new THREE.Vector3(+styles.positionX.v, +styles.positionY.v, +styles.positionZ.v);
		scene.scale = new THREE.Vector3(+styles.scaleX.v, +styles.scaleY.v, +styles.scaleZ.v);
		var d = (new THREE.Vector3(+styles.directionX.v, +styles.directionY.v, +styles.directionZ.v)).add(scene.position);
		scene.lookAt(d);
		// based on Object3d.lookat
		// var m1 = new THREE.Matrix4();
		// var d = new THREE.Vector3(styles.directionX.v, styles.directionY.v, styles.directionZ.v);
		// m1.lookAt(new THREE.Vector3(0,0,0), d, scene.up);
		// if (scene.useQuaternion === true) { scene.quaternion.setFromRotationMatrix(m1); }
		// else { scene.rotation.setEulerFromRotationMatrix(m1, scene.eulerOrder); }

		return scene;
	}

	function setStyleFallbacks(elem, styles) {
		// dimensions
		switch (elem.tagName) {
			case 'CUBE':
				styles.depth = fallback(styles.depth, '1m');
			case 'PLANE':
				styles.width = fallback(styles.width, '1m');
				styles.height = fallback(styles.height, '1m');
				break;

			case 'CYLINDER':
				styles.radiusTop = fallback(styles.radiusTop, styles.radius, '1m');
				styles.radiusBottom = fallback(styles.radiusBottom, styles.radius, '1m');
				styles.height = fallback(styles.height, '1m');
				break;

			case 'SPHERE':
				styles.radius = fallback(styles.radius, '1m');
				break;
		}

		// segments
		// :TODO: move to node attributes?
		switch (elem.tagName) {
			case 'CUBE':
				styles.segmentsZ = fallback(styles.segmentsZ, 1);
			case 'PLANE':
				styles.segmentsX = fallback(styles.segmentsX, 1);
				styles.segmentsY = fallback(styles.segmentsY, 1);
				break;

			case 'CYLINDER':
				styles.segmentsX = fallback(styles.segmentsX, 8);
				styles.segmentsY = fallback(styles.segmentsY, 1);
				break;

			case 'SPHERE':
				styles.segmentsX = fallback(styles.segmentsX, 8);
				styles.segmentsY = fallback(styles.segmentsY, 6);
				break;
		}

		// position/direction/scale
		styles.positionX = fallback(styles.positionX, 0);
		styles.positionY = fallback(styles.positionY, 0);
		styles.positionZ = fallback(styles.positionZ, 0);
		styles.directionX = fallback(styles.directionX, 0);
		styles.directionY = fallback(styles.directionY, 0);
		styles.directionZ = fallback(styles.directionZ, 0);
		styles.scaleX = fallback(styles.scaleX, styles.scale, 1);
		styles.scaleY = fallback(styles.scaleY, styles.scale, 1);
		styles.scaleZ = fallback(styles.scaleZ, styles.scale, 1);

		// material
		styles.materialColor = fallback(styles.materialColor, 0xFFBB00);

		// wireframe
		styles.wireframe          = fallback(styles.wireframe,           false);
		styles.wireframeLinewidth = fallback(styles.wireframeLinewidth,  1);
		styles.wireframeLinecap   = fallback(styles.wireframeLinecap,    'round');
		styles.wireframeLinejoin  = fallback(styles.wireframeLinejoin,   'round');

		return styles;
	}
	function fallback() {
		for (var i=0,ii=arguments.length; i < ii; i++)
			if (typeof arguments[i] != 'undefined')
				return arguments[i];
		return undefined;
	}

	// strips units from style values after converting them to the base value for their type
	function normalizeStyleUnits(elem, styles) {
		for (var k in styles)
			styles[k] = normalizeStyleUnit(styles[k]);
	}
	var styleUnitRegex = /([\d\.\-]+)(m|Lm)/;
	var stylePrefixRegex = /\#(.*)/;
	function normalizeStyleUnit(style) {
		var match = styleUnitRegex.exec(style), value;
		if (match) {
			value = match[1];
			var units = match[2];

			if (units == 'm') // meters
				return { type:'m', v:+value };

			if (units == 'Lm') // log-meters
				return { type:'m', v:Math.pow(2,+value) };

			if (!units) {
				var num = +value;
				if (num == value) // convert to number, if possible
					return { type:false, v:num };
				return { type:false, v:value };
			}
		}
		match = stylePrefixRegex.exec(style);
		if (match) {
			value = match[1];
			return { type:'#', v:parseInt(value, 16) };
		}
		return { type:null, v:style };
	}

	exports.Structure = Structure;
})(HyperSurface);