const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

let espSocket = null; // store ESP8266 connection
let webClients = []; // store web client connections

wss.on("connection", (socket, req) => {
  console.log("New client connected");

  socket.on("message", (message) => {
    const msg = message.toString();
    console.log("Received:", msg);

    if (msg === "ESP8266") {
      espSocket = socket;
      console.log("ESP8266 connected.");
      return;
    }

    // Check if message is JSON data from ESP8266
    try {
      const data = JSON.parse(msg);
      if (data.type === "sensor_data" || data.type === "button_event") {
        // This is sensor data from ESP8266, forward to all web clients
        console.log("Forwarding sensor data to web clients:", data);
        webClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
          }
        });
        return;
      }
    } catch (e) {
      // Not JSON, continue with normal processing
    }

    // Handle LED control commands from web clients
    if (msg === "on" || msg === "off") {
      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        espSocket.send(msg);
      }
      return;
    }

    // Handle LED status responses from ESP8266
    if (msg === "ON" || msg === "OFF") {
      // Forward LED status to web clients
      webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
      return;
    }

    // If it's not from ESP8266, treat as web client
    if (socket !== espSocket) {
      webClients.push(socket);
      console.log("Web client connected. Total web clients:", webClients.length);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
    if (socket === espSocket) {
      espSocket = null;
      console.log("ESP8266 disconnected");
    } else {
      // Remove from web clients
      webClients = webClients.filter(client => client !== socket);
      console.log("Web client disconnected. Remaining clients:", webClients.length);
    }
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

console.log(`WebSocket relay server running on port ${process.env.PORT || 10000}`);