function(head, req) {
	var linkHeader = [
		'<http://grimwire.com>; rel="service"; title="grimwire"',
		'<http://grimwire.com/users>; rel="self"; title="users"',
		'<http://grimwire.com/users/{title}>; rel="item"'
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
			if (typeof row.value.publish == 'object') {
				row.value.publish.id = row.id;
				rows.push(toJSON(row.value.publish));
			}
		}
		send(toJSON(head).slice(0,-1) + ', "rows":['+rows.join(',')+']}');
	});
}