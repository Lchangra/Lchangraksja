const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io with proper CORS for Vercel
const io = socketIo(server, {
  cors: {
    origin: [
      "https://lchangra-dwzj8oh8l-ppodinaofficials-projects.vercel.app",
      "https://lchangra.vercel.app", 
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Waiting users queue
let waitingUsers = [];
let activePairs = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('find-partner', () => {
    console.log('Finding partner for:', socket.id);
    
    // Remove from any existing pair
    if (activePairs.has(socket.id)) {
      const partnerId = activePairs.get(socket.id);
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
      socket.to(partnerId).emit('partner-disconnected');
    }

    // Remove from waiting list if already there
    waitingUsers = waitingUsers.filter(id => id !== socket.id);

    // Find partner
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      const partnerSocket = io.sockets.sockets.get(partnerId);
      
      if (partnerSocket && partnerSocket.connected) {
        // Create pair
        activePairs.set(socket.id, partnerId);
        activePairs.set(partnerId, socket.id);
        
        // Notify both users
        socket.emit('partner-found', { partnerId });
        partnerSocket.emit('partner-found', { partnerId });
        
        console.log(`Paired: ${socket.id} with ${partnerId}`);
      } else {
        waitingUsers.push(socket.id);
        socket.emit('waiting-for-partner');
      }
    } else {
      waitingUsers.push(socket.id);
      socket.emit('waiting-for-partner');
      console.log('User added to waiting list:', socket.id);
    }
  });

  socket.on('send-message', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('receive-message', {
        message: data.message,
        isOwn: false
      });
    }
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-offer', {
        offer: data.offer,
        from: socket.id
      });
    }
  });

  socket.on('webrtc-answer', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-answer', {
        answer: data.answer,
        from: socket.id
      });
    }
  });

  socket.on('webrtc-ice-candidate', (data) => {
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('webrtc-ice-candidate', {
        candidate: data.candidate,
        from: socket.id
      });
    }
  });

  socket.on('next-partner', () => {
    console.log('Next partner requested by:', socket.id);
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('partner-disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
    }
    
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
    
    setTimeout(() => {
      socket.emit('find-partner');
    }, 1000);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const partnerId = activePairs.get(socket.id);
    if (partnerId) {
      socket.to(partnerId).emit('partner-disconnected');
      activePairs.delete(socket.id);
      activePairs.delete(partnerId);
    }
    
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Lchangra Random Chat running on port ${PORT}`);
});