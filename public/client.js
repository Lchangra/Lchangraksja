class LchangraApp {
    constructor() {
        this.socket = null;
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.username = '';
        this.roomId = '';
        this.isConnected = false;
        
        this.initializeApp();
    }

    initializeApp() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('joinButton').addEventListener('click', () => this.joinRoom());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('nextBtn').addEventListener('click', () => this.nextPartner());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveRoom());
    }

    async joinRoom() {
        this.username = document.getElementById('usernameInput').value.trim() || 'User' + Math.floor(Math.random() * 1000);
        this.roomId = document.getElementById('roomInput').value.trim() || 'general';

        if (!this.username) {
            alert('Please enter a username');
            return;
        }

        try {
            // Get camera and microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // Show chat screen
            this.showScreen('chatScreen');

            // Show local video
            document.getElementById('localVideo').srcObject = this.localStream;

            // Connect to server
            this.socket = io();
            this.setupSocketEvents();

            // Start finding partner
            this.socket.emit('join-chat', this.username);

        } catch (error) {
            console.error('Camera error:', error);
            alert('Error accessing camera/microphone. Please check permissions.');
        }
    }

    setupSocketEvents() {
        this.socket.on('waiting', () => {
            this.updateStatus('Searching for partner...', 'waiting');
            this.showWaitingScreen();
            this.addSystemMessage('Looking for someone to chat with...');
        });

        this.socket.on('partner-found', () => {
            this.isConnected = true;
            this.updateStatus('Connected to stranger!', 'connected');
            this.hideWaitingScreen();
            this.addSystemMessage('Partner found! Starting video call...');
            this.startVideoCall();
        });

        this.socket.on('message', (data) => {
            this.addMessage(data.sender, data.text, false);
        });

        this.socket.on('partner-left', () => {
            this.isConnected = false;
            this.addSystemMessage('Partner disconnected');
            this.updateStatus('Partner left', 'waiting');
            this.showWaitingScreen();
            this.stopVideoCall();
        });

        this.socket.on('find-new', () => {
            this.socket.emit('join-chat', this.username);
        });

        // WebRTC events
        this.socket.on('webrtc-offer', (offer) => {
            this.handleOffer(offer);
        });

        this.socket.on('webrtc-answer', (answer) => {
            this.handleAnswer(answer);
        });

        this.socket.on('ice-candidate', (candidate) => {
            this.handleIceCandidate(candidate);
        });
    }

    async startVideoCall() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Add local stream
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            document.getElementById('remoteVideo').srcObject = event.streams[0];
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', event.candidate);
            }
        };

        // Create and send offer
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('webrtc-offer', offer);
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(offer) {
        if (!this.peerConnection) return;

        try {
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.socket.emit('webrtc-answer', answer);
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(answer) {
        if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(answer);
        }
    }

    async handleIceCandidate(candidate) {
        if (this.peerConnection && candidate) {
            await this.peerConnection.addIceCandidate(candidate);
        }
    }

    stopVideoCall() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        document.getElementById('remoteVideo').srcObject = null;
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();

        if (message && this.socket && this.isConnected) {
            this.socket.emit('send-message', {
                sender: this.username,
                text: message
            });
            this.addMessage('You', message, true);
            input.value = '';
        }
    }

    addMessage(sender, message, isOwn) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${isOwn ? 'own' : 'other'}`;
        messageElement.innerHTML = `
            <div class="message-header">
                <strong>${sender}</strong>
            </div>
            <div class="message-content">${message}</div>
        `;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    addSystemMessage(message) {
        const container = document.getElementById('messagesContainer');
        const messageElement = document.createElement('div');
        messageElement.className = 'message system';
        messageElement.textContent = message;
        container.appendChild(messageElement);
        container.scrollTop = container.scrollHeight;
    }

    nextPartner() {
        if (this.socket) {
            this.socket.emit('next');
            this.addSystemMessage('Looking for new partner...');
            this.updateStatus('Searching for partner...', 'waiting');
            this.showWaitingScreen();
        }
    }

    leaveRoom() {
        if (this.socket) {
            this.socket.disconnect();
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }
        this.showScreen('loginScreen');
        this.clearChat();
    }

    updateStatus(text, type) {
        const statusElement = document.getElementById('connectionStatus');
        statusElement.innerHTML = type === 'connected' 
            ? `<i class="fas fa-check-circle"></i> ${text}`
            : `<i class="fas fa-search"></i> ${text}`;
        statusElement.className = `status-${type}`;
    }

    showWaitingScreen() {
        document.getElementById('waitingScreen').classList.remove('hidden');
        document.getElementById('videoContainer').classList.add('hidden');
    }

    hideWaitingScreen() {
        document.getElementById('waitingScreen').classList.add('hidden');
        document.getElementById('videoContainer').classList.remove('hidden');
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    clearChat() {
        document.getElementById('messagesContainer').innerHTML = 
            '<div class="message system">Welcome to Lchangra! We\'re finding someone for you to chat with...</div>';
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new LchangraApp();
});