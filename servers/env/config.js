// ConfigServer
// ============
// serves HTML for navigation

function ConfigServer() {
	Environment.Server.call(this);
	this.schemas = {};
	this.values = {};
	this.validators = {};
	this.broadcasters = {};

	var loc = window.location.pathname;
	if (loc == '/') loc = '/index.html';
	this.configNamespace = 'config'+(loc.replace(/\/|\./g,'_'));
}
ConfigServer.prototype = Object.create(Environment.Server.prototype);

// request router
ConfigServer.prototype.handleHttpRequest = function(request, response) {
	var self = this;
	var router = Link.router(request);
	var respond = Link.responder(response);
	router.pm('/',                              /HEAD|GET/i, this.handler('getConfigInterface', request, respond));
	router.pm('/values',                        /HEAD|GET/i, this.handler('getValuesCollection', request, respond));
	router.pm('/schemas',                       /HEAD|GET/i, this.handler('getSchemasCollection', request, respond));
	router.pm('/validators',                    /HEAD|GET/i, this.handler('getValidatorsCollection', request, respond));
	router.pmt('/validators',                   /POST/i, /json|form/, this.handler('addValidators', request, respond));
	router.pm(RegExp('^/values/(.*)','i'),      /HEAD|GET/i, this.handler('getValuesItem', request, respond));
	router.pm(RegExp('^/schemas/(.*)','i'),     /HEAD|GET/i, this.handler('getSchemasItem', request, respond));
	router.pm(RegExp('^/validators/(.*)','i'),  /HEAD|GET/i, this.handler('getValidatorsItem', request, respond));
	router.pmt(RegExp('^/values/(.*)','i'),     /PUT|PATCH/i, /json|form/, this.handler('setValuesItem', request, respond));
	router.pmt(RegExp('^/schemas/(.*)','i'),    /PUT|PATCH/i, /json|form/, this.handler('setSchemasItem', request, respond));
	router.pmt(RegExp('^/validators/(.*)','i'), /PUT|PATCH/i, /json|form|text/, this.handler('setValidatorsItem', request, respond));
	router.error(response);
};

ConfigServer.prototype.handler = function(handlerName, request, respond) {
	var self = this;
	var handler = this[handlerName];
	return function(match) { handler.call(self, request, respond, match); };
};

ConfigServer.prototype.getConfigInterface = function(request, respond) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'self current');
	headerer.addLink('/values', 'collection', { title:'values' });
	headerer.addLink('/schemas', 'collection', { title:'schemas' });
	headerer.addLink('/validators', 'collection', { title:'validators' });

	if (/GET/i.test(request.method)) {
		if (/html/.test(request.headers.accept)) {
			// respond with interface
			var self = this;
			var serve = function() {
				respond.ok('html', headerer).end(self.buildConfigInterfaceHTML(request.query.section));
			};
			this.readFromStorage().then(serve, serve);
		} else {
			// respond with data
			respond.ok('json', headerer).end({ schemaItems:Object.keys(this.schemas), valueItems:Object.keys(this.values) });
		}
	} else {
		// respond with headers
		respond.ok(null, headerer).end();
	}
};

function buildControl(formKey, controlKey, schema, value) {
	var k = formKey, l = controlKey;
	switch (schema.control) {
		case 'textarea':
			return ['<textarea id="',k+'-'+l,'"',' name="',l,'" class="input-xxlarge" rows="5" ',(schema.readonly)?'disabled':'','>',value,'</textarea>'].join('');
		default:
			return ['<input type="text" id="',k+'-'+l,'"',' name="',l,'" value="',value,'" class="input-xxlarge" />'].join('');
	}
}

ConfigServer.prototype.buildConfigInterfaceHTML = function(section, opts) {
	opts = opts || {};
	var html = [];
	for (var k in this.values) {
		if (section && section != k)
			continue;

		opts[k] = opts[k] || {};
		var errors = opts[k].errors || {};
		var fieldsHtml = [];

		for (var l in this.schemas[k]) {
			fieldsHtml.push([
				'<div class="control-group ',(l in errors) ? 'error' : '','">',
					'<label class="control-label" for="',k+'-'+l,'">',this.schemas[k][l].label,'</label>',
					'<div class="controls">',
						buildControl(k, l, this.schemas[k][l], this.values[k][l]),
						(l in errors) ? ' <span class="help-inline">'+errors[l]+'</span>' : '',
					'</div>',
				'</div>'
			].join(''));
		}
		html.push([
			'<form id="',k,'" class="form-horizontal" target="',k,'" action="httpl://',this.config.domain,'/values/'+k+'" method="put">',
				'<legend>',toTitleCase(k),'</legend>',
				(opts[k].message) ? '<div class="alert alert-success" data-lifespan="5">'+opts[k].message+'</div>' : '',
				fieldsHtml.join(''),
				'<input type="submit" class="btn" />',
			'</form>'
		].join(''));
	}
	return html.join('');
};


