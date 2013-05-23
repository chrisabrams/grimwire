// mail.json : inbox.js
// ====================
// Main mailing interface
// pfraze 2013

var config = local.worker.config;
var templates = {
	layout: makeTemplateFn('templates/layout.html'),
	messages: makeTemplateFn('templates/messages.html'),
	message: makeTemplateFn('templates/message.html'),
	compose: makeTemplateFn('templates/compose.html'),
	contacts: makeTemplateFn('templates/contacts.html')
};

function main(request, response) {
	if (/HEAD|GET/.test(request.method) && request.path == '/') {
		response.setHeader('link', [
			{ rel:'self', href:'/' },
			{ rel:'collection', href:'/messages', title:'messages' },
			{ rel:'collection', href:'/contacts', title:'contacts' },
			{ rel:'http://grimwire.com/rel/transform', href:'/messages/.new{?title,subject,content,href}', title:'Email' }
		]);
		response.writeHead(200, 'ok', {'content-type':'text/html'}).end(templates.layout());
		return;
	}
	if (/HEAD|GET/.test(request.method) && request.path == '/messages') {
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

		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end(templates.messages({
			messages: messages.map(templates.message).join('')
		}));
		return;
	}
	if (/HEAD|GET/.test(request.method) && request.path == '/messages/.new') {
		response.setHeader('link', [
			{ rel:'via', href:'/' },
			{ rel:'up collection', href:'/messages' },
			{ rel:'self', href:'/messages/.new' }
		]);
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		var content = '';
		if (request.query.href)
			content += request.query.href+"\n\n";
		if (request.query.content)
			content += request.query.content;
		response.end(templates.compose({
			recp: (request.query.recp || ''),
			subject: (request.query.subject || request.query.title || ''),
			content: content
		}));
		return;
	}
	if (/HEAD|GET/.test(request.method) && request.path == '/contacts') {
		response.setHeader('link', [
			{ rel:'up via', href:'/' },
			{ rel:'self', href:'/contacts' }
		]);
		response.writeHead(200, 'ok', {'content-type':'text/html'});
		response.end(templates.contacts());
		return;
	}
	if (request.path == '/.grim/config') {
		response.writeHead(200, 'ok', {'content-type':'text/html'}).end('<h1>todo</h1>');
		return;
	}
	response.writeHead(404, 'not found').end();
}

function makeTemplateFn(path) {
	var template = require(path);
	return function(context) {
		if (!context)
			context = {};
		context.domain = config.domain;
		var html = template;
		for (var k in context)
			html = html.replace(RegExp('{{'+k+'}}','g'), context[k]);
		return html;
	};
}