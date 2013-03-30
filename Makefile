src = src/
local = ${src}local/lib
local-worker-server-files =\
	${src}local/lib/worker-server.dev.js\
	${src}local/lib/worker-server.min.js

lib = lib/
lib-local = ${lib}local/
lib-local-worker-server-files =\
	worker-server.dev.js\
	worker-server.min.js

setup: clean concat

clean:
	-rm ${lib-local-worker-server-files}
	-rm -Rf ${lib-local}

concat: ${lib-local} ${lib-local-worker-server-files}
${lib-local}: ${local}
	cp -R ${local} ${lib-local}
${lib-local-worker-server-files}: ${local-worker-server-files}
	cp $^ .