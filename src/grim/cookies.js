function attachCookies(request, origin) {
	request.headers.cookie = {};
	// attach session cookies
	var sessionCookies = storageServer.getItem(request.urld.host, '.cookies');
	if (sessionCookies && sessionCookies.items)
		__addCookies(request, sessionCookies.items);

	// attach client & region cookies
	if (origin instanceof local.client.Region) {
		var client = origin.getTopmostParent();
		if (client) {
			var clientCookies = client.cookies[request.urld.authority];
			if (clientCookies)
				__addCookies(request, clientCookies);
		}

		var regionCookies = origin.cookies[request.urld.authority];
		if (regionCookies)
			__addCookies(request, regionCookies);
	}
}

function __addCookies(request, cookies) {
	for (var k in cookies) {
		if (k in request.headers.cookie)
			continue;

		request.headers.cookie[k] = cookies[k].value || cookies[k];
		// ^ cookies may be given as a single value or as an object with {value:...}

		// add flagged values to the query object
		if (cookies[k].query)
			request.query[k] = (typeof request.query[k] == 'undefined') ? cookies[k].value : request.query[k];
	}
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