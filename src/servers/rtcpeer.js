// WebRTC Peer Server
// ==================

(function() {

	var peerConstraints = {
		optional: [{ RtpDataChannels: true }]
	};
	var mediaConstraints = {
		optional: [],
		mandatory: { OfferToReceiveAudio: false, OfferToReceiveVideo: false }
	};
	var defaultIceServers = { iceServers: [{ url: 'stun:stun.l.google.com:19302' }] };

	// RTCPeerServer
	// =============
	// EXPORTED
	// server wrapper for WebRTC connections
	// - currently only supports Chrome
	// - `config.sigRelay`: a URI or navigator instance for a grimwire.com/rel/sse/relay
	// - `config.initiate`: should this peer send the offer? If false, will wait for one
	// - `chanOpenCb`: function, called when request channel is available
	var DEBUGname = 'A';
	function RTCPeerServer(config, chanOpenCb) {
		// :DEBUG:
		this.debugname = DEBUGname;
		DEBUGname = 'B';

		var self = this;
		local.env.Server.call(this);
		if (!config) config = {};
		if (!config.sigRelay) throw "`config.sigRelay` is required";
		var servers = defaultIceServers;
		if (config.iceServers)
			servers = config.iceServers.concat(servers); // :TODO: is concat what we want?

		// hook up to sse relay
		var signalHandler = onSigRelayMessage.bind(this);
		this.sigRelay = local.web.navigator(config.sigRelay);
		this.sigRelay.subscribe({ headers: { 'last-event-id': -1 } })
			.then(function(stream) {
				self.state.signaling = true;
				stream.on('message', signalHandler);
			});

		// create peer connection
		this.peerConn = new webkitRTCPeerConnection(servers, peerConstraints);
		this.peerConn.onicecandidate = onIceCandidate.bind(this);

		// create request data channel
		this.reqChannel = this.peerConn.createDataChannel('requestChannel', { reliable: false });
		setupRequestChannel.call(this);
		this.chanOpenCb = chanOpenCb;

		// internal state
		this.__offerOnReady = !!config.initiate;
		this.__isOfferExchanged = false;
		this.__candidateQueue = []; // cant add candidates till we get the offer
		this.__ridcounter = 1; // current request id
		this.__incomingRequests = {}; // only includes requests currently being received
		this.__incomingResponses = {}; // only includes responses currently being received
		this.__reqChannelBuffer = {}; // used to buffer messages that arrive out of order

		// internal state flags
		this.state = {
			alive: true,
			signaling: false,
			connected: false
		};

		this.signal({ type: 'ready' });
	}
	window.RTCPeerServer = RTCPeerServer;
	RTCPeerServer.prototype = Object.create(local.env.Server.prototype);

	RTCPeerServer.prototype.debugLog = function() {
		var args = [this.debugname].concat([].slice.call(arguments));
		console.debug.apply(console, args);
	};

	// request handler
	RTCPeerServer.prototype.handleHttpRequest = function(request, response) {
		var self = this;
		this.debugLog('HANDLING REQUEST', request);
		if (request.path == '/') {
			// self info
			response.setHeader('link', [
				{ href: '/', rel: 'self service via' },
				{ href: '/{id}', rel: 'http://grimwire.com/rel/proxy' }
				// :TODO: any links shared by the peer
			]);
			if (request.method == 'GET')
				response.writeHead(200, 'ok').end(this.state);
			else if (request.method == 'HEAD')
				response.writeHead(200, 'ok').end();
			else
				response.writeHead(405, 'bad method').end();
		} else {
			// proxy
			var targetUrl = decodeURIComponent(request.path.slice(1));
			var targetUrld = local.web.parseUri(targetUrl);
			var theirHost = targetUrld.authority ? (targetUrld.protocol + '://' + targetUrld.authority) : myHost;
			var myHost = 'httpl://'+self.config.domain+'/';
			var via = getViaDesc.call(this);

			var req2 = new local.web.Request(request);
			req2.url = targetUrl;
			req2.headers.via = (req2.headers.via) ? req2.headers.via.concat(via) : [via];
			
			req2.stream = true;
			this.peerDispatch(req2).always(function(res2) {
				res2.headers.via = (res2.headers.via) ? res2.headers.via.concat(via) : [via];

				if (res2.headers.link) {
					res2.headers.link.forEach(function(link) {
						var urld = local.web.parseUri(link.href);
						if (!urld.host) link.href = theirHost + link.href;
						link.href = myHost + link.href;
					});
				}

				response.writeHead(res2.status, res2.reason, res2.headers);
				res2.on('data', response.write.bind(response));
				res2.on('end', response.end.bind(response));
			});

			request.on('data', req2.write.bind(req2));
			request.on('end', req2.end.bind(req2));
		}
	};

	function getViaDesc() {
		return {
			protocol: { name:'httpl', version:'0.4' },
			host: this.config.domain,
			comment: 'Grimwire/0.2'
		};
	}

	RTCPeerServer.prototype.terminate = function() {
		// :TODO:
		this.state.alive = false;
		this.state.signaling = false;
		this.state.connected = false;
	};

	// sends a request to the peer to dispatch for us
	RTCPeerServer.prototype.peerDispatch = function(request) {
		var selfEnd = false, body = null;
		if (!(request instanceof local.web.Request)) {
			body = request.body;
			request = new local.web.Request(request);
			selfEnd = true;
		}

		// generate ids
		var reqid = this.__ridcounter++;
		var resid = -reqid;

		// track the response
		var response_ = local.promise();
		var response = new local.web.Response();
		if (request.stream) {
			// streaming, fulfill on 'headers'
			response.on('headers', function(response) {
				local.web.fulfillResponsePromise(response_, response);
			});
		} else {
			// buffering, fulfill on 'close'
			response.on('close', function() {
				local.web.fulfillResponsePromise(response_, response);
			});
		}
		this.__incomingResponses[resid] = response;

		// shuttle request across
		var reqmid = 0;
		var chan = this.reqChannelReliable;
		chan.send(reqid+':'+(reqmid++)+':h:'+JSON.stringify(request));
		request.on('data', function(data) { chan.send(reqid+':'+(reqmid++)+':d:'+data); });
		request.on('end', function() { chan.send(reqid+':'+(reqmid++)+':e'); });
		request.on('close', function() { chan.send(reqid+':'+(reqmid++)+':c'); });

		if (selfEnd) request.end(body);
		return response_;
	};

	// request channel traffic handling
	// - message format: <rid>:<mid>:<message type>[:<message data>]
	//   - rid: request/response id, used to group together messages
	//   - mid: message id, used to guarantee arrival ordering
	//   - message type: indicates message content
	//   - message data: optional, the message content
	// - message types:
	//   - 'h': headers* (new request)
	//   - 'd': data* (request content, may be sent multiple times)
	//   - 'e': end (request finished)
	//   - 'c': close (request closed)
	//   - *includes a message body
	// - responses use the negated rid (request=5 -> response=-5)
	function handleReqChannelReliableMessage(msg) {
		this.debugLog('REQ CHANNEL RELIABLE MSG', msg);

		var parsedmsg = parseReqChannelMessage(msg);
		if (!parsedmsg) return;

		ensureReqChannelOrder.call(this, parsedmsg, function() {
			if (parsedmsg[0] > 0)
				handlePeerRequest.apply(this, parsedmsg);
			else
				handlePeerResponse.apply(this, parsedmsg);
		});
	}

	function handlePeerRequest(reqid, mid, mtype, mdata) {
		var chan = this.reqChannelReliable;
		var request;
		if (mtype == 'h') {
			try { request = JSON.parse(mdata); }
			catch (e) { return console.warn('RTCPeerServer - Unparseable request headers message from peer', reqid, mtype, mdata); }

			request.stream = true;
			request = new local.web.Request(request);
			local.web.dispatch(request, this).always(function(response) {
				var resmid = 0;
				var resid = -reqid; // indicate response with negated request id
				chan.send(resid+':'+(resmid++)+':h:'+JSON.stringify(response));
				response.on('data', function(data) { chan.send(resid+':'+(resmid++)+':d:'+data); });
				response.on('end', function() { chan.send(resid+':'+(resmid++)+':e'); });
				response.on('close', function() { chan.send(resid+':'+(resmid++)+':c'); });
			});

			this.__incomingRequests[reqid] = request; // start tracking
		} else {
			request = this.__incomingRequests[reqid];
			if (!request) { return console.warn('RTCPeerServer - Invalid request id', reqid, mtype, mdata); }
			switch (mtype) {
				case 'd': request.write(mdata); break;
				case 'e': request.end(); break;
				case 'c':
					request.close();
					delete this.__incomingRequests[reqid];
					delete this.__reqChannelBuffer[reqid];
					break;
				default: console.warn('RTCPeerServer - Unrecognized message from peer', reqid, mtype, mdata);
			}
		}
	}

	function handlePeerResponse(resid, mid, mtype, mdata) {
		var response = this.__incomingResponses[resid];
		if (!response)
			return console.warn('RTCPeerServer - Invalid response id', resid, mtype, mdata);
		switch (mtype) {
			case 'h':
				try { mdata = JSON.parse(mdata); }
				catch (e) { return console.warn('RTCPeerServer - Unparseable response headers message from peer', resid, mtype, mdata); }
				response.writeHead(mdata.status, mdata.reason, mdata.headers);
				break;
			case 'd': response.write(mdata); break;
			case 'e': response.end(); break;
			case 'c':
				response.close();
				delete this.__incomingResponses[resid]; // stop tracking
				delete this.__reqChannelBuffer[resid];
				break;
			default: console.warn('RTCPeerServer - Unrecognized message from peer', resid, mtype, mdata);
		}
	}

	// splits the message into its parts
	// - format: <rid>:<message type>[:<message>]
	var reqChannelMessageRE = /([\-\d]+):([\-\d]+):(.)(:.*)?/;
	function parseReqChannelMessage(msg) {
		var match = reqChannelMessageRE.exec(msg);
		if (!match) { console.warn('RTCPeerServer - Unparseable message from peer', msg); return null; }
		var parsedmsg = [parseInt(match[1], 10), parseInt(match[2], 10), match[3]];
		if (match[4])
			parsedmsg.push(match[4].slice(1));
		return parsedmsg;
	}

	// tracks messages received in the request channel and delays processing if received out of order
	function ensureReqChannelOrder(parsedmsg, cb) {
		var rid = parsedmsg[0];
		var mid = parsedmsg[1];

		var buffer = this.__reqChannelBuffer[rid];
		if (!buffer)
			buffer = this.__reqChannelBuffer[rid] = { nextmid: 0, cbs: {} };

		if (mid > buffer.nextmid) { // not the next message?
			buffer.cbs[mid] = cb; // hold onto that callback
			this.debugLog('REQ CHANNEL MSG OoO, BUFFERING', parsedmsg);
		} else {
			cb.call(this);
			buffer.nextmid++;
			while (buffer.cbs[buffer.nextmid]) { // burn through the queue
				this.debugLog('REQ CHANNEL DRAINING OoO MSG', buffer.nextmid);
				buffer.cbs[buffer.nextmid].call(this);
				delete buffer.cbs[buffer.nextmid];
				buffer.nextmid++;
			}
		}
	}

	function setupRequestChannel() {
		this.reqChannelReliable = new Reliable(this.reqChannel); // :DEBUG: remove when reliable: true is supported
		this.reqChannel.onopen = onReqChannelOpen.bind(this);
		this.reqChannel.onclose = onReqChannelClose.bind(this);
		this.reqChannel.onerror = onReqChannelError.bind(this);
		// this.reqChannel.onmessage = handleReqChannelMessage.bind(this);
		this.reqChannelReliable.onmessage = handleReqChannelReliableMessage.bind(this);
	}

	function onReqChannelOpen(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL OPEN', e);
		this.state.connected = true;
		if (typeof this.chanOpenCb == 'function')
			this.chanOpenCb();
		// this.reqChannel.send('Hello! from '+this.debugname);
		// this.reqChannelReliable.send('Reliable Hello! from '+this.debugname);
	}

	function onReqChannelClose(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL CLOSE', e);
	}

	function onReqChannelError(e) {
		// :TODO:
		this.debugLog('REQ CHANNEL ERR', e);
	}

	// function handleReqChannelMessage(e) {
	// 	// :TODO:
	// 	this.debugLog('REQ CHANNEL MSG', e);
	// }

	// called when we receive a message from the relay
	function onSigRelayMessage(m) {
		var self = this;
		var from = m.event, data = m.data;

		if (data && typeof data != 'object') {
			console.warn('RTCPeerServer - Unparseable signal message from'+from, m);
			return;
		}

		// this.debugLog('SIG', m, from, data.type, data);
		switch (data.type) {
			case 'ready':
				// peer's ready to start
				if (this.__offerOnReady)
					sendOffer.call(this);
				break;

			case 'candidate':
				this.debugLog('GOT CANDIDATE', data.candidate);
				// received address info from the peer
				if (!this.__isOfferExchanged) this.__candidateQueue.push(data.candidate);
				else this.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: data.candidate }));
				break;

			case 'offer':
				this.debugLog('GOT OFFER', data);
				// received a session offer from the peer
				this.peerConn.setRemoteDescription(new RTCSessionDescription(data));
				handleOfferExchanged.call(self);
				this.peerConn.createAnswer(
					function(desc) {
						self.debugLog('CREATED ANSWER', desc);
						desc.sdp = Reliable.higherBandwidthSDP(desc.sdp); // :DEBUG: remove when reliable: true is supported
						self.peerConn.setLocalDescription(desc);
						self.signal({
							type: 'answer',
							sdp: desc.sdp
						});
					},
					null,
					mediaConstraints
				);
				break;

			case 'answer':
				this.debugLog('GOT ANSWER', data);
				// received session confirmation from the peer
				this.peerConn.setRemoteDescription(new RTCSessionDescription(data));
				handleOfferExchanged.call(self);
				break;

			default:
				console.warn('RTCPeerServer - Unrecognized signal message from'+from, m);
		}
	}

	// helper to send a message to peers on the relay
	RTCPeerServer.prototype.signal = function(data) {
		this.sigRelay.dispatch({
			method: 'notify',
			headers: {
				authorization: this.sigRelay.authHeader,
				'content-type': 'application/json'
			},
			body: data
		}).then(null, function(res) {
			console.warn('RTCPeerServer - Failed to send signal message to relay', res);
		});
	};

	// helper initiates a session with peers on the relay
	function sendOffer() {
		var self = this;
		this.peerConn.createOffer(
			function(desc) {
				self.debugLog('CREATED OFFER', desc);
				desc.sdp = Reliable.higherBandwidthSDP(desc.sdp); // :DEBUG: remove when reliable: true is supported
				self.peerConn.setLocalDescription(desc);
				self.signal({
					type: 'offer',
					sdp: desc.sdp
				});
			},
			null,
			mediaConstraints
		);
	}

	// helper called whenever we have a remote session description
	// (candidates cant be added before then, so they're queued in case they come first)
	function handleOfferExchanged() {
		var self = this;
		this.__isOfferExchanged = true;
		this.__candidateQueue.forEach(function(candidate) {
			self.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: candidate }));
		});
		this.__candidateQueue.length = 0;
	}

	// called by the RTCPeerConnection when we get a possible connection path
	function onIceCandidate(e) {
		if (e && e.candidate) {
			this.debugLog('FOUND ICE CANDIDATE', e.candidate);
			// send connection info to peers on the relay
			this.signal({
				type: 'candidate',
				candidate: e.candidate.candidate
			});
		}
	}
})();