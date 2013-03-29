<ul class="nav nav-pills">
    <li class="active"><a href="httpl://v1.pfraze.markdown.convert.app/?url=/doc/background.md">Technical Background</a></li>
    <li><a href="httpl://v1.pfraze.markdown.convert.app/?url=/doc/overview.md">Project Overview</a></li>
</ul>

<strong class="label">The Browser</strong> is a relatively secure but rigid environment. <a href="http://www.cs.utexas.edu/~mwalfish/papers/zoog-hotnets11.pdf" target="_top">A paper by Microsoft and UTexas researchers</a> lists its traits as Isolated, Rich, On-demand, and Networked (IRON). Broadly speaking, they argue that without the IRON properties, the Web would be too dangerous or too unsophisticated to get any use of.

<strong class="label">The Browser</strong> is bad at injecting its own software; Greasemonkey tends to only decorate UIs, and browser apps (which Chrome offers) live in isolation of each other, just like websites do. We now have Web Workers, <a href="http://stackoverflow.com/questions/12209657/how-can-i-sandbox-untrusted-user-submitted-javascript-content" target="_top"> which can safely sandbox a script</a>, but can't touch the DOM API. The other option&mdash;the iframe&mdash;is kept in the same thread as the parent document, making denial-of-service attacks on the processor possible. Neither option is structured for configurability.

<a href="httpl://v1.pfraze.markdown.convert.app/?url=/doc/overview.md">Project Overview &raquo;</a>