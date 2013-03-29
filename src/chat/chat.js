// Kai Chat Surface (Grimwire)
// ===========================
if (!Worker)
    document.getElementById('workers-notice').style.display = 'block';


// init surface globals
var Regions = {
	chatout: [],
	dashboard: Environment.addClientRegion(new KaiRegion('dashboard')),
	users: Environment.addClientRegion('users-list')
};
var DataProviders = {
	session: Link.navigator('httpl://session'),
	msgs: Link.navigator('/').service('chat').collection('messages')
};
var UiProviders = {
	chatout: Link.navigator('httpl://chatout.ui'),
	dashboard: Link.navigator('httpl://dashboard.ui'),
	users: Link.navigator('httpl://users.ui')
};
var Streams = {
	msgs: Link.subscribe('/services/chat/messages') // :TODO: replace with navigation
};


// setup environment
Environment.config.workerBootstrapUrl = '/local/lib/worker_bootstrap.js';
Environment.setDispatchWrapper(function(request, origin, dispatch) {
	var response = dispatch(request);
	response.then(console.log.bind(console), request);
	response.except(console.log.bind(console), request);
	return response;
});

Environment.setRegionPostProcessor(function(el) {
});

window.addEventListener('beforeunload', function() {
	DataProviders.msgs.post({ message:'bye', author:session.author }, 'application/json');
});


// setup session
var session = new SessionServer();
session.data.username = 'anon';
Environment.addServer('session', session);


// instantiate apps
Environment.addServer('chatout.ui', new Environment.WorkerServer({ scriptUrl:'/chat/apps/chatout.js' }));
Environment.addServer('dashboard.ui', new Environment.WorkerServer({ scriptUrl:'/chat/apps/dashboard.js' }));
Environment.addServer('users.ui', new Environment.WorkerServer({ scriptUrl:'/chat/apps/users.js' }));


// setup chat input
document.querySelector('#input textarea').addEventListener('keydown', function(e) {
	if (e.keyCode == 13 && e.ctrlKey && e.target.value) {
		UiProviders.dashboard.service('formatter').post(e.target.value, 'text/plain', { accept:'text/html' })
			.then(function(res) {
				DataProviders.msgs.post({ message:res.body, author:session.data.username }, 'application/json');
			})
			.except(console.log.bind(console)); // :TODO: remove this once all link requests get properly routed through the environment dispatcher
		e.target.value = '';
		e.preventDefault();
		return false;
	}
});


// setup chat output
Streams.msgs.on('broadcast', function(e) {
	// chatout appends responses from its app
	// :TODO: use navigator - UiProviders.chatout.post(e.data, 'application/json', { accept:'text/html' })
	var type = (e.data.author == session.data.username) ? 'userbroadcast' : 'broadcast';
	newMessageRegion(type, e.data.author).dispatchRequest({
		method: 'post',
		url: 'httpl://chatout.ui',
		headers: { 'content-type':'application/json', accept:'text/html' },
		body: e.data
	});
});


// make initial requests
// :TODO: use navigator
Regions.dashboard.dispatchRequest({ method:'get', url:'httpl://dashboard.ui', target:'-self', headers: { accept:'text/html' }});
Regions.users.dispatchRequest('httpl://users.ui');
newMessageRegion('response', 'httpl://dashboard.ui/profile').dispatchRequest('httpl://dashboard.ui/profile');