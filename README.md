# Grimwire: a REST bOS

Using [Local](http://github.com/grimwire/local), Grimwire hosts Web servers in threads on the browser. This gives you (the user) control over software on the page, allowing you to change backends, mod interfaces, add features, and mashup the Web.

Highlights:

 - Modify and hot-swap Worker Servers in the session
 - Do peer-to-peer Ajax and share sessions over WebRTC
 - Easily store private data and sync between devices with [Unhosted's remoteStorage API](http://remotestorage.io/)
 - Leverage a unified HTTP/REST interface (links, forms, and Ajax calls) for software running locally or remotely

## How does it work?

HTML documents construct "Environments" to host user software. Each Environment is structured around a particular task &ndash; feed reading, email, search, social networking, development, etc &ndash; and provides tools, Web API, and layout for its hosted software to leverage.

Web Workers run as servers which handle HTTPL requests ([the L stands for "Local"](http://github.com/grimwire/local)). They provide HTML interfaces for the Environment, as well as APIs for other programs to run. To improve discoverability, the servers fill the [Link header](http://www.w3.org/wiki/LinkHeader) with available resources which can be [programmatically navigated](http://grimwire.com/local/docs.html#lib/linkjs/navigator.md).

These Worker servers, along with remote services, form a one-page [SOA](http://en.wikipedia.org/wiki/Service-oriented_architecture) which can be configured and customized for the user.

## Project Status

Grimwire is currently in early development, and can be previewed at [http://grimwire.github.com/grimwire/](http://grimwire.github.com/grimwire/). If you would like to join the project, contact Paul Frazee (pfrazee@gmail.com).

## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
