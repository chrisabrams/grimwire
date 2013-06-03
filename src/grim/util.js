
// constructs the name of the function to handle the request based on:
// - path, with a /:collection/:item structure
// - method, with methods mapping to Get, Set, AddTo, or Delete
// eg:
// - POST /applications -> applications.httpAddToCollection(request, response)
// - DELETE /inbox/messages/1 -> inboxItems.deleteItem(request, response, id)
// params:
// - `methodMap` is an object of http verbs -> methods
//   - can also specify a _prefix for all methods (eg 'http')
// - `pathMap` is an object of path routes -> handler objects
//   - handler objects define the functions to call
//   - the path route can also map to an array with 2 members
//     - [0] = handler object
//     - [1] = path's postfix
function routeMap(request, response, methodMap, pathMap) {
  // alias the method if in the map
  // eg head -> get, patch -> set
  var method = request.method.toLowerCase();
  if (method in methodMap)
    method = methodMap[method];

  // add a prefix to the function name
  if (methodMap._prefix)
    method = methodMap._prefix+toUpperFirst(method);

  // find a matching route
  var path = request.path;
  for (var route in pathMap) {
    var match = makeRouteRegex(route).exec(path);
    if (match) {
      var handlerObj = pathMap[route];

      // add the path postfix if given
      if (Array.isArray(handlerObj)) {
        method += toUpperFirst(handlerObj[1]);
        handlerObj = handlerObj[0];
      }

      // try to find and call the function
      var args = [request, response].concat(match.slice(1));
      if (method in handlerObj) {
        request.body_.always(function() { // after the body comes in
          handlerObj[method].apply(handlerObj, args);
        });
        return;
      }
      else
        return response.writeHead(405, 'bad method').end();
    }
  }
  response.writeHead(404, 'not found').end();
}

// converts '/:tokenA/:tokenB' into a regex
function makeRouteRegex(route) {
  route = route.replace(/(:[^\/]+)/g, '([^/]+)'); // replace any ':token' with a regex
  if (route.slice(-1) == '/') // remove ending slash -- we'll add that
    route = route.slice(0,-1);
  return new RegExp('^'+route+'/?$', 'i');
}

// http://stackoverflow.com/questions/196972/convert-string-to-title-case-with-javascript
function toTitleCase(str) {
  return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
}

function toUpperFirst(str) {
  return str.charAt(0).toUpperCase() + str.substr(1);
}

// brings updates into org value
// :NOTE: mutates its first parameter out of laziness
function patch(org, update) {
  if (update === null) { return org; }
  if (!org) { org = {}; }
  for (var k in update) {
    if (typeof org[k] == 'object' && typeof update[k] == 'object')
      org[k] = patch(org[k], update[k]);
    else
      org[k] = update[k];
  }
  return org;
}

function deepClone(obj) {
  // http://jsperf.com/cloning-an-object/2
  // return JSON.parse(JSON.stringify(obj));
  return $.extend(true, {}, obj);
}