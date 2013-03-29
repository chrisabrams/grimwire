importScripts('linkjs-ext/responder.js');
importScripts('linkjs-ext/router.js');

// our domain
var domain = 'httpl://v1.pfraze.users.social.app/';
// users provider
var usersCollection = Link.navigator('/services/users');

function usersHeader(headers) {
	var stdHeaders = Link.headerer();
	stdHeaders.addLink('http://grimwire.com/grim/app/social/users.js', 'http://grimwire.com/rels/src', { title:'application' });
	headers['content-type'] = 'text/html';
	headers.link = stdHeaders.link;
	return headers;
}
function usersBody(request) {
	return function(users) {
		var html = [];
        html.push('<h4>Grimwire.com Users</h4>');
        html.push('<table class="table">');
		for (var i=0, ii=users.rows.length; i < ii; i++) {
			var row = users.rows[i];
			html.push('<tr>');
            html.push('<td><img src="'+row.profile.gravatar+'" height="22" width="22" /></td>');
            html.push('<td><a href="'+domain+row.id+'/apps">'+row.id+'</a></td>');
            html.push('<td>'+row.description+'</td>');
            html.push('<td>'+row.profile.name.replace(/ /g, '&nbsp;')+'</td>');
            html.push('<td>'+row.profile.description+'</td>');
            html.push('</tr>');
		}
        html.push('</table>');
		return html.join('');
	};
}

function userHeader(headers) {
	var stdHeaders = Link.headerer();
	stdHeaders.addLink('http://grimwire.com/grim/app/social/users.js', 'http://grimwire.com/rels/src', { title:'application' });
	headers['content-type'] = 'text/html';
	headers.link = stdHeaders.link;
	return headers;
}
function userBody(request, matches) {
	var section = matches.path[2];
	return function(user) {
		var html = [];

		html.push([
			'<div class="page-header">',
				'<h3>',
					(user.name || user.id),
					' <small>', user.description, '</small>',
				'</h3>',
			'</div>'
		].join(''));

		if (user.applications) {
			html.push('<div class="media">');
			html.push([
				'<ul class="nav nav-tabs">',
					'<li', (section=='apps')?' class="active"':'', '><a href="',domain,user.id,'/apps">Apps</a></li>',
					'<li', (section=='profile')?' class="active"':'', '><a href="',domain,user.id,'/profile">Profile</a></li>',
					'<li', (section=='messages')?' class="active"':'', '><a href="',domain,user.id,'/messages">Messages</a></li>',
				'</ul>'
			].join(''));
			if (section == 'apps') {
				for (var j=0, jj=user.applications.length; j<jj; j++) {
					var app = user.applications[j];
					html.push([
						'<div class="media-body">',
							'<form>',
								'<input type="hidden" name="url" value="',app.url,'"/> ',
								'<h4 class="media-heading">',
									((app.icon) ? '<img src="'+app.icon+'"> ' : ''),
									app.title,
									' <small><a href="',app.url,'" target="-below">source</a></small>',
								'</h4>',
								'<p>',app.description,'</p>',
							'</form>',
						'</div>'
					].join(''));
				}
			} else if (section == 'profile') {
				var attributes = [];
				for (var attr in user.profile.attributes)
					attributes.push('<strong>'+ucwords(attr)+'</strong> '+user.profile.attributes[attr]+'<br/>');
				html.push([
					'<div class="media">',
						'<img class="pull-left media-object img-circle" src="',user.profile.gravatar,'">',
						'<div class="media-body">',
							'<h2>',user.profile.name,'</h2>',
							'<p class="muted"><small>',user.profile.description,'</small></p>',
							'<p>'+attributes.join('')+'</p>',
						'</div>',
					'</div>'
				].join(''));
			}else if (section == 'messages') {
				for (var j=0, jj=user.messages.length; j<jj; j++) {
					var msg = user.messages[j];
					html.push([
						'<h4>',msg.title,(msg.createdAt?' <small>'+msg.createdAt+'</small>':''),'</h4>',
						'<p>',msg.body,'</p>',
						'<blockquote><small>',user.id,'</small></blockquote>'
					].join(''));
				}
			}
			html.push('</div>');
		}
		html.push('</pre>');
		return html.join('');
	};
}

app.onHttpRequest(function(request, response) {
	Link.router(request)
		.mpa('get', '/', /html/, function() {
			Link.responder(response).pipe(usersCollection.getJson(), usersHeader, usersBody(request));
		})
		.mpa('get', RegExp('/([^/]+)/(apps|profile|messages)/?','i'), /html/, function(matches) {
			var userRequest = usersCollection.item(matches.path[1]).getJson();
			Link.responder(response).pipe(userRequest, userHeader, userBody(request, matches));
		})
		.error(response);
});
app.postMessage('loaded', {
	category : 'Social',
	name     : 'Users',
	author   : 'pfraze',
	version  : 'v1'
});

function ucwords (str) {
    return (str + '').replace(/^([a-z])|\s+([a-z])/g, function ($1) {
        return $1.toUpperCase();
    });
}