// Values Handlers
// ===============

ConfigServer.prototype.getValuesCollection = function(request, respond) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/values', 'self');
	headerer.addLink('/values/{title}', 'item');
	for (var k in this.values) {
		headerer.addLink('/values/'+k, 'item', { title:k });
	}

	if (/GET/i.test(request.method)) {
		// respond with data
		respond.ok('json', headerer).end({ items:Object.keys(this.values) });
	} else {
		// respond with headers
		respond.ok(null, headerer).end();
	}
};

ConfigServer.prototype.getValuesItem = function(request, respond, match) {
	var self = this;
	var key = match.path[1];
	var serve = function() {
		var headerer = Link.headerer();
		headerer.addLink('/values', 'up collection');
		headerer.addLink('/values/'+key, 'self');

		if (/event-stream/.test(request.headers.accept)) {
			respond.ok('event-stream', headerer);
			self.broadcasters[key] = self.broadcasters[key] || Link.broadcaster();
			self.broadcasters[key].addStream(respond.response);
			return;
		}

		if (!(key in self.values))
			return respond.noContent().end(); // do no content so they can navigate to the key before it exists
		respond.ok('json').end(self.values[key]);
	};
	this.readFromStorage(key).then(serve, serve);
};

ConfigServer.prototype.setValuesItem = function(request, respond, match) {
	var key = match.path[1];
	var values = request.body;
	if (!values)
		return respond.badRequest().end('No request body was provided');

	var schema = this.schemas[key];
	if (!schema)
		return respond.failedDependency().end('No schema was found for the value collection');

	// run validation
	var errors = {};
	for (var k in values) {
		var valueSchema = schema[k];
		if (!valueSchema) {
			errors[k] = 'Not a valid attribute in the schema';
			continue;
		}
		var validator = this.validators[valueSchema.type];
		if (!validator) {
			errors[k] = 'Schema misconfigure: "'+valueSchema.type+'" type is not a registered validator';
			continue;
		}
		if (RegExp(validator,'i').test(''+values[k]) === false) {
			errors[k] = 'Invalid '+valueSchema.type;
			continue;
		}
	}
	if (Object.keys(errors).length !== 0) {
		if (/html/.test(request.headers.accept)) {
			var opts = {};
			opts[key] = { errors:errors };
			return respond.ok('html').end(this.buildConfigInterfaceHTML(opts));
		}
		return respond.badRequest().end(errors);
	}

	if (/PUT/i.test(request.method)) {
		// set any undefined values to their fallback
		for (var k in schema) {
			if (typeof values[k] == 'undefined')
				values[k] = schema[k].fallback;
		}
		// overwrite
		this.values[key] = values;
	} else {
		// update
		this.values[key] = this.values[key] || {};
		for (var k in values)
			this.values[key][k] = values[k];
	}
	this.writeToStorage(key);
	if (key in this.broadcasters)
		this.broadcasters[key].emit('update');

	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/values', 'up collection');
	headerer.addLink('/values/'+key, 'self');
	if (/html/.test(request.headers.accept)) {
		var opts = {};
		opts[key] = { message:'Updated' };
		return respond.ok('html').end(this.buildConfigInterfaceHTML(key, opts));
	}
	respond.ok().end();
};


// Schemas Handlers
// ================

ConfigServer.prototype.getSchemasCollection = function(request, respond) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/schemas', 'self');
	headerer.addLink('/schemas/{title}', 'item');
	for (var k in this.schemas)
		headerer.addLink('/schemas/'+k, 'item', { title:k });

	if (/GET/i.test(request.method)) {
		// respond with data
		respond.ok('json', headerer).end({ items:Object.keys(this.schemas) });
	} else {
		// respond with headers
		respond.ok(null, headerer).end();
	}
};

ConfigServer.prototype.getSchemasItem = function(request, respond, match) {
	var key = match.path[1];
	var schema = this.schemas[key];

	var headerer = Link.headerer();
	headerer.addLink('/schemas', 'up collection');
	headerer.addLink('/schemas/'+key, 'self');
	if (!schema)
		return respond.noContent().end();
	respond.ok('json').end(schema);
};

