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

		this.notifySignal({ type: 'ready' });
		this.offerOnReady = config.initiate;
	}
	window.RTCPeerServer = RTCPeerServer;
	RTCPeerServer.prototype = Object.create(local.env.Server.prototype);

	// initiates a session with peers on the relay
	RTCPeerServer.prototype.sendOffer = function() {
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
	};

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

	function setupRequestChannel() {
		// :DEBUG: remove when reliable: true is supported
		this.reqChannelReliable = new Reliable(this.reqChannel);
		this.reqChannel.onopen = onReqChannelOpen.bind(this);
		this.reqChannel.onclose = onReqChannelClose.bind(this);
		this.reqChannel.onerror = onReqChannelError.bind(this);
		// this.reqChannel.onmessage = onReqChannelMessage.bind(this);
		this.reqChannelReliable.onmessage = onReqChannelReliableMessage.bind(this);
	}

	function onReqChannelOpen(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL OPEN', e);
		// this.reqChannel.send('Hello! from '+this.debugname);
		this.reqChannelReliable.send('Reliable Hello! from '+this.debugname);
	}

	function onReqChannelClose(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL CLOSE', e);
	}

	function onReqChannelError(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL ERR', e);
	}

	function onReqChannelMessage(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL MSG', e);
	}

	function onReqChannelReliableMessage(e) {
		// :TODO:
		console.debug(this.debugname, 'REQ CHANNEL MSG', e);
	}

	// called when we receive a message from the relay
	function onSigRelayMessage(m) {
		var self = this;
		var from = m.event, data = m.data;

		// :TODO: validate from?

		// console.debug(this.debugname, 'SIG', m, from, data.type, data);

		switch (data.type) {
			case 'ready':
				// peer's ready to start
				if (this.offerOnReady)
					this.sendOffer();
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

	// request handler, should be overwritten by subclasses
	RTCPeerServer.prototype.handleHttpRequest = function(request, response) {
		response.writeHead(0, 'server not implemented');
		response.end();
	};

	// called before server destruction, should be overwritten by subclasses
	// - executes syncronously - does not wait for cleanup to finish
	RTCPeerServer.prototype.terminate = function() {
		// :TODO:
	};
})();