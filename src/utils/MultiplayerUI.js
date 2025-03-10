/**
 * UI components for multiplayer functionality
 */
export class MultiplayerUI {
  constructor(game) {
    this.game = game;
    
    // Create connection UI container
    this.connectionUI = document.createElement('div');
    this.connectionUI.className = 'connection-ui';
    document.body.appendChild(this.connectionUI);
    
    // Connection status display
    this.connectionStatus = document.createElement('div');
    this.connectionStatus.className = 'connection-status';
    this.connectionStatus.textContent = 'Not Connected';
    this.connectionUI.appendChild(this.connectionStatus);
    
    // Latency display
    this.latencyDisplay = document.createElement('div');
    this.latencyDisplay.className = 'latency-display';
    this.connectionUI.appendChild(this.latencyDisplay);
    
    // Create UI for host
    this.createHostUI();
    
    // Create UI for client
    this.createClientUI();
    
    // Add styles
    this.addStyles();
  }
  
  /**
   * Create UI elements for hosting a game
   */
  createHostUI() {
    const hostContainer = document.createElement('div');
    hostContainer.className = 'host-container';
    
    const hostButton = document.createElement('button');
    hostButton.className = 'host-button';
    hostButton.textContent = 'Host Game';
    hostButton.addEventListener('click', () => this.handleHostGame());
    
    const offerDisplay = document.createElement('textarea');
    offerDisplay.className = 'connection-data';
    offerDisplay.placeholder = 'Connection offer will appear here...';
    offerDisplay.readOnly = true;
    this.offerDisplay = offerDisplay;
    
    const copyOfferButton = document.createElement('button');
    copyOfferButton.className = 'copy-button';
    copyOfferButton.textContent = 'Copy Offer';
    copyOfferButton.addEventListener('click', () => {
      offerDisplay.select();
      document.execCommand('copy');
      copyOfferButton.textContent = 'Copied!';
      setTimeout(() => {
        copyOfferButton.textContent = 'Copy Offer';
      }, 2000);
    });
    
    const answerInput = document.createElement('textarea');
    answerInput.className = 'connection-data';
    answerInput.placeholder = 'Paste connection answer here...';
    this.answerInput = answerInput;
    
    const completeButton = document.createElement('button');
    completeButton.className = 'connect-button';
    completeButton.textContent = 'Complete Connection';
    completeButton.addEventListener('click', () => this.handleCompleteConnection());
    
    hostContainer.appendChild(hostButton);
    hostContainer.appendChild(offerDisplay);
    hostContainer.appendChild(copyOfferButton);
    hostContainer.appendChild(answerInput);
    hostContainer.appendChild(completeButton);
    
    this.connectionUI.appendChild(hostContainer);
    this.hostContainer = hostContainer;
  }
  
  /**
   * Create UI elements for joining a game
   */
  createClientUI() {
    const clientContainer = document.createElement('div');
    clientContainer.className = 'client-container';
    
    const offerInput = document.createElement('textarea');
    offerInput.className = 'connection-data';
    offerInput.placeholder = 'Paste connection offer here...';
    this.offerInput = offerInput;
    
    const joinButton = document.createElement('button');
    joinButton.className = 'join-button';
    joinButton.textContent = 'Join Game';
    joinButton.addEventListener('click', () => this.handleJoinGame());
    
    const answerDisplay = document.createElement('textarea');
    answerDisplay.className = 'connection-data';
    answerDisplay.placeholder = 'Connection answer will appear here...';
    answerDisplay.readOnly = true;
    this.answerDisplay = answerDisplay;
    
    const copyAnswerButton = document.createElement('button');
    copyAnswerButton.className = 'copy-button';
    copyAnswerButton.textContent = 'Copy Answer';
    copyAnswerButton.addEventListener('click', () => {
      answerDisplay.select();
      document.execCommand('copy');
      copyAnswerButton.textContent = 'Copied!';
      setTimeout(() => {
        copyAnswerButton.textContent = 'Copy Answer';
      }, 2000);
    });
    
    clientContainer.appendChild(offerInput);
    clientContainer.appendChild(joinButton);
    clientContainer.appendChild(answerDisplay);
    clientContainer.appendChild(copyAnswerButton);
    
    this.connectionUI.appendChild(clientContainer);
    this.clientContainer = clientContainer;
  }
  
