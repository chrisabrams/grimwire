module.exports = function createServer(main_server, config) {
	var express = require('express');
	var server = express();

	// :TODO: this is a temporary replacement of the old couchdb server

	var addLinks = {
		toplevel: function(req, res, next) {
			res.link('service', '/', 'grimwire');
			res.link('up', '/services');
			res.link('self', '/services/email');
			res.link('collection', '/services/email/{title}');
			next();
		},
		listsCollection: function(req, res, next) {
			res.link('service', '/', 'grimwire');
			res.link('up', '/services/email');
			res.link('self', '/services/email/lists');
			res.link('item', '/services/email/lists/{title}');
			next();
		},
		listItem: function(req, res, next) {
			var selfUrl = '/services/email/lists/'+req.param('listId');
			res.link('service', '/', 'grimwire');
			res.link('up', '/services/email/lists');
			res.link('self', selfUrl);
			res.link('item', '/services/email/lists/{title}');
			res.link('collection', selfUrl+'/members', 'members');
			next();
		},
		listMembersCollection: function(req, res, next) {
			var upUrl = '/services/email/lists/'+req.param('listId');
			var selfUrl = upUrl+'/members';
			res.link('service', '/', 'grimwire');
			res.link('up', upUrl);
			res.link('self', selfUrl);
			next();
		}
	};

	function end(req, res, next) {
		res.end();
	}

	// Lists
	// =====

	var lists = {
		'grimwire-updates': {}
	};

	function addListMember(req, res, next) {
		var email = req.body.email;
		if (!email)
			return res.status(400).send('`email` is required');

		var listId = req.param('listId');
		lists[listId] = lists[listId] || {};
		lists[listId][email] = { createdAt: new Date() };

		writeListsToStorage();

		return res.status(200).end();
	}

	function writeListsToStorage() {
		// :TEMP:
		require('fs').writeFile('./email_lists.json', JSON.stringify(lists, null, 4), function(err) {
			if (err)
				console.log('Warning: Failed to write email_lists.json', err);
		});
	}
 
 	// Routes
 	// ======
	server.head('/', addLinks.toplevel, end);
	server.head('/lists', addLinks.listsCollection, end);
	server.head('/lists/:listId', addLinks.listItem, end);
	server.head('/lists/:listId/members', addLinks.listMembersCollection, end);
	server.post('/lists/:listId/members', addLinks.listMembersCollection, addListMember);

	return server;
};