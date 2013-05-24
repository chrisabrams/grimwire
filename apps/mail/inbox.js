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
	composeEmbed: makeTemplateFn('templates/compose-embed.html'),
	contacts: makeTemplateFn('templates/contacts.html'),
	configure: makeTemplateFn('templates/configure.html')
};

var cache = {
	messages: null
};

function main(request, response) {
	if (request.method != 'HEAD' && isConfigNeeded) {
		var message = '<div class="alert alert-info"><strong>Setup Required!</strong><br/>'+
			'Before I can find your email, I need to to know where your host is.</div>';
		return serveConfig(request, response, message, (request.path != '/.grim/config'));
	}

	if (/HEAD|GET/.test(request.method) && request.path == '/')
		return serveLayout(request, response);

	if (/HEAD|GET/.test(request.method) && request.path == '/messages')
		return serveMessages(request, response);

	if (request.path == '/messages/.new')
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
		{ rel:'http://grimwire.com/rel/transform', href:'/messages/.new?embed=1{&title,subject,content,href,sender}', title:'Email' }
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
		var messages = result.items.map(normalizeMessage)
			.map(function(message, index) {
				// map index to be ascending, so that new messages dont mess them all up
				index = (result.meta.total - index - 1); // :NOTE: dont forget the offset, once we're paginating
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

	var emailSendRequest = 1;
	var context = {
		message: null,
		errors: {},
		recipient: '',
		subject: '',
		content: ''
	};

	if (request.method == 'POST') {
		// validate
		if (!request.body) context.errors._error = 'Request body required.';
		else {
			if (!request.body.recipient) context.errors.recipient = 'Required.';
		}

		if (Object.keys(context.errors).length === 0) {
			// send email
			emailSendRequest = local.http.dispatch({
				method: 'post',
				url: config.usr.mailhostUrl,
				body: {
					to: request.body.recipient,
					subject: request.body.subject,
					text: request.body.content
				},
				headers: {
					accept: 'application/json',
					authorization: 'Basic '+btoa(config.usr.username+':'+config.usr.password),
					'content-type': 'application/json'
				}
			}).succeed(function() {
				context.message = '<div class="alert alert-success" data-lifespan="5">Message sent!</div>';
				return 2;
			}).fail(function(res) {
				context.message = '<div class="alert alert-error">Failed to deliver the email: '+JSON.stringify(res.body)+'</div>';
				// hold onto the request vars so the user can resend
				context.recipient = request.body.recipient;
				context.subject = request.body.subject;
				context.content = request.body.content;
				return 3;
			});
		} else {
			context.message = '<div class="alert alert-error">There are errors in the email.</div>';
			// hold onto the request vars so the user can resend
			context.recipient = request.body.recipient;
			context.subject = request.body.subject;
			context.content = request.body.content;
		}
	}
	else {
		// populate inputs from query params
		if (request.query.sender)
			context.recipient = request.query.sender;

		if (request.query.subject)
			context.subject = 'RE: '+request.query.subject;
		else if (request.query.title)
			context.subject = request.query.title;

		if (request.query.href)
			context.content += request.query.href+"\n\n";
		if (request.query.content)
			context.content += quoteContent(request.query.content);
	}

	local.promise(emailSendRequest).always(function(result) {
		var isEmbed = (request.query.embed == '1');
		if (result == 2 && isEmbed) // successful send
			return response.writeHead(210, 'message sent').end();
		else {
			context.errors = makeErrorHtml(context.errors);
			var html = isEmbed ? templates.composeEmbed(context) : templates.compose(context);
			respond(request, response, {
				html: html
			});
		}
	});
}

function serveMessage(request, response, messageIndex) {
	response.setHeader('link', [
		{ rel:'via', href:'/' },
		{ rel:'up collection', href:'/messages' },
		{ rel:'self', href:'/messages/'+messageIndex }
	]);

	getMessages({ offset: messageIndex, count: 1, sort: 'asc' }).succeed(function(result) {
		var message = (result.items) ? result.items[0] : null;
		if (!message)
			return response.writeHead(404, 'not found').end();

		// render message content
		message.href = 'httpl://'+config.domain+'/messages/'+messageIndex;
		message.from = message.from.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		message.recipient = message.recipient.replace(/</g, '&lt;').replace(/>/g, '&gt;');
		var content = templates.message(message);

		// create/open the tab
		// console.log(request.headers);
		var deltas = [];
		var openTabs = request.headers.cookie.openTabs || [];
		if (openTabs.indexOf(messageIndex) === -1) {
			// create tab
			openTabs.push(messageIndex);
			var title = message.subject;
			if (title.length > 22) title = title.slice(0,19) + '...';
			else title += '"';
			var tab = (
				'<li class="message-'+messageIndex+'">'+
					'<a href="httpl://'+config.domain+'/messages/'+messageIndex+'" target="grimmail-content" data-toggle="nav">"'+title+'</a>'+
				'</li>'
			);
			deltas = [
				['remove', '#grimmail-nav .message-'+messageIndex],
				['append', '#grimmail-nav', tab],
				['removeClass', '#grimmail-nav .active', 'active'],
				['addClass', '#grimmail-nav .message-'+messageIndex, 'active'],
				['replace', '#grimmail-content', content]
			];
		} else {
			// open tab
			deltas = [
				['removeClass', '#grimmail-nav .active', 'active'],
				['addClass', '#grimmail-nav .message-'+messageIndex, 'active'],
				['replace', '#grimmail-content', content]
			];
		}

		// console.log(openTabs);
		respond(request, response, {
			html: content,
			deltas: deltas
		}, { 'set-cookie':{ openTabs:{ value:openTabs, scope:'client' }}});
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

function respond(request, response, content, headers) {
	if (headers) {
		for (var k in headers)
			response.setHeader(k, headers[k]);
	}
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
	if (!query) query = {};
	if (!query.sort) query.sort = 'desc';
	return local.http.dispatch({
		url: local.http.joinUrl(config.usr.mailhostUrl, config.usr.username),
		query: query,
		headers: {
			accept: 'application/json',
			authorization: 'Basic '+btoa(config.usr.username+':'+config.usr.password)
		}
	}).then(
		function(res) {
			if (res.body && Array.isArray(res.body.items))
				return res.body;
			return {
				error: '<div class="alert alert-error"><strong>Error!</strong> Invalid response from the email host.</div>',
				items: null,
				meta: null
			};
		},
		function() {
			return {
				error: '<div class="alert alert-error"><strong>Error!</strong> Failure response from the email host.</div>',
				items: null,
				meta: null
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