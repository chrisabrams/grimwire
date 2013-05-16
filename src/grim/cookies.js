function attachCookies(request, origin) {
	var reqCookies = {};
		// attach client cookies
		if (origin instanceof local.client.Region) {
			var clientCookies = origin.cookies[request.urld.authority];
			if (clientCookies) {
				for (var k in clientCookies) {
					reqCookies[k] = clientCookies[k].value || clientCookies[k];
					// ^ cookies may be given as a single value or as an object with {value:...}

					// add flagged values to the query object
					if (clientCookies[k].query)
						request.query[k] = (typeof request.query[k] == 'undefined') ? clientCookies[k].value : request.query[k];
				}
			}
		}
		// attach session cookies
		var sessionCookies = storageServer.getItem(request.urld.host, '.cookies');
		if (sessionCookies && sessionCookies.items) {
			for (var k in sessionCookies.items) {
				if (k in reqCookies)
					continue;

				reqCookies[k] = sessionCookies.items[k].value || sessionCookies.items[k];
				// ^ cookies may be given as a single value or as an object with {value:...}

				// add flagged values to the query object
				if (sessionCookies.items[k].query)
					request.query[k] = (typeof request.query[k] == 'undefined') ? sessionCookies.items[k].value : request.query[k];
			}
		}
		request.headers.cookie = reqCookies;
}

function updateCookies(request, origin, response) {
	var cookies = response.headers['set-cookie'];
	if (cookies) {
		var storedCookies = storageServer.getItem(request.urld.host, '.cookies') || {id:'.cookies',items:{}};
		if (!storedCookies.items || typeof storedCookies.items != 'object')
			storedCookies.items = {}; // save us from corruption
		for (var k in cookies) {
			if (cookies[k].scope && cookies[k].scope != 'session')
				continue;

			if (cookies[k] === null)
				delete storedCookies.items[k];
			else
				storedCookies.items[k] = cookies[k];
		}
		storageServer.setItem(request.urld.host, storedCookies);
	}
}