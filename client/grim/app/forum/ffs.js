importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

// config
app.config.threads_page_size = app.config.threads_page_size || 5;
app.config.thread_posts_page_size = app.config.thread_posts_page_size || 5;
app.config.icons_baseurl = app.config.icons_baseurl || ('http://'+app.config.environmentHost+'/assets/icons/16x16/');
// our domain
var domain = 'httpl://v1.pfraze.ffs.forum.app';
// ffs provider
var ffsService = Link.navigator('/').service('ffs');
// common headers
var stdHeaders = Link.headerer();
stdHeaders.addLink('http://grimwire.com/grim/app/forum/ffs.js', 'http://grimwire.com/rels/src', { title:'application' });

// GET /
function threadsHeader(headers) {
	headers['content-type'] = 'text/html';
	headers.link = stdHeaders.link;
	return headers;
}
function threadsBody(request) {
	return function(threads) {
		var html = [];

		html.push('<p><span class="muted">FFS</span> <a href="httpl://v1.pfraze.ffs.forum.app/new" title="Create New Thread">New Thread</a></p>');
		html.push('<table class="table">');
		for (var i=0, ii=threads.rows.length; i < ii; i++) {
			var post = threads.rows[i];
			html.push([
				'<tr><td>',
					'<strong>',optAuthor(post.author),'</strong> ',
					'<a href="',domain,'/',post.id,'" title="',post.title||'','">',optTitle(post.title),'</a>',
					'<br/>',
					'<small>',formatDateArr(post.created_at),'</small>',
				'</td></tr>'
			].join(''));
		}
		html.push('</table>');

		var skip = parseInt(request.query.skip, 10) || 0;
		var isFirst = (!skip);
		var isLast = ((skip+app.config.threads_page_size) >= threads.total_rows);
		html.push(paginator(isFirst, isLast, domain, (skip-app.config.threads_page_size), (skip+app.config.threads_page_size)));

		return html.join('');
	};
}

// GET /new
function newThreadHeader() {
	return {
		link : stdHeaders.link
	};
}
function newThreadBody(request) {
	var n = Math.round(Math.random()*1000);
	var title = (request.query.topic) ? 'Reply To: '+request.query.topic : 'New Thread';
	return [
		'<form action="',domain,'/new" method="POST" enctype="application/json">',
			'<input type="hidden" name="type" value="post" />',
			(request.query.reply_to) ?'<input type="hidden" name="reply_to" value="'+request.query.reply_to+'" />' : '',
			(request.query.thread) ?'<input type="hidden" name="thread" value="'+request.query.thread+'" />' : '',
			'<fieldset>',
				'<legend>',title,'</legend>',
				'<label for="title',n,'">Title</label>',
				'<input id="title',n,'" type="text" class="span6" name="title" />',
				'<label for="author',n,'">Author</label>',
				'<input id="author',n,'" type="text" class="span6" name="author" />',
				'<label for="content',n,'">Content</label>',
				'<textarea id="content',n,'" class="span6" name="content"></textarea>',
				'<br/><button type="submit" class="btn">Submit</button>',
			'</fieldset>',
		'</form>'
	].join('');
}

