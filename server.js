const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let waitingUsers = [];
let pairs = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-chat', (username) => {
    if (waitingUsers.length > 0) {
      const partnerId = waitingUsers.shift();
      pairs[socket.id] = partnerId;
      pairs[partnerId] = socket.id;
      
      socket.emit('partner-found');
      io.to(partnerId).emit('partner-found');
    } else {
      waitingUsers.push(socket.id);
      socket.emit('waiting');
    }
  });

  socket.on('send-message', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('message', data);
    }
  });

  socket.on('webrtc-offer', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) io.to(partnerId).emit('webrtc-offer', data);
  });

  socket.on('webrtc-answer', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) io.to(partnerId).emit('webrtc-answer', data);
  });

  socket.on('ice-candidate', (data) => {
    const partnerId = pairs[socket.id];
    if (partnerId) io.to(partnerId).emit('ice-candidate', data);
  });

  socket.on('next', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      delete pairs[partnerId];
      io.to(partnerId).emit('partner-left');
    }
    delete pairs[socket.id];
    socket.emit('find-new');
  });

  socket.on('disconnect', () => {
    const partnerId = pairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-left');
      delete pairs[partnerId];
    }
    delete pairs[socket.id];
    waitingUsers = waitingUsers.filter(id => id !== socket.id);
  });
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});