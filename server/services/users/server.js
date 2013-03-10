module.exports = function createServer(main_server, config) {
	var express = require('express');
	var server = express();

	// :TODO: this is a temporary replacement of the old couchdb server
 
	server.head('/', addCollectionLinks, end);
	server.get('/', addCollectionLinks, sendCollection);
	server.head('/pfraze', addPfrazeLinks, end);
	server.get('/pfraze', addPfrazeLinks, sendPfraze);

	function addCollectionLinks(req, res, next) {
		res.link('service', '/', 'grimwire');
		res.link('up', '/services');
		res.link('self', '/services/users');
		res.link('item', '/services/users/{title}');
		next();
	}

	function addPfrazeLinks(req, res, next) {
		res.link('service', '/', 'grimwire');
		res.link('up collection', '/services/users');
		res.link('self', '/services/users/pfraze');
		res.link('item', '/services/users/{title}');
		next();
	}

	function sendCollection(req, res, next) {
		res.json({rows:[pfraze]});
	}

	function sendPfraze(req, res, next) {
		res.json(pfraze);
	}

	function end(req, res, next) {
		res.end();
	}

	return server;
};

var pfraze = {
	"id": "pfraze",
	"name": "Paul Frazee",
	"description": "admin",
	"applications": [
		{
			"url": "http://grimwire.com/grim/app/mail/list.js",
			"icon": "http://grimwire.com/assets/icons/16x16/inbox_document.png",
			"title": "mail/list.js",
			"description": "Subscribe to email updates about Grimwire."
		},
		{
			"url": "http://grimwire.com/grim/app/forum/ffs.js",
			"icon": "http://grimwire.com/assets/icons/16x16/comment_white.png",
			"title": "forum/ffs.js",
			"description": "Anonymous, plain-text forum."
		}
	],
	"profile": {
		"gravatar": "http://www.gravatar.com/avatar/a2392accbdb113ab2202b761cbd61206.png",
		"name": "Paul Frazee",
		"description": "Socrates is mortal. I am mortal. Therefore, I am Socrates.",
		"attributes": {
			"born": "August 9, 1986",
			"alignment": "Neutral Good",
			"email": "pfrazee@gmail.com"
		}
	},
	"messages": [
		{
			"title": "Welcome to Grimwire",
			"createdAt": "February 16, 2013",
			"body": "This is a preview build, so don't worry if anything breaks. Load up the apps I'm publishing to subscribe to mailing lists or talk about the environment. (You can load apps by dragging the 'power button' on the left of the page onto the app's description.)"
		}
	]
};