module.exports = function createServer(main_server, config) {
	var express = require('express');
	var server = express();

	// :TODO: this is a temporary replacement of the old couchdb server

	var addLinks = {
		toplevel: function(req, res, next) {
			res.link('service', '/', 'grimwire');
			res.link('up', '/services');
			res.link('self', '/services/ffs');
			res.link('collection', '/services/ffs/threads{?limit,skip,descending}', 'threads');
			next();
		},
		threadsCollection: function(req, res, next) {
			res.link('service', '/', 'grimwire');
			res.link('up', '/services/ffs');
			res.link('self', '/services/ffs/threads{?limit,skip,descending}');
			res.link('item', '/services/ffs/threads/{title}');
			next();
		},
		threadItem: function(req, res, next) {
			res.link('service', '/', 'grimwire');
			res.link('up', '/services/ffs/threads{?limit,skip,descending}');
			res.link('self', '/services/ffs/threads/'+req.param('threadId'));
			res.link('item', '/services/ffs/threads/{title}');
			next();
		}
	};

	function end(req, res, next) {
		res.end();
	}

	// Threads
	// =======

	var threads = [];
	var numThreads = 0;

	function addThread(req, res, next) {
		var thread = req.body.thread;
		var reply_to = req.body.reply_to;
		var title = req.body.title;
		var author = req.body.author;
		var content = req.body.content;
		if (!content)
			return res.status(400).send('`content` is required').end();

		var threadId = numThreads;
		threads.push({
			id: threadId,
			thread: thread,
			reply_to: reply_to,
			title: title,
			author: author,
			content: content,
			created_at: new Date()
		});
		numThreads++;

		writeThreadsToStorage();

		res.json(threadId);
		next(req, res, next);
	}

	function getThreadsCollection(req, res, next) {
		var limit = req.query.limit || 10;
		var offset = req.query.offset || 0;
		var desc = req.query.descending || false;

		var threadSlice = threads
			.filter(function(post) { // filter down to toplevels only
				return !post.thread; // no parent
			})
			.slice(offset, offset+limit);
		if (desc)
			threadSlice = threadSlice.reverse();

		res.json({rows:threadSlice});
		next();
	}

	function getThreadItem(req, res, next) {
		var thread = threads[req.param('threadId')];
		if (!thread)
			return res.status(404).end();

		var replies = threads.filter(function(post) {
			return (post.thread == req.param('threadId'));
		});
		
		res.json({ initial_post:thread, replies:replies });
		next();
	}

	function writeThreadsToStorage() {
		// :TEMP:
		require('fs').writeFile('./ffs_threads.json', JSON.stringify(threads, null, 4), function(err) {
			if (err)
				console.log('Warning: Failed to write ffs_threads.json', err);
		});
	}

	// read threads
	require('fs').readFile('./ffs_threads.json', 'utf8', function(err, data) {
		if (err)
			return console.log('Warning: Failed to read ffs_threads.json', err);
		threads = JSON.parse(data);
        numThreads = threads.length;
	});
 
	// Routes
	// ======
	server.head('/', addLinks.toplevel);
	server.head('/threads', addLinks.threadsCollection);
	server.get('/threads', addLinks.threadsCollection, getThreadsCollection);
	server.post('/threads', addLinks.threadsCollection, addThread);
	server.head('/threads/:threadId', addLinks.threadItem);
	server.get('/threads/:threadId', addLinks.threadItem, getThreadItem);
	server.all('*', end);

	return server;
};