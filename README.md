# Grimwire, a REST Web OS (v0.1.1)

Grimwire is a Web client framework which runs RESTful servers inside of [Web Workers](https://developer.mozilla.org/en-US/docs/DOM/Using_web_workers). Its page is broken into independent regions which navigate Worker URLs (under the `httpl://` protocol). It is made to be a secure, user-configurable platform for social software-sharing.

Apps on Grimwire (including their source code) can be shared and modified in-session by users, and do not require a backend service to operate. Workers can be reused between apps - in fact, apps are just arrays of Workers configured together. With no client-side Javascript (all Workers are servers) Grimwire can enforce permissions and compose UIs in a shared layout, making it an ideal platform for reusable, user-driven Web software.

**Completed Features**

 - Multi-threaded Web applications with well-structured, strongly-encapsulated Worker programs
 - Unified HTTP messaging (links, forms, and Ajax calls) for software running locally or remotely
 - Promises-based API
 - JSON-configurable applications
 - In-browser Worker editing

**In Development**

 - Core applications (search, rss, email, chat)

**Roadmap**

 - User remote sessions and credential management
 - Permissions policies
 - sessionStorage export/import to file
 - Peer-to-peer Ajax over WebRTC


## Project Status

Grimwire is currently in early development, and can be previewed at [http://grimwire.github.com/grimwire/](http://grimwire.github.com/grimwire/). Grimwire is a deployment of the [Local API](https://github.com/grimwire/local), a toolset for program architectures (also in active development). /[@pfrazee](https://twitter.com/pfrazee)

At this time, Chrome 26, Firefox 21, Opera 12.12, and Safari 5.1.7 (Windows &amp; iOS) have been tested and appear to work correctly. Internet Explorer is not yet supported.

**Content Security Policies.** CSP are an important part of Grimwire's security model. However, Safari 5 does not correctly support them (breaking the page) and Firefox does not yet allow the directive through the `<meta>` tag (they must be set through response headers). As a result, in Grimwire's default settings, only recent versions of Chrome are protected from client-side code injection. If untrusted code or content will be run on your site, make sure CSPs are in use!


## Documentation

### [Documentation App](http://grimwire.github.com/grimwire/#docs)
### [Local, the Core API](http://grimwire.com/local/docs.html#readme.md)


## Getting Started

The latest stable build of Grimwire is kept active at [http://grimwire.github.io/grimwire/](http://grimwire.github.io/grimwire/).

To host your own deployment:

```
git clone https://github.com/grimwire/grimwire.git grimwire
cd grimwire
python -m SimpleHTTPServer
# open http://localhost:8000
```

## Hosting

The default configuration is supplied in `.host.json`, which Grimwire fetches at load.

```json
{
  "applications":[
    "webmail.json",
    "/apps/rss.json",
    "http://otherhost.com/chat.json"
  ]
}
```


## Applications

Applications are built out of one or more Workers, as specified in its config json:

```json
{
  "id": "mail",
  "title": "Webmail",
  "icon": "inbox",
  "workers": [
    { "domain": "topnav.usr", "title":"Top Navigation", "src":"/webmail/nav.js" },
    { "domain": "inbox.usr", "title": "Inbox", "src": "http://otherhost.com/workers/inbox.js", "inboxHost":"gmail.com" },
    { "domain": "contacts.usr", "title": "Address Book", "src": "/workers/contacts.js" }
  ],
  "common": {
    "grimHost": "http://grimwire.com",
    "storageHost": "httpl://sessionstorage.env"
  }
}
```


## Workers

Workers are defined as Web servers. They are capable of importing modules and templates using `require()`. All Workers must define a `main` function to handle requests.

```javascript
var marked = require('vendor/marked.js');
marked.setOptions({ gfm: true, tables: true });

function headerRewrite(headers) {
  headers['content-type'] = 'text/html';
  return headers;
}
function bodyRewrite(md) { return (md) ? marked(md) : ''; }

function main(request, response) {
  var mdRequest = local.http.dispatch({
    method  : 'get',
    url     : local.worker.config.baseUrl + request.path,
    headers : { accept:'text/plain' }
  });
  local.http.pipe(response, mdRequest, headerRewrite, bodyRewrite);
}
```


## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
