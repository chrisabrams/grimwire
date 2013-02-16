function(doc, req) {
	provides("json", function() {
		start({
			headers: {
				"Content-Type": "application/json",
				'Link':[
					'<http://grimwire.com>; rel="service"; title="grimwire"',
					'<http://grimwire.com/users>; rel="collection up"; title="users"',
					'<http://grimwire.com/users/{title}>; rel="item"',
					'<http://grimwire.com/users/'+req.id+'>; rel="self"'
				].join(', ')
			}
		});
		doc.publish.id = req.id;
		send(toJSON(doc.publish));
	});
}