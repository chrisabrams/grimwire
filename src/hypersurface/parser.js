HyperSurface = (typeof HyperSurface == 'undefined') ? {} : HyperSurface;
(function(exports) {

	// common math objects and some work-horses
	// (the workhorses are used to avoid object allocations)
	var Vector2s = {
		Zero: new THREE.Vector2(),
		One:  new THREE.Vector2(1,1),
		a:    new THREE.Vector2()
	};
	var Vector3s = {
		Zero:     new THREE.Vector3(),
		One:      new THREE.Vector3( 1, 1, 1),
		Up:       new THREE.Vector3( 0, 1, 0),
		Down:     new THREE.Vector3( 0,-1, 0),
		Left:     new THREE.Vector3(-1, 0, 0),
		Right:    new THREE.Vector3( 1, 0, 0),
		Forward:  new THREE.Vector3( 0, 0, 1),
		Backward: new THREE.Vector3( 0, 0,-1),
		a:        new THREE.Vector3()
	};
	var Matrix4s = {
		Ident: new THREE.Matrix4(),
		a: new THREE.Matrix4()
	};

	// fallback material when none is specified
	var defaultMaterial = new THREE.MeshBasicMaterial({ color:0xFF9900, side:THREE.DoubleSide });


	// parseDocument()
	// ===============
	var parserPrimitiveInstances = {};
	// reads a JSON doc using the given api description, produces a threejs scene
	exports.parseDocument = function(doc, APIDesc) {
		var DocumentAPI = HyperSurface.makeDocumentAPI(APIDesc);
		if (typeof doc == 'string')
			doc = JSON.parse(doc);
		return HyperSurface.parseDocumentNode(doc, doc, new DocumentAPI(), null);
	};
	exports.parseDocumentNode = function(node, doc, api, scene) {
		var t = node.primitive;
		if (!api.Primitives[t]) {
			console.error("Failed to find primitive parser for '"+t+"'", node);
			return null;
		}
		if (!parserPrimitiveInstances[t])
			parserPrimitiveInstances[t] = new (api.Primitives[t])();
		var parser = parserPrimitiveInstances[t];
		return parser.parse(node, doc, api, scene);
	};

	// this function takes an api description (HyperSurface.CoreAPI)
	// and produces a Document prototype
	exports.makeDocumentAPI = function(APIDesc) {
		var HSDocument = function(primitive, type, attr, styles) {
			this.primitive = primitive || 'Structure';
			this.type = type;
			this.attributes = attr || {};
			this.styles = styles || {};
			this.children = [];
		};
		HSDocument.prototype = extend(APIDesc.prototype);
		APIDesc.prototype.Primitives.forEach(function(Prim) {
			// getGeometryById, getMaterialById, etc
			HSDocument.prototype['get'+Prim.name+'ById'] = function(doc, id) {
				if (!id && id !== 0)
					return null;
				return doc['__'+Prim.name][id];
			};
			// storeGeometryById, storeMaterialById, etc
			HSDocument.prototype['store'+Prim.name+'ById'] = function(doc, id, obj) {
				if (!id && id !== 0)
					return;
				if (!doc['__'+Prim.name])
					doc['__'+Prim.name] = {};
				doc['__'+Prim.name][id] = obj;
			};
			// addGeometry, addMaterial, etc
			HSDocument.prototype['add'+Prim.name] = function(type, attr, styles) {
				var node = new HSDocument(Prim.name, type, attr, styles);
				this.children.push(node);
				return node;
			};
		});
		HSDocument.prototype.style = function(k, v) {
			if (typeof k == 'object') {
				for (var k2 in k) {
					this.style(k2, k[k2]);
				}
			} else
			this.styles[k] = v;
			return this;
		};
		HSDocument.prototype.attr = function(k, v) {
			if (typeof k == 'object') {
				for (var k2 in k) {
					this.attr(k2, k[k2]);
				}
			} else
			this.attributes[k] = v;
			return this;
		};
		// convert primitives to a map for faster lookup
		HSDocument.prototype.Primitives = {};
		APIDesc.prototype.Primitives.forEach(function(P) {
			HSDocument.prototype.Primitives[P.name] = P;
		});
		var converters = {};
		HSDocument.prototype.Units = {};
		APIDesc.prototype.Units.forEach(function(UnitSet) {
			for (var Unit in UnitSet) {
				converters[Unit] = UnitSet[Unit].convert;
				HSDocument.prototype.Units[Unit.toLowerCase()] = UnitSet[Unit].construct;
			}
		});
		HSDocument.prototype.convertUnit = function(value, targetUnits, defaultValue, parentValue) {
			var converter = typeof targetUnits == 'object' ? targetUnits.convert : converters[targetUnits];
			if (!converter)
				return defaultValue;
			value = converter(value, parentValue);
			if (typeof value == 'undefined' || (typeof value == 'number' && isNaN(value)))
				return defaultValue;
			return value;
		};
		HSDocument.prototype.toJSON = function() {
			return {
				primitive : this.primitive,
				type : this.type,
				attributes      : this.attributes,
				styles    : this.styles,
				children  : this.children
			};
		};
		return HSDocument;
	}


	// CoreAPI
	// =======
	// this describes the core hypersurface API
	exports.CoreAPI = function() {};
	exports.CoreAPI.prototype = {
		Primitives: [Structure, Geometry, Material, Surface, /*StyleClass,*/ Chemistry, Physics],
		Units: [MKS, CommonUnits, MaterialUnits, SysUnits]
	};

	// BasePrimitive
	// =============
	// the base type for the parsers
	function BasePrimitive() {}
	BasePrimitive.prototype = {
		name: undefined,
		parse: function(node, doc, api, parentScene) {},
		iterateChildren: function(node, doc, api, scene) {
			var children = [];
			for (var i=0, ii=node.children.length; i < ii; i++) {
				var child = HyperSurface.parseDocumentNode(node.children[i], doc, api, scene);
				if (child)
					children.push(child);
			}
			return children;
		},
		getStyle: function(node, api, parentScene, k) {
			return null;
		},
		getAttr: function(node, api, parentScene, k) {
			return null;
		}
	};



	// Core Primitives
	// ***************

	// Structure
	// =========
	function Structure() {}
	Structure.prototype = extend(BasePrimitive.prototype, {
		name: 'Structure',
		parse: function(node, doc, api, parentScene) {
			var scene = new THREE.Scene();
			this.iterateChildren(node, doc, api, scene);
			return scene;
		}
	});

	// Geometry
	// ========
	function Geometry() {}
	Geometry.prototype = extend(BasePrimitive.prototype, {
		name: 'Geometry',
		parse: function(node, doc, api, parentScene) {
			var geom = this.types[node.type].call(this, node, doc, api, parentScene);
			var material = api.getMaterialById(doc, node.material) || defaultMaterial;

			var mesh = new THREE.Mesh(geom, material);
			mesh.lookAt(this.getStyle(node, api, parentScene, 'direction'));
			mesh.position = this.getStyle(node, api, parentScene, 'position');
			mesh.scale = this.getStyle(node, api, parentScene, 'scale');

			parentScene.add(mesh);
			if (node.id)
				this.storeGeometryById(doc, node.id, mesh);

			this.iterateChildren(node, doc, api, mesh);

			return mesh;
		},
		types: {
			plane: function(node, doc, api, parentScene) {
				var dim = this.getStyle(node, api, parentScene, 'dimensions');
				var segments = this.getStyle(node, api, parentScene, 'segments');
				return new THREE.PlaneGeometry(dim.x, dim.y, segments.x, segments.y);
			},
			cube: function(node, doc, api, parentScene) {
				var dim = this.getStyle(node, api, parentScene, 'dimensions');
				var segments = this.getStyle(node, api, parentScene, 'segments');
				return new THREE.CubeGeometry(dim.x, dim.y, dim.z, segments.x, segments.y, segments.z);
			},
			cylinder: function(node, doc, api, parentScene) {
				var radTop = this.getStyle(node, api, parentScene, 'radiusTop');
				var radBottom = this.getStyle(node, api, parentScene, 'radiusBottom');
				var segments = this.getStyle(node, api, parentScene, 'segments');
				return new THREE.CylinderGeometry(radTop, radBottom, segments.x, segments.y);
			},
			sphere: function(node, doc, api, parentScene) {
				var rad = this.getStyle(node, api, parentScene, 'radius');
				var segments = this.getStyle(node, api, parentScene, 'segments');
				return new THREE.SphereGeometry(rad, segments.x, segments.y);
			}
		},
		getStyle: function(node, api, parentScene, k) {

			switch (k) {
				case 'position':
				return api.convertUnit(node.styles[k], MKS.Meters3, Vector3s.Zero);
				case 'direction':
				return api.convertUnit(node.styles[k], MKS.Meters3, Vector3s.Forward);
				case 'scale':
				case 'dimensions':
				var nMeters = (node.type == 'plane') ? MKS.Meters2 : MKS.Meters3;
				var nOne = (node.type == 'plane') ? Vector2s.One : Vector3s.One;
				return api.convertUnit(node.styles[k], nMeters, nOne);
				case 'segments':
				var nMeters = (node.type == 'cube') ? MKS.Meters3 : MKS.Meters2;
				var nOne = (node.type == 'cube') ? Vector3s.One : Vector2s.One;
				return api.convertUnit(node.styles[k], nMeters, nOne);
				case 'radius':
				return api.convertUnit(node.styles[k], MKS.Meters, 1);
				case 'radiusTop':
				case 'radiusBottom':
				if (node.styles[k])
					return api.convertUnit(node.styles[k], MKS.Meters, 1);
				return api.convertUnit(node.styles.radius, MKS.Meters, 1);
			}
			return BasePrimitive.prototype.getStyle.call(this, node, api, parentScene, k);
		}
	});

	// Surface
	// =======
	function Surface() {}
	Surface.prototype = extend(BasePrimitive.prototype, {
		name: 'Surface',
		parse: function(node, doc, api, parentScene) {
			var mesh = this.types[node.type].call(this, node, doc, api, parentScene);

			parentScene.add(mesh);
			if (node.id)
				this.storeSurfaceById(doc, node.id, mesh);

			this.iterateChildren(node, doc, api, mesh);

			return mesh;
		},
		types: {
			html: function(node, doc, api, parentScene) {
				var mesh = this.createPlane(node, doc, api, parentScene);
				mesh.userData.surface = {
					type    : 'html',
					content : this.getAttr(node, api, parentScene, 'content')
				};
				return mesh;
			}/*,
			link: function(node, doc, api, parentScene) {
				var mesh = this.createPlane(node, doc, api, parentScene);
				mesh.userData.surface = {
					type   : 'link',
					method : 'get',
					action : this.getAttr(node, api, parentScene, 'action'),
					target : this.getAttr(node, api, parentScene, 'target'),
					label  : this.getAttr(node, api, parentScene, 'label')
				};
				return mesh;
			},
			form: function(node, doc, api, parentScene) {
				var mesh = this.createPlane(node, doc, api, parentScene);
				mesh.userData.surface = {
					type   : 'form',
					method : this.getAttr(node, api, parentScene, 'method'),
					action : this.getAttr(node, api, parentScene, 'action'),
					target : this.getAttr(node, api, parentScene, 'target'),
					label  : this.getAttr(node, api, parentScene, 'label')
				};
				return mesh;
			}*/
		},
		createPlane: function(node, doc, api, parentScene) {
			var offset    = this.getStyle(node, api, parentScene, 'offset');
			var dim       = this.getStyle(node, api, parentScene, 'dimensions');
			var segments  = this.getStyle(node, api, parentScene, 'segments');

			var orient    = this.getAttr(node, api, parentScene, 'orient');
			var direction = this.getOrientDirVec(orient, parentScene);

			// orient the offset by our outward direction
			Matrix4s.a.identity();
			Matrix4s.a.lookAt(direction, Vector3s.Zero, Vector3s.Up);
			offset.applyMatrix4(Matrix4s.a);

			var geom;
			if (this.isFlat(orient, parentScene))
				geom = new THREE.PlaneGeometry(dim.x, dim.y, segments.x, segments.y);
			else
				// :TODO: will probably need to be a partial sphere or cylinder
			geom = new THREE.PlaneGeometry(dim.x, dim.y, segments.x, segments.y);
			
			var mesh = new THREE.Mesh(geom, api.getMaterialById(doc, node.material) || defaultMaterial);
			mesh.lookAt(direction);
			mesh.position = offset;

			return mesh;
		},
		getStyle: function(node, api, parentScene, k) {
			switch (k) {
				case 'dimensions':
				case 'segments':
				return api.convertUnit(node.styles[k], MKS.Meters2, Vector2s.One);
				case 'offset':
				return api.convertUnit(node.styles[k], MKS.Meters3, Vector3s.Up);
			}
			return BasePrimitive.prototype.getStyle.call(this, node, api, parentScene, k);
		},
		getAttr: function(node, api, parentScene, k) {
			switch (k) {
				case 'orient':
				return node.attributes.orient ? node.attributes.orient.toLowerCase() : 'front';
			}
			return BasePrimitive.prototype.getAttr.call(this, node, api, parentScene, k);
		},
		isFlat: function(orient, parentScene) {
			return true; // :TODO: cylinders and sphere 
		},
		getOrientDirVec: function(orient, parentScene) {
			if (parentScene instanceof THREE.Mesh) {
				if (parentScene.geometry instanceof THREE.CubeGeometry) {
					switch (orient) {
						case 'left':
						return Vector3s.Left;
						case 'right':
						return Vector3s.Right;
						case 'top':
						return Vector3s.Up;
						case 'bottom':
						return Vector3s.Down;
						case 'back':
						return Vector3s.Forward;
						case 'front':
						default:
						return Vector3s.Backward;
					}
				} else if (parentScene.geometry instanceof THREE.PlaneGeometry) {
					switch (orient) {
						case 'back':
						return Vector3s.Down;
						case 'front':
						default:
						return Vector3s.Up;
					}
				} else if (parentScene.geometry instanceof THREE.CylinderGeometry) {
					switch (orient) {
						case 'bottom':
						return Vector3s.Down;
						case 'top':
						return Vector3s.Up;
						case 'side':
						default:
						return Vector3s.Backward;
					}
				}
			}
			return Vector3s.Backward;
		}
	});

	// Material
	// ========
	function Material() {}
	Material.prototype = extend(BasePrimitive.prototype, {
		name: 'Material',
		parse: function(node, doc, api, parentScene) {
			var material = this.types[node.type].call(this, node, doc, api, parentScene);

			if (parentScene instanceof THREE.Mesh)
				parentScene.material = material;
			if (node.id)
				doc.storeMaterialById(doc, node.id, material);

			return material;
		},
		types: {
			basic: function(node, doc, api, parentScene) {
				var mapSource = this.getAttr(node, api, 'mapSource');
				var opacity = this.getStyle(node, api, parentScene, 'opacity');
				var mat = new THREE.MeshBasicMaterial({
					color              : this.getStyle(node, api, parentScene, 'color'),
					opacity            : opacity,
					transparent        : (opacity < 1),
					blending           : this.getStyle(node, api, parentScene, 'blending'),
					side               : this.getStyle(node, api, parentScene, 'side'),

					wireframe          : this.getStyle(node, api, parentScene, 'wireframe'),
					wireframeLinewidth : this.getStyle(node, api, parentScene, 'wireframeLinewidth'),
					wireframeLinecap   : this.getStyle(node, api, parentScene, 'wireframeLinecap'),
					wireframeLinejoin  : this.getStyle(node, api, parentScene, 'wireframeLinejoin'),

					map                : (mapSource) ? THREE.ImageUtils.loadTexture(mapSource) : null
				});
				if (mat.map) {
					mat.map.minFilter = this.getAttr(node, api, parentScene, 'minFilter');
					mat.map.magFilter = this.getAttr(node, api, parentScene, 'magFilter');
				}
				return mat;
			}
		},
		getStyle: function(node, api, parentScene, k) {
			switch (k) {
				case 'color':
				return api.convertUnit(node.styles[k], CommonUnits.Hex, 0xFF9900);
				case 'opacity':
				return +node.styles[k] || 1;
				case 'blending':
				return node.styles.blending || 'no';
				case 'side':
				return api.convertUnit(node.styles[k], MaterialUnits.MaterialSide, 'front');
				case 'wireframe':
				return !!node.styles.wireframe || false;
				case 'wireframeLinewidth':
				return api.convertUnit(node.styles[k], MKS.Meters, 1);
				case 'wireframeLinecap':
				case 'wireframeLinejoin':
				return api.convertUnit(node.styles[k], MaterialUnits.WireframeLine, 'round');
			}
			return BasePrimitive.prototype.getStyle.call(this, node, api, k);
		},
		getAttr: function(node, api, parentScene, k) {
			switch (k) {
				case 'mapSource':
				return api.convertUnit(node.attributes[k], SysUnits.Url, null);
				case 'minFilter':
				case 'magFilter':
				return api.convertUnit(node.attributess[k], MaterialUnits.MaterialFilter, 'linear');
			}
			return BasePrimitive.prototype.getAttr.call(this, node, api, k);
		}
	});

	// Chemistry
	// ========
	function Chemistry() {}
	Chemistry.prototype = extend(BasePrimitive.prototype, {
		name: 'Chemistry',
		parse: function(node, doc, api, parentScene) {
			if (parentScene instanceof THREE.Mesh) {
				parentScene.userData.chemistry =  parentScene.userData.chemistry || { reactions:[] };
				parentScene.userData.chemistry.reactions.push(node);
			}
			return parentScene;
		}
	});

	// Physics
	// ========
	function Physics() {}
	Physics.prototype = extend(BasePrimitive.prototype, {
		name: 'Physics',
		parse: function(node, doc, api, parentScene) {
			if (parentScene instanceof THREE.Mesh) {
				parentScene.userData.physics =  parentScene.userData.physics || { forces:[] };
				parentScene.userData.physics.forces.push(node);
			}
			return parentScene;
		}
	});


	// Core Units
	// **********


	// MKS
	// ========
	var MKS = {
		Meters: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.x;
				return +v;
			},
			construct: function(x) {
				return { __unit:'Meters', x:+x };
			}
		},
		Meters2: {
			convert: function(v) {
				if (!v)
					return undefined;
				if (Array.isArray(v))
					return new THREE.Vector2(v[0], v[1]);
				if (v instanceof THREE.Vector2)
					return v;
				if (typeof v == 'string') {
					try {
						v = JSON.parse(v);
					} catch(e) {
						try {
							v = JSON.parse('['+v+']'); // in case it's given as "1,2"
						} catch (e2) {
							return undefined;
						}
					}
				}
				if (typeof v == 'object')
					return new THREE.Vector2(v.x, v.y);
				if (typeof v == 'number')
					return new THREE.Vector2(v, v);
				return undefined;
			},
			construct: function(x, y) {
				return { __unit:'Meters2', x:+x, y:+y };
			}
		},
		Meters3: {
			convert: function(v) {
				if (!v)
					return undefined;
				if (v instanceof THREE.Vector3)
					return v;
				if (typeof v == 'string') {
					try {
						v = JSON.parse(v);
					} catch(e) {
						try {
							v = JSON.parse('['+v+']'); // in case it's given as "1,2,3"
						} catch (e2) {
							return undefined;
						}
					}
				}
				if (Array.isArray(v))
					return new THREE.Vector3(v[0], v[1], v[2]);
				if (typeof v == 'object')
					return new THREE.Vector3(v.x, v.y, v.z);
				if (typeof v == 'number')
					return new THREE.Vector3(v, v, v);
				return undefined;
			},
			construct: function(x, y, z) {
				return { __unit:'Meters3', x:+x, y:+y, z:+z };
			}
		},
		LogMeters: {
			convert: function(v) {
				return Math.pow(2, MKS.Meters.to(v));
			},
			construct: function(x) {
				return { __unit:'LogMeters', x:+x };
			}
		},
		LogMeters2: {
			convert: function(v) {
				v = MKS.Meters2.to(v);
				if (v) {
					v.x = Math.pow(2, v.x);
					v.y = Math.pow(2, v.y);
				}
				return v;
			},
			construct: function(x, y) {
				return { __unit:'LogMeters2', x:+x, y:+y };
			}
		},
		LogMeters3: {
			convert: function(v) {
				v = MKS.Meters3.to(v);
				if (v) {
					v.x = Math.pow(2, v.x);
					v.y = Math.pow(2, v.y);
					v.z = Math.pow(2, v.z);
				}
				return v;
			},
			construct: function(x, y, z) {
				return { __unit:'LogMeters3', x:+x, y:+y, z:+z };
			}
		},
		KiloGrams: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				return +v;
			},
			construct: function(v) {
				return { __unit:'KiloGrams', v:+v };
			}
		},
		Seconds: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				return +v;
			},
			construct: function(v) {
				return { __unit:'Seconds', v:+v };
			}
		},
		Minutes: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				return (+v*60);
			},
			construct: function(v) {
				return { __unit:'Minutes', v:+v };
			}
		},
		Hours: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				return (+v*60*60);
			},
			construct: function(v) {
				return { __unit:'Hours', v:+v };
			}
		}
	};

	var CommonUnits = {
		Hex: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				if (typeof v == 'string') {
					if (v.charAt(0) == '#') v = v.slice(1);
					return parseInt(v, 16);
				}
				return +v;
			},
			construct: function(v) {
				return { __unit:'Hex', v:+v };
			}
		},
		RGB: {
			convert: function(v) {
				if (!v)
					return undefined;
				if (typeof v == 'number')
					return v;
				if (typeof v == 'string') {
					try {
						v = JSON.parse(v);
					} catch(e) {
						try {
							v = JSON.parse('['+v+']'); // in case it's given as "1,2,3"
						} catch (e2) {
							return undefined;
						}
					}
				}
				if (Array.isArray(v))
					return (+v[0]) * 65536 + (+v[1]) * 256 + (+v[2]);
				if (typeof v == 'object')
					return (+v.r) * 65536 + (+v.g) * 256 + (+v.b);
				if (typeof v == 'number')
					return v;
				return undefined;
			},
			construct: function(r, g, b) {
				return { __unit:'RGB', r:+r, g:+g, b:+b };
			}
		},
		Percent: {
			convert: function(v, pV) {
				if (v && typeof v == 'object')
					v = +v.v;
				v = +v;
				if ((!v && v !== 0) || (!pV && pV !== 0))
					return undefined;

				if (pV instanceof THREE.Vector3)
					return new THREE.Vector3(v * pV.x, v * pV.y, v * pV.z);
				if (pV instanceof THREE.Vector2)
					return new THREE.Vector2(v * pV.x, v * pV.y);
				if (Array.isArray(pV))
					return pV.map(function(pVv) { return v * pVv;});
				if (typeof pV == 'number')
					return pV * v;
				return undefined;
			},
			construct: function(v) {
				return { __unit:'Percent', v:+v };
			}
		}
	};

	var MaterialUnits = {
		// these are all just used to validate, not going to bother with constructors
		MaterialSide: {
			convert: function(v) {
				switch(v) {
					case 'front':
					return THREE.FrontSide;
					case 'back':
					return THREE.BackSide;
					case 'double':
					return THREE.DoubleSide;
				}
				return undefined;
			}
		},
		WireframeLinecap: {
			convert: function(v) {
				switch (v) {
					case 'butt':
					case 'round':
					case 'square':
					return v;
				}
				return undefined;
			}
		},
		WireframeLinejoin: {
			convert: function(v) {
				switch (v) {
					case 'round':
					case 'bevel':
					case 'miter':
					return v;
				}
				return undefined;
			}
		},
		MaterialFilter: {
			convert: function(v) {
				switch (v) {
					case 'nearest':
					return THREE.NearestFilter;
					case 'nearest-mm-nearest-filter':
					return THREE.NearestMipMapNearestFilter;
					case 'nearest-mm-linear-filter':
					return THREE.NearestMipMapLinearFilter;
					case 'linear':
					return THREE.LinearFilter;
					case 'linear-mm-nearest-filter':
					return THREE.LinearMipMapNearestFilter;
					case 'linear-mm-linear-filter':
					return THREE.LinearMipMapLinearFilter;
				}
				return undefined;
			}
		}
	};

	var SysUnits = {
		Url: {
			convert: function(v) {
				if (v && typeof v == 'object')
					v = v.v;
				// :TODO: relative URLs?
				if (typeof v == 'string')
					return v;
				return undefined;
			},
			construct: function(v) {
				return { __unit:'Url', v:v };
			}
		}
	};


	function extend(prototype, obj) {
		var p = Object.create(prototype);
		for (var k in obj)
			p[k] = obj[k];
		return p;
	}
})(HyperSurface);