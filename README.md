# Grimwire: a desktop environment in the browser

*Grimwire is not ready for deployment, so setup instructions are not yet provided. The beta will be released soon.*

## Background

The browser is a relatively secure but rigid environment. <a href="http://www.cs.utexas.edu/~mwalfish/papers/zoog-hotnets11.pdf">A paper by Microsoft and UTexas researchers</a> lists its traits as Isolated, Rich, On-demand, and Networked (IRON). Broadly speaking, they argue that without the IRON properties, the Web would be too dangerous or too unsophisticated to get any use of.

The browser is bad at injecting its own software; Greasemonkey tends to only decorate UIs, and browser apps (which Chrome offers) live in isolation of each other, just like websites do. We now have Web Workers, <a href="http://stackoverflow.com/questions/12209657/how-can-i-sandbox-untrusted-user-submitted-javascript-content"> which can safely sandbox a script</a>, but can't touch the DOM API. The other option&mdash;the iframe&mdash;is kept in the same thread as the parent document, making denial-of-service attacks on the processor possible. Neither option is structured for configurability.

## Overview

<a href="httpl://grimwire.com/local">Local</a> was created to structure Web Workers into a configurable environment. It uses HTTPL to communicate with the programs, and enforces security through a central messaging router. Common client behaviors remove the need for Workers to touch the document, instead allowing them to control the UI with markup directives. These tools can be hosted statically at any website to host user applications.

Grimwire is a general-purpose deployment of Local. Its target is to be an easily-moddable, easily-deployable web desktop environment. The features are still in development, and will be added gradually as their needs become clear. Currently implemented or planned:

 - User data management, permissioning, and publishing
 - App capabilities control for executing untrusted software
 - In-browser development tools with services for storing and serving scripts
 - A well-documented API for modding and extending the UI
 - A powerful, composable interface built around Local's messaging system

## License

The MIT License (MIT)
Copyright (c) 2012 Paul Frazee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
