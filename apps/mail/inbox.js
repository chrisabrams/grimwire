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
	message: makeTemplateFn('templates/message.html'),
	compose: makeTemplateFn('templates/compose.html'),
	contacts: makeTemplateFn('templates/contacts.html'),
	configure: makeTemplateFn('templates/configure.html')
};

var cache = {
	messages: null
};

function main(request, response) {
	if (isConfigNeeded) {
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

	if (/HEAD|GET/.test(request.method) && request.path.slice(0, 10) == '/messages/')
		return serveMessage(request, response, request.path.slice(10));

	if (request.path == '/.grim/config')
		return serveConfig(request, response);

	response.writeHead(404, 'not found').end();
}

function serveLayout(request, response) {
	response.setHeader('link', [
		{ rel:'self', href:'/' },
		{ rel:'collection', href:'/messages', title:'messages' },
		{ rel:'collection', href:'/contacts', title:'contacts' },
		{ rel:'http://grimwire.com/rel/transform', href:'/messages/.new{?title,subject,content,href,sender}', title:'Email' }
	]);
	respond(request, response, { html: templates.layout() });
}

function serveMessages(request, response) {
	response.setHeader('link', [
		{ rel:'up via', href:'/' },
		{ rel:'self', href:'/messages' },
		{ rel:'item', href:'/messages/.new', title:'.new' }
	]);

	getMessages().succeed(function(result) {
		// render messages
		var messages = result.body.map(normalizeMessage)
			.map(function(message, index) {
				message.href = 'httpl://'+config.domain+'/messages/'+index;
				return message;
			})
			.map(templates.messagesItem)
			.join('<hr style="margin: 0.5em 0 1em" />');

		// render content
		var content = templates.messages({
			error: result.error,
			messages: messages
		});

		respond(request, response, {
			html: content,
			deltas: [
				['replace', '#grimmail-content', content]
			]
		});
	});
}

function serveCompose(request, response) {
	response.setHeader('link', [
		{ rel:'via', href:'/' },
		{ rel:'up collection', href:'/messages' },
		{ rel:'self', href:'/messages/.new' }
	]);

	var recipient = '';
	if (request.query.sender)
		recipient = request.query.sender;

	var subject = '';
	if (request.query.subject)
		subject = 'RE: '+request.query.subject;
	else if (request.query.title)
		subject = request.query.title;

	var content = '';
	if (request.query.href)
		content += request.query.href+"\n\n";
	if (request.query.content)
		content += quoteContent(request.query.content);

	respond(request, response, {
		html: templates.compose({
			recipient: recipient,
			subject: subject,
			content: content
		})
	});
}

function serveMessage(request, response, messageIndex) {
	response.setHeader('link', [
		{ rel:'via', href:'/' },
		{ rel:'up collection', href:'/messages' },
		{ rel:'self', href:'/messages/'+messageIndex }
	]);

	getMessages({ offset: messageIndex, count: 1 }).succeed(function(result) {
		var message = result.body[0];
		if (!message)
			return response.writeHead(404, 'not found').end();

		message.from = message.from.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		message.recipient = message.recipient.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		var content = templates.message(message);
		var title = message.subject;
		if (title.length > 22)
			title = title.slice(0,19) + '...';
		else
			title += '"';
		var tab = (
			'<li class="message-'+messageIndex+'">'+
				'<a href="httpl://'+config.domain+'/messages/'+messageIndex+'" target="grimmail-content" data-toggle="nav">"'+title+'</a>'+
			'</li>'
		);

		respond(request, response, {
			html: content,
			deltas: [
				['remove', '#grimmail-nav .message-'+messageIndex],
				['append', '#grimmail-nav', tab],
				['removeClass', '#grimmail-nav .active', 'active'],
				['addClass', '#grimmail-nav .message-'+messageIndex, 'active'],
				['replace', '#grimmail-content', content]
			]
		});
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

// wraps a string ~80 chars (without breaking within words) and adds "> " to the start of each line
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
	} else if (/html-deltas/.test(request.headers.accept) && content.deltas) {
		response.setHeader('content-type', 'application/html-deltas+json');
		response.writeHead(200, 'ok').end(content.deltas);
	} else
		response.writeHead(406, 'bad accept').end();
}

function getMessages(query) {
	return local.http.dispatch({
		url: local.http.joinUrl(config.usr.mailhostUrl, config.usr.username),
		query: query,
		headers: {
			accept: 'application/json',
			authorization: 'Basic '+btoa(config.usr.username+':'+config.usr.password)
		}
	}).then(
		function(res) {
			if (Array.isArray(res.body))
				return { error: null, body: res.body };
			return {
				error: '<div class="alert alert-error"><strong>Error!</strong> Invalid response from the email host.</div>',
				body: []
			};
		},
		function() {
			return {
				error: '<div class="alert alert-error"><strong>Error!</strong> Failure response from the email host.</div>',
				body: []
			};
		}
	);
}

// gets the schema in a nice, natr'al place
function normalizeMessage(message) {
	var dateParts = message.Date.split(' ');
	message.date = dateParts.slice(0,4).join(' ');
	message.time = toAMPM(dateParts[4]) + ' ' + dateParts[5];
	return message;
}

function toAMPM(time) {
	return time.replace(/^(\d\d):(\d\d):\d\d/, function(v, hr, min) {
		var ending = 'AM';
		hr = parseInt(hr, 10);
		if (hr >= 12) { ending = 'PM'; hr -= 12; }
		if (hr === 0) hr = 12;
		return hr + ':' + min + ending;
	});
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

// "{foo} {a.b}" -> { foo:"bar", a:{ b:"tacos" }} -> "bar tacos"
function expandTokens(html, context, namespace) {
	if (!namespace) namespace = '';
	for (var k in context) {
		var v = context[k];
		if (v === undefined || v === null)
			continue;

		if (v && typeof v == 'object')
			html = expandTokens(html, v, k+'.');
		else
			html = html.replace(RegExp('{{'+namespace+k+'}}','g'), v);
	}
	return html;
}

// produces html snippets out of the errors (used because there's no logic in the templates)
function makeErrorHtml(errors) {
	var htmls = {};
	for (var k in errors) {
		htmls[k+'State'] = 'error';
		htmls[k+'Help'] = '<p class="help-block">'+errors[k]+'</p>';
	}
	return htmls;
}