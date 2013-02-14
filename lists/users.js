function(head, req) {
	var linkHeader = [
		'<grimwire.com>; rel="service"; title="grimwire"',
		'<grimwire.com/users>; rel="self"; title="users"',
		'<grimwire.com/users/{title}>; rel="item"'
	].join(', ');

	provides("json", function() {
		start({
			headers: {
				"Content-Type": "application/json",
				'Link': linkHeader
			}
		});
		var rows = [], row;
		while ((row = getRow())) {
			rows.push(toJSON(row.publish));
		}
		send(toJSON(head).slice(0,-1) + ', "rows":['+rows.join(',')+']}');
	});
	provides("html", function() {
		start({
			headers: {
				"Content-Type": "text/html",
				'Link': linkHeader
			}
		});
		var html = [], row;
		while (row = getRow()) {
			var publish = row.value.publish;
			if (!publish) continue;

			html.push([
				'<div class="page-header">',
					'<h3><img src="/assets/icons/16x16/user_'+publish.avatar+'.png" /> '+(publish.name || row.id)+'</h3>',
				'</div>'
			].join(''));

			if (publish.applications) {
				html.push('<div class="media">');
				html.push('<p><span class="label">applications</span></p>');
				for (var i=0, ii=publish.applications.length; i<ii; i++) {
					var app = publish.applications[i];
					html.push([
						'<img class="pull-left" media-object" src="',app.image,'">',
						'<div class="media-body">',
							'<form>',
								'<input type="hidden" name="url" value="',app.url,'"/> ',
								'<h4 class="media-heading">',app.title,' <small><a href="',app.url,'" target="-below">source</a></small></h4>',
								'<p>',app.description,'</p>',
							'</form>',
						'</div>'
					].join(''));
				}
				html.push('</div>');
			}
			html.push('</pre>');
		}
		send('<div class="span6 nofloat">'+html.join('')+'<br/><br/></div>');
	});
}