src = src/
src-local-files =\
	${src}local/lib/local.min.js\
	${src}local/lib/local.js
src-local-worker-files =\
	${src}local/worker.min.js\
	${src}local/worker.js
src-grim-files =\
	${src}grim/util.js\
	${src}grim/regions.js\
	${src}grim/cookies.js\
	${src}grim/transform-links.js
src-servers-files =\
	${src}local/servers/env/storage.js\
	${src}servers/config.js\
	${src}servers/rtcpeer.js
src-widgets-files =\
	${src}widgets/_compiled_header.js\
	${src}widgets/lifespan.js\
	${src}widgets/value_of.js\
	${src}widgets/dismiss-region.js\
	${src}widgets/_compiled_footer.js

lib = lib/
lib-local-files =\
	lib/local.min.js\
	lib/local.js
lib-local-worker-files =\
	worker.min.js\
	worker.js

setup: clean concat buildmin
	@echo Done!

clean:
	@-rm ${lib-local-worker-files}
	@-rm -Rf ${lib-local-files}
	@-rm ${lib}grim.js
	@-rm ${lib}index.js ${lib}index.css
	@echo Cleaned Out Old Libraries

concat: ${lib-local-files} ${lib-local-worker-files} ${lib}grim.js ${lib}index.js ${lib}index.css
	@echo Concatted Libraries
${lib-local-files}: ${src-local-files}
	@cp $^ lib
${lib-local-worker-files}: ${src-local-worker-files}
	@cp $^ .
${lib}grim.js: ${src-grim-files} ${src-servers-files} ${src-widgets-files}
	@cat > $@ $^
${lib}index.js: ${src}index.js
	@cp $^ lib
${lib}index.css: ${src}index.css
	@cp $^ lib

buildmin: ${lib}grim.min.js
	@echo Built Minified Versions
${lib}grim.min.js: ${lib}grim.js
	@./src/local/minify.sh $@ $^

deps: uglifyjs localjs
localjs:
	-git clone git://github.com/grimwire/local.git src/local
uglifyjs:
	-git clone git://github.com/mishoo/UglifyJS2.git vendor/UglifyJS2
	(cd vendor/UglifyJS2 && npm link .)