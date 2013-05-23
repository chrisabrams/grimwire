// mail.json : inbox.js
// ====================
// Main mailing interface
// pfraze 2013

var config = local.worker.config;
var isConfigNeeded = !config.usr.mailhostUrl && !config.usr.username && !config.usr.password;

var templates = {
	layout: makeTemplateFn('templates/layout.html'),
	messages: makeTemplateFn('templates/messages.html'),
	messagesItem: makeTemplateFn('templates/messages-item.html'),
	compose: makeTemplateFn('templates/compose.html'),
	contacts: makeTemplateFn('templates/contacts.html'),
	configure: makeTemplateFn('templates/configure.html')
};

function main(request, response) {
	if (request.method == 'GET' && isConfigNeeded) {
		var message = '<div class="alert alert-info"><strong>Setup Required!</strong><br/>'+
			'Before I can find your email, I need to to know where your host is.</div>';
		return serveConfig(request, response, message, (request.path != '/.grim/config'));
	}

	if (/HEAD|GET/.test(request.method) && request.path == '/')
		return serveLayout(request, response);

	if (/HEAD|GET/.test(request.method) && request.path == '/messages')
		return serveMessages(request, response);

	if (/HEAD|GET/.test(request.method) && request.path == '/messages/.new')
		return serveCompose(request, response);

	if (request.path == '/.grim/config')
		return serveConfig(request, response);

	response.writeHead(404, 'not found').end();
}

function serveLayout(request, response) {
	response.setHeader('link', [
		{ rel:'self', href:'/' },
		{ rel:'collection', href:'/messages', title:'messages' },
		{ rel:'collection', href:'/contacts', title:'contacts' },
		{ rel:'http://grimwire.com/rel/transform', href:'/messages/.new{?title,subject,content,href}', title:'Email' }
	]);
	respond(request, response, { html: templates.layout() });
}

function serveMessages(request, response) {
	response.setHeader('link', [
		{ rel:'up via', href:'/' },
		{ rel:'self', href:'/messages' },
		{ rel:'item', href:'/messages/.new', title:'.new' }
	]);
	var messages = [{from:'Paul Frazee', subject:'Foobar', date:'May 19', time:'7:23pm', href:'#'}];
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);
	messages.push(messages[0]);

	respond(request, response, {
		html: templates.messages({
			messages: messages.map(templates.messagesItem).join('<hr style="margin: 0.5em 0 1em" />')
		})
	});
}

function serveCompose(request, response) {
	response.setHeader('link', [
		{ rel:'via', href:'/' },
		{ rel:'up collection', href:'/messages' },
		{ rel:'self', href:'/messages/.new' }
	]);

	var content = '';
	if (request.query.href)
		content += request.query.href+"\n\n";
	if (request.query.content)
		content += quoteContent(request.query.content);

	respond(request, response, {
		html: templates.compose({
			recp: (request.query.recp || ''),
			subject: (request.query.subject || request.query.title || ''),
			content: content
		})
	});
}

function serveConfig(request, response, message, redirectAfter) {
	redirectAfter = (redirectAfter || request.query.redirectAfter == '1') ? 1 : 0;
	var body = {}, errors = {};
	if (request.method == 'POST') {
		// validate
		if (!request.body) errors._error = 'Request body required';
		else {
			body = request.body;
			if (!request.body.mailhostUrl) errors.mailhostUrl = 'Required.';
			if (!request.body.username) errors.username = 'Required.';
			if (!request.body.password) errors.password = 'Required.';
		}

		if (Object.keys(errors).length === 0) {
			// manual update to allow us to stay alive
			config.usr = {
				mailhostUrl: body.mailhostUrl,
				username: body.username,
				password: body.password
			};
			isConfigNeeded = false;

			// update stored config
			local.http.dispatch({
				method: 'put',
				url: 'httpl://config.env/workers/'+config.domain,
				query: { noreload: true }, // we updated ourselves, kthx
				body: config.usr,
				headers: { 'content-type':'application/json' }
			});

			if (redirectAfter) {
				response.writeHead(302, 'redirect', { location: 'httpl://'+config.domain }).end();
				return;
			}
			message = '<div class="alert alert-success" data-lifespan="5">Updated.</div>';
		} else
			message = '<div class="alert alert-error">There were errors in the form you submitted.</div>';
	}

	respond(request, response, {
		html: templates.configure({
			redirectAfter: redirectAfter,
			message: message,
			errors: makeErrorHtml(errors),
			mailhostUrl: body.mailhostUrl || config.usr.mailhostUrl,
			username: body.username || config.usr.username,
			password: body.password || config.usr.password
		})
	});
}

// helpers
// -

function quoteContent(content) {
	return content.replace(/(.{80})\s/g, "$1\n").replace(/^([^\n])/mg, '> $1');
}

function respond(request, response, content) {
	if (request.method == 'HEAD') {
		response.writeHead(200, 'ok').end();
		return;
	}
	if (/text\/html/.test(request.headers.accept) && content.html) {
		response.setHeader('content-type', 'text/html');
		response.writeHead(200, 'ok').end(content.html);
	} else
		response.writeHead(406, 'bad accept').end();
}

// templating
// -

function makeTemplateFn(path) {
	var template = require(path);
	return function(context) {
		if (!context)
			context = {};
		context.domain = config.domain;
		var html = expandTokens(template, context);
		return html.replace(/\{\{.*\}\}/g, ''); // clear out any unreplaced tokens
	};
}

function expandTokens(html, context, namespace) {
	if (!namespace) namespace = '';
	for (var k in context) {
		var v = context[k];
		if (v === undefined)
			continue;

		if (v && typeof v == 'object')
			html = expandTokens(html, v, k+'.');
		else
			html = html.replace(RegExp('{{'+namespace+k+'}}','g'), v);
	}
	return html;
}

function makeErrorHtml(errors) {
	var htmls = {};
	for (var k in errors) {
		htmls[k+'State'] = 'error';
		htmls[k+'Help'] = '<p class="help-block">'+errors[k]+'</p>';
	}
	return htmls;
}