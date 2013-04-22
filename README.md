# Grimwire, the REST Browser OS (v0.0.1 unstable)

Grimwire is a Web client framework which runs RESTful servers inside of [Web Workers](https://developer.mozilla.org/en-US/docs/DOM/Using_web_workers). Its page is broken into independent regions which navigate Worker URLs (under the `httpl://` protocol). It is made to be a secure, user-configurable platform for social software-sharing.

Applications are created with JSON files specifying the active Workers and their settings. The Workers serve UIs and export APIs for each other to consume. The document hosts configuration at `httpl://config.env`, session storage at `httpl://storage.env`, and active Worker scripts at `httpl://workers.env`. As a result, apps on Grimwire can be shared and modified in-session by users, and do not require a backend service to operate.

**Completed Features**

 - Multi-threaded Web applications with well-structured, strongly-encapsulated programs
 - Unified HTTP/REST interface (links, forms, and Ajax calls) for software running locally or remotely
 - Promises-based API

**In Development**

 - JSON-configurable applications
 - Core applications (search, rss, email, chat)

**Roadmap**

 - Permissions policies
 - sessionStorage export/import to file
 - In-browser Worker editing
 - Peer-to-peer Ajax over WebRTC


## Project Status

Grimwire is currently in early development, and can be previewed at [http://grimwire.github.com/grimwire/](http://grimwire.github.com/grimwire/). Grimwire is a deployment of the [Local API](https://github.com/grimwire/local), a toolset for building a browser operating system (also in active development). /[@pfrazee](https://twitter.com/pfrazee)


## Documentation

### [GitHub Wiki](https://github.com/grimwire/grimwire/wiki)
### [Local, the Core API](http://grimwire.com/local/docs.html)


## Getting Started

The latest stable build of Grimwire is kept active at [http://grimwire.github.io/grimwire/](http://grimwire.github.io/grimwire/).

To host your own deployment:

```
git clone https://github.com/grimwire/grimwire.git grimwire
cd grimwire
python -m SimpleHTTPServer
# open http://localhost:8000
```

If developing Grimwire's core software, clone the submodules and run make to build the scripts. **TODO** - link to detailed build instructions.


## Security

One of the project's requirements is to allow untrusted code to enter the environment. The (developing) security model puts no trusted code inside the Workers, and instead requires all commands to enter the document as REST messages, where they are subject to permissions, scrubbing, and routing. The model relies on a trustworthy `/index.html` to host the Workers, so it's recommended that you DO NOT MODIFY `/index.html` or introduce new software into the document without a full security review. Instead, use configuration files.
 
*Most of the security tools are still in development - do not run untrusted Workers!*

 > Read More: [The Security Model](https://github.com/grimwire/grimwire/wiki/Security-Model)


## How does it work?

### Load Process

`/index.html` GETs `/.host.json` on page-load to get a list of applications.

```json
{
 "applications":[
		"/apps/index.json",
		"/apps/rss.json"
	]
}
```

`/index.html` then reads each of the applications.

`/apps/index.json`:

```json
{
 "id": "mail",
	"title": "Webmail",
	"icon": "inbox",
	"layout": [
		[
			{ "width":2, "regions":"httpl://bookmarks.usr/" },
			{ "id":"main", "width":10, "regions":"httpl://index.usr" }
		]
	],
	"workers": [
 		{
			"domain": "index.usr",
			"title": "Search Index",
			"src": "servers/worker/index/lunr.js"
		},
 		{
			"domain": "bookmarks.usr",
			"title": "User Bookmarks",
			"src": "servers/worker/storage/bookmarks.js"
		}
	],
	"common": {
		"grimHost": "http://grimwire.github.io",
		"storageHost": "httpl://sessionstorage.env"
	}
}
```

The workers are loaded and given their configuration entries (mixed over the `common` configuration object, above). The layout is then constructed and populated with the HTML from the given URLs.

 > Read More: [The Applications](https://github.com/grimwire/grimwire/wiki/The-applications)


### How are Worker servers built?

Worker servers are simple, single-purpose programs. They are generally stateless (they write their data to session storage) and are often unloaded or reloaded without warning. This makes them easy to reconfigure and rewrite during the session, and decouples the Workers from the document.

A markdown proxy:

```javascript
importScripts('linkjs-ext/responder.js');
importScripts('vendor/marked.js');

marked.setOptions({ gfm: true, tables: true });
function headerRewrite(headers) {
	headers['content-type'] = 'text/html';
	return headers;
}
function bodyRewrite(md) { return (md) ? marked(md) : ''; }

localApp.onHttpRequest(function(request, response) {
	var mdRequest = Link.dispatch({
		method  : 'get',
		url     : localApp.config.baseUrl + request.path,
		headers : { accept:'text/plain' }
	});
	Link.responder(response).pipe(mdRequest, headerRewrite, bodyRewrite);
});
```

 > Read More: [The Workers](https://github.com/grimwire/grimwire/wiki/The-workers)


### How is the session managed?

Grimwire provides `httpl://storage.env` as a simple JSON document storage. It stores data in `sessionStorage` and is an ideal place to keep state (so the Workers can reload without losing data). The data in `httpl://storage.env` can be exported and imported as JSON, allowing the user to resume a session by reopening the file.

The API of `httpl://storage.env`:

 - `/`
   - GET: lists collections and the document keys within
   - POST: generates a unique, unused collection ID, then sets the empty collection there
 - `/:collection`
   - GET: lists the documents in the collection
   - POST: adds a document to the collection
   - DELETE: deletes the collection and its documents
 - `/:collection/:item`
   - GET: fetches the document
   - PUT: replaces the document
   - PATCH: updates the document (must exist first)
   - DELETE: deletes the document

This can be easily consumed using `Link.navigator`

```javascript
var storage = Link.navigator('httpl://storage.env').collection('myapp');
storage.item('usercfg').patch({ id:'johndoe', email:'jdoe@email.com' });
storage.getJson().then(function(res) {
	console.log(res.body);
})
```

Navigator works by following entries in response `Link` headers and using URI templates. 

 > Read More about `Navigator`: [Local APIs](https://github.com/grimwire/grimwire/wiki/Local-APIs)

*Permissions policies will eventually regulate which `httpl://session.env` resources the Workers can access.*


### How are permissions managed?

Permissions are not yet implemented. Do not load untrusted software!

Grimwire disables inline scripts and styles through [CSP](https://developer.mozilla.org/en-US/docs/Security/CSP), and does not load `<script>` or `<style>` scripts. It's recommended that you do not alter the CSP unless you can guarantee that only trusted software will be loaded.



## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
