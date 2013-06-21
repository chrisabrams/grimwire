// WebRTC Peer Server
// ==================

(function() {

	var mediaConstraints = {
		optional: [],
		mandatory: { OfferToReceiveAudio: false, OfferToReceiveVideo: false }
	};

	// RTCPeerServer
	// =============
	// EXPORTED
	// server wrapper for WebRTC connections
	// - currently only supports Chrome
	// - `config.sigRelay`: a URI or navigator instance for a grimwire.com/rel/sse/relay
	// - `config.initiate`: should this peer send the offer? If false, will wait for one
	var DEBUGname = 'A';
	function RTCPeerServer(config) {
		// :DEBUG:
		this.debugname = DEBUGname;
		DEBUGname = 'B';

		local.env.Server.call(this);
		if (!config) config = {};
		if (!config.sigRelay) throw "`config.sigRelay` is required";
		var servers = { 'iceServers': [{ 'url': 'stun:stun.l.google.com:19302' }] };
		if (config.iceServers)
			servers = config.iceServers.concat(servers); // :TODO: is concat what we want?

		// hook up to sse relay
		var signalHandler = onSigRelayMessage.bind(this);
		this.sigRelay = local.web.navigator(config.sigRelay);
		this.sigRelay.subscribe({ headers: { 'last-event-id': -1 } })
			.then(function(stream) {
				stream.on('message', signalHandler);
			});

		// create peer connection
		this.peerConn = new webkitRTCPeerConnection(servers, { optional: [{RtpDataChannels: true}] });
		this.peerConn.onicecandidate = onIceCandidate.bind(this);

		// create request data channel
		this.reqChannel = this.peerConn.createDataChannel('requestChannel', { reliable: false });
		setupRequestChannel.call(this);

		// state handling
		this.isOfferExchanged = false;
		this.queuedCandidates = []; // cant add candidates till we get the offer
		this.ridcounter = 1; // current request id

		this.notifySignal({ type: 'ready' });
		this.offerOnReady = config.initiate;
	}
	window.RTCPeerServer = RTCPeerServer;
	RTCPeerServer.prototype = Object.create(local.env.Server.prototype);

	// request handler
	RTCPeerServer.prototype.handleHttpRequest = function(request, response) {
		// :TODO:
	};

	RTCPeerServer.prototype.terminate = function() {
		// :TODO:
	};

	// sends a request to the peer to dispatch for us
	RTCPeerServer.prototype.peerDispatch = function(request) {
		var selfEnd = false;
		if (!(request instanceof local.web.Request)) {
			request = new local.web.Request(request);
			selfEnd = true;
		}

		var chan = this.reqChannelReliable;
		var rid = this.ridcounter++;
		chan.send(rid+':h:'+JSON.stringify(request));
		request.on('data', function(data) { chan.send(rid+':d:'+data); });
		request.on('end', function() { chan.send(rid+':e'); });
		request.on('close', function() { chan.send(rid+':c'); });

		// :TODO: track response

		if (selfEnd) request.end();
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
		var self = this;
		var chan = this.reqChannelReliable;
		console.debug(this.debugname, 'REQ CHANNEL RELIABLE MSG', msg);

		// parse
		var rid, mtype, mdata;
		var parsedmsg = parseReqChannelMessage(msg);
		if (!parsedmsg) return;
		rid = parsedmsg[0]; mtype = parsedmsg[1]; mdata = parsedmsg[2];

		if (rid > 0) {
			// handle request from peer
			var request;
			if (mtype == 'h') {
				try { request = JSON.parse(mdata); }
				catch (e) { return console.warn('RTCPeerServer - Unparseable request headers message from peer', msg); }

				// :DEBUG: just pipe out directly
				request.stream = true;
				request = new local.web.Request(request);
				local.web.dispatch(request, this).always(function(response) {
					// send response with negated request id
					chan.send((-rid)+':h:'+JSON.stringify(response));
					response.on('data', function(data) { chan.send((-rid)+':d:'+data); });
					response.on('end', function() { chan.send((-rid)+':e'); });
					response.on('close', function() { chan.send((-rid)+':c'); });
				});

				// :TODO: track request
			} else {
				request = throw "getrequest(rid)";
				if (!request) { return console.warn('RTCPeerServer - Invalid request id', msg); }
				switch (mtype) {
					case 'd': request.write(mdata); break;
					case 'e': request.end(); break;
					case 'c': request.close(); break;
					default: console.warn('RTCPeerServer - Unrecognized message from peer', msg);
				}
			}
		} else {
			// handle response from peer
			var response;
			response = throw "getresponse(-rid)";
			if (!response) { return console.warn('RTCPeerServer - Invalid response id', msg); }
			switch (mtype) {
				case 'h':
					try { mdata = JSON.parse(mdata); }
					catch (e) { return console.warn('RTCPeerServer - Unparseable response headers message from peer', msg); }
					response.writeHead(mdata.status, mdata.reason, mdata.headers);
					break;
				case 'd': response.write(mdata); break;
				case 'e': response.end(); break;
				case 'c': response.close(); break;
				default: console.warn('RTCPeerServer - Unrecognized message from peer', msg);
			}
		}
	}

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
				if (this.offerOnReady)
					sendOffer.call(this);
				break;

			case 'candidate':
				console.debug(this.debugname, 'GOT CANDIDATE', data.candidate);
				// received address info from the peer
				if (!this.isOfferExchanged) this.queuedCandidates.push(data.candidate);
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
						self.notifySignal({
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
	RTCPeerServer.prototype.notifySignal = function(data) {
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
				self.notifySignal({
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
		this.isOfferExchanged = true;
		this.queuedCandidates.forEach(function(candidate) {
			self.peerConn.addIceCandidate(new RTCIceCandidate({ candidate: candidate }));
		});
		this.queuedCandidates.length = 0;
	}

	// called by the RTCPeerConnection when we get a possible connection path
	function onIceCandidate(e) {
		if (e && e.candidate) {
			console.debug(this.debugname, 'FOUND ICE CANDIDATE', e.candidate);
			// send connection info to peers on the relay
			this.notifySignal({
				type: 'candidate',
				candidate: e.candidate.candidate
			});
		}
	}
})();