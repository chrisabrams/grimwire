# Grimwire: a REST bOS (v0.0.1 unstable)

**Grimwire is a (developing) Web client application framework for hosting javascript REST servers inside of [Web Workers](https://developer.mozilla.org/en-US/docs/DOM/Using_web_workers)**. Apps are built on Grimwire with JSON configurations of single-purpose Worker servers, and all configuration can be modified during the session. Doing so reloads the Workers while preserving the document state.

**Grimwire isolates "client region" divs, allowing them to navigate resources hosted by the Worker servers and by remote servers**. To give Worker servers realtime control over the API, Grimwire uses event-streams ([Server-Sent Events](https://developer.mozilla.org/en-US/docs/Server-sent_events)) and response command-documents ("application/html-deltas+json" for targeted updates to the html).

**Rather than bind to DOM events, links and forms point at Worker server domains**. This enables the user to configure the application using links, and introduces the possibility for user-proxies to be introduced.  These tools can also be used to give remote servers realtime control over the UI without writing client-side javascript, though there is more overhead (TCP and HTTP) compared to Websockets.

---

**One of the project's requirements is to allow untrusted code to enter the environment**. The (developing) security model puts no trusted code inside the Workers namespaces, and instead requires all commands to enter the document as REST messages, where they are subject to permissions, scrubbing, and routing. The model relies on a trustworthy `/index.html` to host the Workers, so it's recommended that you DO NOT MODIFY `/index.html` or introduce new software into the document without a full security review. 

---

**Features**:

 - Unified HTTP/REST interface (links, forms, and Ajax calls) for software running locally or remotely
 - Promises-based API (unstable)

**In Development**:

 - User-configurable applications
 - Core applications (search, rss, email, chat)

**Roadmap**:

 - In-session Worker editing
 - Peer-to-peer Ajax over WebRTC
 

## Documentation

[https://github.com/grimwire/grimwire/wiki](https://github.com/grimwire/grimwire/wiki)


## How does it work?

### Load Process

`/index.html` reads `/.host.json` on page-load to get a list of applications.

```json
{
 "applications":[
		"/apps/index.json",
		"/apps/rss.json"
	]
}
```

`/index.html` then reads each of the applications.

*index.json*

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

The workers are loaded and given the configuration in the JSON. The layout is then constructed and populated with the HTML from the given URLs.


### How is the session managed?

Grimwire provides 'httpl://storage.env' as a simple JSON document collection storage. It stores its data in the `sessionStorage` API, and is an ideal place for state to be kept (so the Workers can reload without losing data). The data in 'httpl://storage.env' can be exported and imported as JSON, allowing the user to resume a session by opening the file.

The API of 'httpl://storage.env':

 - `/`
   - GET: lists collections and the document keys within
   - POST: generates a unique, unused collection ID, then sets the empty collection there
 - '/:collection'
   - GET: lists the documents in the collection
   - POST: adds a document to the collection
   - DELETE: deletes the collection and its documents
 - '/:collection/:item'
   - GET: fetches the document
   - PUT: replaces the document
   - PATCH: updates the document (must exist first)
   - DELETE: deletes the document


### How is configuration managed?

Grimwire provides the 'httpl://config.env' interface, which initially loads the json files from the host, then loads configurations from 'httpl://config.env/applications' (starting with 'httpl://config.env/applications/.host') and layers those configurations over the host's. This is how the user is able to modify the configuration of the server. These tools will evolve over time; the goal is to merge configuration smartly enough that users can make targeted updates and not become disconnected from updates by the host. *The current mechanism is in development and should not be considered stable.*

Workers' `localApp.config` variables are populated with their configurations, which are merged with the 'common' object. They can always rely on the `localApp.config.domain` attribute to locate themselves.

All responses should include a 'Link' header, as it is used by the `Navigator` object to locate resources.

**TODO-- example code**


### How are sessions and credentials managed?

**TODO** (short answer, traffic is scrubbed, the environment keeps a map of session data to different domains, and it attaches that data to requests targeting those domains)


### How are permissions managed?

Permissions are not yet implemented. Do not load untrusted software!

Grimwire disables inline scripts and styles through [CSP](https://developer.mozilla.org/en-US/docs/Security/CSP), and does not load `<script>` or `<style>` scripts. It's recommended that you do not alter the CSP unless you can guarantee that only trusted software will be loaded.


### How do I build the UI without client-side styling or javascript?

**TODO** (short answer, response directives, server-sent events, twitter bootstrap styles and data-* apis for widgets)


### How do I host Grimwire?

**TODO** (short answer, statically, along with your Worker server js files and application configs)



## Project Status

Grimwire is currently in early development, and can be previewed at [http://grimwire.github.com/grimwire/](http://grimwire.github.com/grimwire/).

[@pfrazee](https://twitter.com/pfrazee)


## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
