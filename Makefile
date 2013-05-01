src = src/
local = ${src}local/lib
local-worker-files =\
	${src}local/lib/worker.min.js

lib = lib/
lib-local = ${lib}local/
lib-local-worker-files =\
	worker.min.js

setup: clean concat

clean:
	-rm ${lib-local-worker-files}
	-rm -Rf ${lib-local}

concat: ${lib-local} ${lib-local-worker-files}
${lib-local}: ${local}
	cp -R ${local} ${lib-local}
${lib-local-worker-files}: ${local-worker-files}
	cp $^ .