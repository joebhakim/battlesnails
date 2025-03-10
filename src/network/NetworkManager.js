/**
 * Manages WebRTC peer connections for multiplayer gameplay
 */
export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.peerConnection = null;
    this.dataChannel = null;
    this.isHost = false;
    this.isConnected = false;
    this.connectionId = this.generateConnectionId();
    
    // Message queue for when connection is temporarily lost
    this.messageQueue = [];
    
    // Callback registry
    this.onConnectionEstablished = null;
    this.onConnectionLost = null;
    this.onDataReceived = null;
    
    // Performance metrics
    this.lastPacketTime = 0;
    this.currentLatency = 0;
  }
  
  /**
   * Generate a unique connection ID
   * @returns {string} A unique ID for this connection
   */
  generateConnectionId() {
    return Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Initialize as host (creates the data channel)
   */
  initAsHost() {
    this.isHost = true;
    this.setupPeerConnection();
    
    // Create the data channel
    this.dataChannel = this.peerConnection.createDataChannel('gameData', {
      ordered: false, // Allow out-of-order delivery for better performance
      maxRetransmits: 3 // Limit retransmissions for real-time data
    });
    
    this.setupDataChannel(this.dataChannel);
    
    // Create and return the offer
    return this.createOffer();
  }
  
  /**
   * Initialize as client (connects to the host)
   * @param {string} offerSDP - The SDP offer from the host
   * @returns {Promise<string>} The answer SDP
   */
  async initAsClient(offerSDP) {
    this.isHost = false;
    this.setupPeerConnection();
    
    // Listen for the data channel
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };
    
    // Set the remote description (the offer)
    const offer = JSON.parse(offerSDP);
    await this.peerConnection.setRemoteDescription(offer);
    
    // Create and return the answer
    return this.createAnswer();
  }
  
  /**
   * Set up the peer connection with appropriate configuration
   */
  setupPeerConnection() {
    // Configure ICE servers (STUN/TURN)
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
        // Add TURN servers here for production use
      ]
    };
    
    this.peerConnection = new RTCPeerConnection(config);
    
    // Handle ICE candidate events
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // In a copy-paste approach, we collect these and share them
        this.game.ui.updateIceCandidates(JSON.stringify(event.candidate));
      }
    };
    
    // Monitor connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', this.peerConnection.iceConnectionState);
      
      if (this.peerConnection.iceConnectionState === 'connected' || 
          this.peerConnection.iceConnectionState === 'completed') {
        this.isConnected = true;
        if (this.onConnectionEstablished) this.onConnectionEstablished();
        this.game.ui.updateConnectionStatus('Connected');
        
        // Send any queued messages
        this.flushMessageQueue();
      } 
      else if (this.peerConnection.iceConnectionState === 'disconnected' || 
               this.peerConnection.iceConnectionState === 'failed' ||
               this.peerConnection.iceConnectionState === 'closed') {
        this.isConnected = false;
        if (this.onConnectionLost) this.onConnectionLost();
        this.game.ui.updateConnectionStatus('Disconnected');
      }
    };
  }
  
  /**
   * Set up data channel event handlers
   * @param {RTCDataChannel} channel - The data channel to set up
   */
  setupDataChannel(channel) {
    channel.onopen = () => {
      console.log('Data channel is open');
      this.game.ui.updateConnectionStatus('Data Channel Open');
      
      // Send a ping to measure latency
      this.sendPing();
    };
    
    channel.onclose = () => {
      console.log('Data channel is closed');
      this.game.ui.updateConnectionStatus('Data Channel Closed');
    };
    
    channel.onerror = (error) => {
      console.error('Data channel error:', error);
      this.game.ui.updateConnectionStatus('Error: ' + error.message);
    };
    
    channel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Handle ping messages for latency calculation
      if (data.type === 'ping') {
        this.sendMessage({ type: 'pong', timestamp: data.timestamp });
        return;
      } else if (data.type === 'pong') {
        this.calculateLatency(data.timestamp);
        return;
      }
      
      // Process game data
      if (this.onDataReceived) {
        this.onDataReceived(data);
      }
    };
  }
  
  /**
   * Create an offer for connection establishment
   * @returns {Promise<string>} The SDP offer as a string
   */
  async createOffer() {
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    return JSON.stringify(this.peerConnection.localDescription);
  }
  
  /**
   * Create an answer to a connection offer
   * @returns {Promise<string>} The SDP answer as a string
   */
  async createAnswer() {
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return JSON.stringify(this.peerConnection.localDescription);
  }
  
  /**
   * Add a received ICE candidate to the connection
   * @param {string} candidateString - JSON string of the ICE candidate
   */
  async addIceCandidate(candidateString) {
    const candidate = JSON.parse(candidateString);
    await this.peerConnection.addIceCandidate(candidate);
  }
  
  /**
   * Complete connection setup with the remote answer
   * @param {string} answerSDP - The SDP answer from the client
   */
  async completeConnection(answerSDP) {
    const answer = JSON.parse(answerSDP);
    await this.peerConnection.setRemoteDescription(answer);
  }
  
  /**
   * Send a message to the remote peer
   * @param {Object} data - The data to send
   */
  sendMessage(data) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    } else {
      // Queue message for later if connection isn't ready
      this.messageQueue.push(data);
      
      // Attempt reconnection if needed
      if (!this.isConnected) {
        this.game.ui.updateConnectionStatus('Reconnecting...');
        // Reconnection logic could go here
      }
    }
  }
  
  /**
   * Send player state update to remote peer
   * @param {Object} playerState - The current player state to sync
   */
  sendPlayerState(playerState) {
    this.sendMessage({
      type: 'playerState',
      data: playerState,
      timestamp: Date.now(),
      sequence: this.messageSequence++
    });
  }
  
  /**
   * Send periodic ping to measure latency
   */
  sendPing() {
    if (this.isConnected) {
      this.sendMessage({
        type: 'ping',
        timestamp: Date.now()
      });
      
      // Schedule next ping
      setTimeout(() => this.sendPing(), 2000);
    }
  }
  
  /**
   * Calculate network latency from ping response
   * @param {number} timestamp - Timestamp when ping was sent
   */
  calculateLatency(timestamp) {
    this.currentLatency = Date.now() - timestamp;
    this.game.ui.updateLatency(this.currentLatency);
  }
  
  /**
   * Send all queued messages
   */
  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const data = this.messageQueue.shift();
      this.sendMessage(data);
    }
  }
  
  /**
   * Clean up and close the connection
   */
  disconnect() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    
    this.isConnected = false;
    this.game.ui.updateConnectionStatus('Disconnected');
  }
} 