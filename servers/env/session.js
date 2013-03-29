// SessionServer
// =============
// HTTP access to session data
// :TODO:
// - link headers
function SessionServer() {
  Environment.Server.call(this);
  this.data = {};
}
SessionServer.prototype = Object.create(Environment.Server.prototype);

SessionServer.prototype.handleHttpRequest = function(request, response) {
  var self = this;
  var respond = Link.responder(response);
  Link.router(request)
    .pma('/', 'get', /json/, function() {
      // GET /
      respond.ok('json').end(self.data);
    })
    .pmt('/', 'post', /json|form/, function() {
      // POST /
      if (!request.body)
        return respond.badRequest('text').end('request body is required');

      var updates = [];
      for (var k in request.body) {
        self.data[k] = request.body[k];
        updates.push('<strong>'+k+'</strong> set to '+request.body[k]);
      }

      if (/html/.test(request.headers.accept))
        respond.ok('html').end(updates.join('<br/ >'));
      else
        respond.noContent().end();
    })
    .pma(RegExp('^/([A-z0-9_-])/?$'), 'get', /text/, function(match) {
      // GET /:key
      try {
        var v = self.data[match.path[1]];
        if (typeof v == 'undefined')
          respond.notFound().end();
        else
          respond.ok('text').end(v);
      } catch (e) {
        respond.badRequest('text').end(e.toString());
      }
    })
    .pmt(RegExp('^/([A-z0-9_-])/?$'), 'put', /text/, function(match) {
      // PUT /:key
      try {
        self.data[match.path[1]] = request.body;
        respond.noContent().end();
      } catch (e) {
        respond.badRequest('text').end(e.toString());
      }
    })
    .error(response);
};