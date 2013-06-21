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
		this.__incomingRequests = {};
		this.__incomingResponses = {};

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

	// request handler
	RTCPeerServer.prototype.handleHttpRequest = function(request, response) {
		var self = this;
		console.debug(this.debugname, 'HANDLING REQUEST', request);
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
		var chan = this.reqChannelReliable;
		chan.send(reqid+':h:'+JSON.stringify(request));
		request.on('data', function(data) { chan.send(reqid+':d:'+data); });
		request.on('end', function() { chan.send(reqid+':e'); });
		request.on('close', function() { chan.send(reqid+':c'); });

		if (selfEnd) request.end(body);
		return response_;
	};

	// request channel traffic handling
	// - message format: <rid>:<message type>[:<message>]
	// - message types:
	//   - 'h': headers* (new request)
	//   - 'd': data* (request content, may be sent multiple times)
	//   - 'e': end (request finished)
	//   - 'c': close (request closed)
	//   - *includes a message body
	// - responses use the negated rid (request=5 -> response=-5)
	function handleReqChannelReliableMessage(msg) {
		console.debug(this.debugname, 'REQ CHANNEL RELIABLE MSG', msg);

		var parsedmsg = parseReqChannelMessage(msg);
		if (!parsedmsg) return;

		if (parsedmsg[0] > 0)
			handlePeerRequest.apply(this, parsedmsg);
		else
			handlePeerResponse.apply(this, parsedmsg);
	}

	function handlePeerRequest(reqid, mtype, mdata) {
		var chan = this.reqChannelReliable;
		var request;
		if (mtype == 'h') {
			try { request = JSON.parse(mdata); }
			catch (e) { return console.warn('RTCPeerServer - Unparseable request headers message from peer', reqid, mtype, mdata); }

			request.stream = true;
			request = new local.web.Request(request);
			local.web.dispatch(request, this).always(function(response) {
				var resid = -reqid; // indicate response with negated request id
				chan.send(resid+':h:'+JSON.stringify(response));
				response.on('data', function(data) { chan.send(resid+':d:'+data); });
				response.on('end', function() { chan.send(resid+':e'); });
				response.on('close', function() { chan.send(resid+':c'); });
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
					break;
				default: console.warn('RTCPeerServer - Unrecognized message from peer', reqid, mtype, mdata);
			}
		}
	}

	function handlePeerResponse(resid, mtype, mdata) {
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
				break;
			default: console.warn('RTCPeerServer - Unrecognized message from peer', resid, mtype, mdata);
		}
	}

	// splits the message into its parts
	// - format: <rid>:<message type>[:<message>]
	function parseReqChannelMessage(msg) {
		var i1 = msg.indexOf(':');
		var i2 = msg.indexOf(':', i1+1);
		if (i1 === -1) { console.warn('RTCPeerServer - Unparseable message from peer', msg); return null; }
		if (i2 === -1)
			return [parseInt(msg.slice(0, i1), 10), msg.slice(i1+1)];
		return [parseInt(msg.slice(0, i1), 10), msg.slice(i1+1, i2), msg.slice(i2+1)];
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
		console.debug(this.debugname, 'REQ CHANNEL OPEN', e);
		this.state.connected = true;
		if (typeof this.chanOpenCb == 'function')
			this.chanOpenCb();
		// this.reqChannel.send('Hello! from '+this.debugname);
		// this.reqChannelReliable.send('Reliable Hello! from '+this.debugname);
	}

	function onReqChannelClose(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL CLOSE', e);
	}

	function onReqChannelError(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL ERR', e);
	}

	// function handleReqChannelMessage(e) {
	// 	// :TODO:
	// 	console.debug(this.debugname, 'REQ CHANNEL MSG', e);
	// }

	// called when we receive a message from the relay
	function onSigRelayMessage(m) {
		var self = this;
		var from = m.event, data = m.data;

		if (data && typeof data != 'object') {
			console.warn('RTCPeerServer - Unparseable signal message from'+from, m);
			return;
		}

		// console.debug(this.debugname, 'SIG', m, from, data.type, data);
		switch (data.type) {
			case 'ready':
				// peer's ready to start
				if (this.__offerOnReady)
					sendOffer.call(this);
				break;

			case 'candidate':
				console.debug(this.debugname, 'GOT CANDIDATE', data.candidate);
				// received address info from the peer
				if (!this.__isOfferExchanged) this.__candidateQueue.push(data.candidate);
				else this.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: data.candidate }));
				break;

			case 'offer':
				console.debug(this.debugname, 'GOT OFFER', data);
				// received a session offer from the peer
				this.peerConn.setRemoteDescription(new RTCSessionDescription(data));
				handleOfferExchanged.call(self);
				this.peerConn.createAnswer(
					function(desc) {
						console.debug(self.debugname, 'CREATED ANSWER', desc);
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
				console.debug(this.debugname, 'GOT ANSWER', data);
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
				console.debug(self.debugname, 'CREATED OFFER', desc);
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
			console.debug(this.debugname, 'FOUND ICE CANDIDATE', e.candidate);
			// send connection info to peers on the relay
			this.signal({
				type: 'candidate',
				candidate: e.candidate.candidate
			});
		}
	}
})();