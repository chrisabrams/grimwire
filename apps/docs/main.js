var templates = {
	intro: require('templates/intro.html')
};

function main(request, response) {
	response.writeHead(200, 'ok', {'content-type':'text/html'});
	response.end(templates.intro);
}