ConfigServer.prototype.setSchemasItem = function(request, respond, match) {
	var key = match.path[1];
	var schema = request.body;
	if (!schema)
		return respond.badRequest().end('No request body was provided');

	// run validation
	var errors = {};
	for (var k in schema) {
		var item = schema[k];
		if (!item.type || !(item.type in this.validators)) {
			errors[k] = 'Invalid type "'+item.type+'"';
			continue;
		}
		if (!item.label) {
			errors[k] = '`label` is required';
			continue;
		}
		if (typeof item.fallback == 'undefined') {
			errors[k] = '`fallback` is required';
			continue;
		}
	}
	if (Object.keys(errors).length !== 0)
		return respond.badRequest().end(errors);

	if (/PUT/i.test(request.method)) {
		// overwrite
		this.schemas[key] = schema;
	} else {
		// update
		this.schemas[key] = this.schemas[key] || {};
		for (var k in schema)
			this.schemas[key][k] = schema[k];
	}

	// fill in any values that have been added
	this.values[key] = this.values[key] || {};
	for (var k in schema) {
		if (!this.values[key][k])
			this.values[key][k] = this.schemas[key][k].fallback;
	}

	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/schemas', 'up collection');
	headerer.addLink('/schemas/'+key, 'self');
	respond.ok().end();
};


// Validators Handlers
// ===================

ConfigServer.prototype.getValidatorsCollection = function(request, respond) {
	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/validators', 'self');
	headerer.addLink('/validators/{title}', 'item');
	for (var k in this.validators)
		headerer.addLink('/validators/'+k, 'item', { title:k });

	if (/GET/i.test(request.method)) {
		// respond with data
		respond.ok('json', headerer).end({ items:Object.keys(this.validators) });
	} else {
		// respond with headers
		respond.ok(null, headerer).end();
	}
};

ConfigServer.prototype.addValidators = function(request, respond) {
	var validators = request.body;
	if (!validators || typeof validators != 'object')
		return respond.badRequest().end('Validators must be provided as a json of {validatorN:<str>,...} form');

	for (var k in validators) {
		if (typeof validators[k] == 'string')
			this.validators[k] = validators[k];
	}

	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/', 'up');
	headerer.addLink('/validators', 'self');
	headerer.addLink('/validators/{title}', 'item');
	for (var k in this.validators)
		headerer.addLink('/validators/'+k, 'item', { title:k });
	respond.ok().end();
};

ConfigServer.prototype.getValidatorsItem = function(request, respond, match) {
	var key = match.path[1];
	var validator = this.validators[key];

	var headerer = Link.headerer();
	headerer.addLink('/validators', 'up collection');
	headerer.addLink('/validators/'+key, 'self');
	if (!validator)
		return respond.noContent().end();
	respond.ok('json').end(schema);
};

ConfigServer.prototype.setValidatorsItem = function(request, respond, match) {
	var key = match.path[1];
	var validator = request.body;
	if (validator && typeof validator == 'object')
		validator = validator.regex;
	if (!validator || typeof validator != 'string')
		return respond.badRequest().end('Validator must be provided as a string or json of {regex:<str>} form');

	this.validators[key] = validator;

	// build headers
	var headerer = Link.headerer();
	headerer.addLink('/validators', 'up collection');
	headerer.addLink('/validators/'+key, 'self');
	respond.ok().end();
};

ConfigServer.prototype.getStorageService = function() {
	try {
		if (this.values.servers.storage)
			return Link.navigator(this.values.servers.storage);
	} catch(e) {}
	return null;
};

ConfigServer.prototype.writeToStorage = function(key) {
	var backend = this.getStorageService();
	if (!backend)
		return;
	var values = JSON.parse(JSON.stringify(this.values[key]));
	values.id = key;
	backend.collection(this.configNamespace).post(values, 'application/json');
};

ConfigServer.prototype.readFromStorage = function(key) {
	var backend = this.getStorageService();
	if (!backend)
		return Local.promise(true);

	if (!key) {
		var p = Local.promise();
		for (var k in this.schemas) {
			var p2 = this.readFromStorage(k);
			p2.chain(p);
			p = p2;
		}
		return p;
	}

	var self = this;
	var req = backend.collection(this.configNamespace).item(key).getJson();
	req.then(function(res) {
		self.values[key] = res.body;
	});
	return req;
};

// http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
function toTitleCase(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}