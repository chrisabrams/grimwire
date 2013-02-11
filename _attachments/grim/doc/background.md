## Technical Background

The Web uses a very simple program load model which is both a source of strength and weakness for web apps. <a href="http://www.cs.utexas.edu/~mwalfish/papers/zoog-hotnets11.pdf" target="_top">Some particular properties are collected in a paper by Microsoft and UTexas researchers</a> -- they list the positive traits as Isolation, Richness, On-demand, and Networked (IRON). Broadly speaking, they argue that without the IRON properties, the Web would be too dangerous or too unsophisticated to get any use of.

What the Web lacks, however, is a structured environment for client-side scripts to co-operate. We now have <a href="http://stackoverflow.com/questions/12209657/how-can-i-sandbox-untrusted-user-submitted-javascript-content" target="_top">Web Workers, which can safely sandbox a script, but they can't touch the DOM API</a>. That limits their use for general-purpose applications. The other option- the iframe- is kept in the same thread as the parent document, making denial-of-service attacks possible on the processor. Neither option is structured for configurability.

Without a client-side program environment, the client has limited means to inject its own software into the service stack. Sites will usually serve one UI with one feature-set, and then go no further because they can't compose with other apps. Of our other options, Greasemonkey tends to only decorate UIs, and third-party sites are still one UI with one feature-set. A more robust, IRON alternative is needed, which is the motivation for <a href="httpl://grimwire.com/local" target="_top" title="Local">Local</a>, and this deployment of Local, <a href="http://grimwire.com" title="Grimwire" target="_top">Grimwire</a>.

### Overview

Web Workers can be made to communicate effectively when you think of them as remote services-- the constraints are largely the same. The only real difference is latency which is, in this case, negligible. With a good messaging protocol, Workers should be no less effective than a Web Server. A few options were examined-- a file-system abstraction (like Plan9), an RPC mechanism (like <a href="https://github.com/lawnsea/TreeHouse" target="_top">https://github.com/lawnsea/TreeHouse</a>)-- but the final choice was an emulation of HTTP called HTTPLocal. I'll discuss the results of this choice below.

Once the client is structured, then it's also configurable. Users can choose scripts to populate the client, and those applications can operate as processes do in an operating system. Note, however, that the client structure is not enforced across domains, because the browser is unaltered. Rather, the structure-- the client environment-- is delivered in a document, just as any other web app. The user applications load subsequently and behave according to the document's rules.

This has the advantage that any site to deliver a custom application platform for their users to leverage. The added flexibility makes it possible for developers to experiment with different approaches to the program model and environment UX. The disadvantage, however, is the lack of consistency guarantees across hosts. Users must trust the domain serving the client environment, both in terms of correctness and good-intent. If the document itself is compromised, the security model fails completely.

### The HTTPLocal Architecture

HTTPLocal answers a number of questions for app coordination. For one, it establishes a program model-- the stateless server and its detached clients. Even though the Local servers are on the client-side, they are still, philosophically, web-servers; they never bind directly to the client. Thus, the DOM API's absence is not a problem. This does require some additions to DOM behavior so that applications can behave richly, but this is easy to do through the environment document (it merely binds new behaviors across the page). Current common behaviors support real-time UI updates, and, while it is limited compared to direct DOM access, it should cover a broad set of needs.

Composition is made possible in this architecture. It's largely built around message formation and routing, which can be managed at runtime with tools like unix's CLIE pipe, or with existing Web interfaces like links and forms. (Because links and forms are able to target 'httpl://' servers, no explicit event-binding is required. This tends to simplify interface construction.) A common use-case for apps is to act as proxies to data services. For instance, the documentation for Local is written in markdown, and a Local markdown-to-html proxy serves them to the page. This is fairly easy to set up- instantiate the Local markdown proxy, point it to the markdown host, and add links to the various documents.

For programmatic interfaces, Local uses the Link header, which simplifies the task of finding the links (compared to searching the response body). Using rel attributes as a primary description, title attributes as names, and URI templates, services are able export APIs which clients navigate without too much out-of-band knowledge. Rather than construct a URI, the client will, for example, open a navigator to the service, navigate to a collection, navigate to an item, and issue a request. The client could feasibly swap out the provider so long as the replacement offers equivalent links.

The Server-Sent Events protocol has been built into the HTTPL API, so programs are able to request subscriptions to each other. This is useful for maintaining sync across detached components, and for pushing realtime updates from a service out to its clients. In fact, one custom DOM behavior is a directive which subscribes the element to an app's SSEs, allowing the server to command UI refreshes.

Security decisions are made based on request origin and the features of the request. The environment intermediates all requests made, so it is able to do any routing, logging, or denial it deems necessary. Sessions with remote services should be managed here, and policies should be carefully constructed to keep credentials from ever leaking back into the apps.

### Continuing from Here

The experiments so far with Local and Grimwire have been promising, but limited. Applications have been generally simple, and no deployments are active yet. This is the next step.

Grimwire is billed as "the in-browser online operating system and social computing network." With proper permissioning, any interface can open into our workspace and work for us. Unlike with remote applications, local apps can be given sensitive data without risking a leak: there's no third-party server logging the traffic. Applications like Mint, which require access to your financial information to work, could be hosted in your banking host's platform with no means to leak the data out.

The traditional barrier to network interoperability is application-level protocol; you have to implement a consumer to another service's API if you want your app to interface with that service. Until that is solved, it's unlikely that closed-garden services will diminish, because users won't be able to fluidly connect across the protocol barriers. I'm optimistic that Grimwire/Local can solve this problem by delivering interfaces horizontally, in the form of a Local app. This is the same mechanism that we use currently with browsers-- the delivery of application code into the browser-- but in a mixed environment. Users might leverage this to give each-other ad-hoc tools for communicating, scheduling, sharing pictures, and so on.

In the realm of user-to-user, it should be relatively trivial to implement HTTPL over the upcoming WebRTC interface. This opens the opportunity for peer networks of Web servers, further diminishing the importance of centralized hosts.

All of this will be tested, in time, on Grimwire. The software is open-source, and Grim should continue to be completely open to public use. The backend service is CouchDB, which has a similar philosophy and offers a lot of tools for extension. If the demand is there, Grimwire will be offered for continuous replication over CouchDB's API, allowing private deployments which are kept seamlessly up-to-date. If not, the source will still be available as a git repo.

Thanks for reading; I hope you enjoy using Grimwire and Local!

~pfraze