// GET /:key
function threadHeader(headers) {
	headers['content-type'] = 'text/html';
	headers.link = stdHeaders.link;
	return headers;
}
function threadBody(request, threadId) {
	return function(thread) {
		var html = [];

		var skip = parseInt(request.query.skip, 10) || 0;
		var end = skip + app.config.thread_posts_page_size;

		html.push('<div class="media">');
		html.push('<div class="media-body">');
		if (thread.initial_post) {
			html.push('<h3 class="media-heading">'+optTitle(thread.initial_post.title)+'</h3>');
			html.push('<p>'+thread.initial_post.content+'</p>');
			html.push('<blockquote><small>');
			html.push(optAuthor(thread.initial_post.author)+', '+formatDateArr(thread.initial_post.created_at));
			html.push(' <a href="'+replyLink(thread.initial_post)+'" title="reply">reply</a>');
			html.push('</small></blockquote>');
		}

		for (var i=skip, ii=thread.replies.length; i < ii && i < end; i++) {
			var post = thread.replies[i];
			html.push('<div class="media">');
			html.push('<a class="pull-left" href="'+domain+'/'+post.id+'">');
			html.push('<img class="media-object" src="'+app.config.icons_baseurl+opt(post.icon,'document_quote')+'.png">');
			html.push('</a>');
			html.push('<div class="media-body">');
			html.push('<p class="media-heading"><strong>'+optTitle(post.title)+'</strong></p>');
			html.push('<p>'+post.content+'</p>');
			html.push('<blockquote><small>');
			html.push(optAuthor(post.author)+', '+formatDateArr(post.created_at));
			html.push(' <a href="'+replyLink(post)+'" title="reply">reply</a>');
			html.push('</small></blockquote>');
			html.push('</div>');
			html.push('</div>');
		}
		html.push('</div>');
		html.push('</div>');

		var isFirst = (!skip);
		var isLast = (end >= thread.replies.length);
		html.push(paginator(isFirst, isLast, domain+'/'+threadId, (skip-app.config.thread_posts_page_size), (skip+app.config.thread_posts_page_size)));

		return html.join('');
	};
}

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			var skip = parseInt(request.query.skip, 10) || 0;
			var limit = app.config.threads_page_size;
			var threadsRequest = ffsService.collection('threads', { limit:limit, skip:skip, descending:true }).getJson();
			Link.responder(response).pipe(threadsRequest, threadsHeader, threadsBody(request));
		})
		.mpa('get', RegExp('^/new/?$','i'), /html/, function() {
			Link.responder(response).ok('html', newThreadHeader()).end(newThreadBody(request));
		})
		.mpta('post', RegExp('^/new/?$','i'), /json/, /html/, function() {
			var post = request.body;
			post.type = "post";
			ffsService.collection('threads').post(post, 'application/json')
				.then(function(res) {
					var id = res.body;
					console.log(res.body, id);
					Link.responder(response).seeOther(null, { location:domain+'/'+(post.thread || id) }).end();
				})
				.except(function(res) {
					Link.responder(response).noContent().end();
				});
			
		})
		.mpa('get', RegExp('^/([^/]*)/?$','i'), /html/, function(match) {
			var key = match.path[1];
			var skip = parseInt(request.query.skip, 10) || 0;
			var limit = app.config.thread_posts_page_size;
			var threadRequest = ffsService.collection('threads').item(key).getJson();
			Link.responder(response).pipe(threadRequest, threadHeader, threadBody(request, key));
		})
		.error(response);
});
app.postMessage('loaded', {
	category : 'Forum',
	name     : 'FFS',
	author   : 'pfraze',
	version  : 'v1'
});

function pad0(i) {
	return (i < 10) ? '0'+i : i;
}
function formatDateArr(d) {
	return [d[0],'/',pad0(d[1]+1),'/',pad0(d[2]),' ',pad0(d[3]),':',pad0(d[4]), ':',pad0(d[5])].join('');
}
function opt(v, fallback) {
	return (v) ? v : fallback;
}
function optTitle(v) { return opt(v, '<em>&lsaquo;no subject&rsaquo;</em>'); }
function optAuthor(v) { return opt(v, '<em>&lsaquo;anon&rsaquo;</em>'); }
function paginator(isFirst, isLast, url, prev, next) {
	var prevlink = '<a href="'+url+'?skip='+prev+'">&laquo;</a>';
	var nextlink = '<a href="'+url+'?skip='+next+'">&raquo;</a>';
	return [
		'<div class="pagination pagination-small"><ul>',
			'<li',(isFirst)?' class="disabled"':'','>',
				(isFirst)?'<span>&laquo;</span>':prevlink,
			'</li>',
			'<li',(isLast)?' class="disabled"':'','>',
				(isLast)?'<span>&raquo;</span>':nextlink,
			'</li>',
		'</ul></div>'
	].join('');
}
function replyLink(post) {
	return domain+'/new?reply_to='+post.id+'&thread='+(post.thread||post.id)+'&topic='+encodeURIComponent(post.title);
}