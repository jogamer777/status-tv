const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Track active motion per camera
const motionState = {};

// Broadcast to all connected clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  // Send current state immediately
  ws.send(JSON.stringify({ type: 'state', motionState }));
});

// MotionEye webhook endpoint — called by motion on event
app.post('/webhook/motion/:cameraId/:event', (req, res) => {
  const { cameraId, event } = req.params;
  const id = parseInt(cameraId);

  if (event === 'start') {
    motionState[id] = true;
    console.log(`Motion START on camera ${id}`);
    broadcast({ type: 'motion', cameraId: id, active: true, motionState });
  } else if (event === 'end') {
    motionState[id] = false;
    console.log(`Motion END on camera ${id}`);
    broadcast({ type: 'motion', cameraId: id, active: false, motionState });
  }

  res.sendStatus(200);
});

// Camera list endpoint
app.get('/api/cameras', (req, res) => {
  res.json(config.motioneye.cameras);
});

// Printer status endpoints
const printerRoutes = require('./routes/printers');
app.use('/api/printers', printerRoutes(config));

server.listen(config.server.port, config.server.host, () => {
  console.log(`Status-TV backend running on ${config.server.host}:${config.server.port}`);
});