  /**
   * Handle hosting a new game
   */
  async handleHostGame() {
    try {
      // Initialize as host
      const offer = await this.game.networkManager.initAsHost();
      
      // Display the offer
      this.offerDisplay.value = offer;
      
      this.updateConnectionStatus('Waiting for peer...');
    } catch (error) {
      console.error('Error creating offer:', error);
      this.updateConnectionStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Handle joining an existing game
   */
  async handleJoinGame() {
    try {
      const offerSDP = this.offerInput.value.trim();
      if (!offerSDP) {
        alert('Please paste a connection offer first!');
        return;
      }
      
      // Initialize as client with the offer
      const answer = await this.game.networkManager.initAsClient(offerSDP);
      
      // Display the answer
      this.answerDisplay.value = answer;
      
      this.updateConnectionStatus('Waiting for connection to complete...');
    } catch (error) {
      console.error('Error creating answer:', error);
      this.updateConnectionStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Complete the connection process (host side)
   */
  async handleCompleteConnection() {
    try {
      const answerSDP = this.answerInput.value.trim();
      if (!answerSDP) {
        alert('Please paste the connection answer first!');
        return;
      }
      
      // Complete the connection with the answer
      await this.game.networkManager.completeConnection(answerSDP);
      
      this.updateConnectionStatus('Connecting...');
    } catch (error) {
      console.error('Error completing connection:', error);
      this.updateConnectionStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Create an input for ICE candidates
   */
  createICECandidateInput() {
    const iceContainer = document.createElement('div');
    iceContainer.className = 'ice-container';
    
    const iceInput = document.createElement('textarea');
    iceInput.className = 'ice-input';
    iceInput.placeholder = 'Paste ICE candidate here...';
    
    const addIceButton = document.createElement('button');
    addIceButton.textContent = 'Add ICE Candidate';
    addIceButton.addEventListener('click', async () => {
      const candidateString = iceInput.value.trim();
      if (candidateString) {
        await this.game.networkManager.addIceCandidate(candidateString);
        iceInput.value = '';
      }
    });
    
    iceContainer.appendChild(iceInput);
    iceContainer.appendChild(addIceButton);
    
    this.connectionUI.appendChild(iceContainer);
  }
  
  /**
   * Update connection status display
   * @param {string} status - The current connection status
   */
  updateConnectionStatus(status) {
    this.connectionStatus.textContent = 'Status: ' + status;
    
    // Adjust UI visibility based on connection state
    if (status === 'Connected') {
      this.connectionUI.classList.add('minimized');
    } else {
      this.connectionUI.classList.remove('minimized');
    }
  }
  
  /**
   * Update latency display
   * @param {number} latency - Current latency in milliseconds
   */
  updateLatency(latency) {
    this.latencyDisplay.textContent = `Ping: ${latency}ms`;
    
    // Add color coding based on latency
    this.latencyDisplay.className = 'latency-display';
    if (latency < 100) {
      this.latencyDisplay.classList.add('good-latency');
    } else if (latency < 200) {
      this.latencyDisplay.classList.add('medium-latency');
    } else {
      this.latencyDisplay.classList.add('poor-latency');
    }
  }
  
  /**
   * Update the ICE candidate display
   * @param {string} candidate - ICE candidate in JSON string format
   */
  updateIceCandidates(candidate) {
    console.log('New ICE candidate:', candidate);
    // In a copy/paste approach, we might show this to the user
  }
  
  /**
   * Add styles for the multiplayer UI
   */
  addStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      .connection-ui {
        position: fixed;
        top: 10px;
        right: 10px;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px;
        border-radius: 10px;
        font-family: 'Arial', sans-serif;
        z-index: 1000;
        max-width: 400px;
        transition: all 0.3s ease;
      }
      
      .connection-ui.minimized {
        transform: translateX(calc(100% - 40px));
      }
      
      .connection-ui.minimized:hover {
        transform: translateX(0);
      }
      
      .connection-status {
        font-weight: bold;
        margin-bottom: 10px;
        padding: 5px;
        text-align: center;
        background-color: #333;
        border-radius: 5px;
      }
      
      .latency-display {
        text-align: center;
        margin-bottom: 10px;
        font-family: monospace;
      }
      
      .good-latency { color: #4CAF50; }
      .medium-latency { color: #FFC107; }
      .poor-latency { color: #F44336; }
      
      .host-container, .client-container {
        margin-bottom: 15px;
        padding: 10px;
        background-color: rgba(255, 255, 255, 0.1);
        border-radius: 5px;
      }
      
      .connection-data {
        width: 100%;
        height: 80px;
        margin: 10px 0;
        background-color: #222;
        color: #ddd;
        border: 1px solid #555;
        border-radius: 5px;
        padding: 5px;
        font-family: monospace;
      }
      
      button {
        background-color: #4CAF50;
        color: white;
        padding: 8px 12px;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        margin: 5px;
        width: calc(100% - 10px);
      }
      
      button:hover {
        background-color: #45a049;
      }
      
      .copy-button {
        background-color: #2196F3;
      }
      
      .copy-button:hover {
        background-color: #0b7dda;
      }
      
      .join-button {
        background-color: #9C27B0;
      }
      
      .join-button:hover {
        background-color: #7B1FA2;
      }
    `;
    document.head.appendChild(style);
  }
} 