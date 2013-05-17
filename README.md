# Grimwire, the REST Browser OS (v0.0.1 unstable)

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

Grimwire is currently in early development, and can be previewed at [http://grimwire.github.com/grimwire/](http://grimwire.github.com/grimwire/). Grimwire is a deployment of the [Local API](https://github.com/grimwire/local), a toolset for building browser operating systems (also in active development). /[@pfrazee](https://twitter.com/pfrazee)


## Documentation

### [Documentation App](http://grimwire.github.com/grimwire/)
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



## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
