function(doc, req) {
	provides("json", function() {
		start({
			headers: {
				"Content-Type": "application/json",
				'Link':[
					'<grimwire.com>; rel="service"; title="grimwire"',
					'<grimwire.com/users>; rel="collection up"; title="users"',
					'<grimwire.com/users/{title}>; rel="item"',
					'<grimwire.com/users/'+req.id+'>; rel="self"'
				].join(', ')
			}
		});
		send(toJSON(doc.publish));
	});
}