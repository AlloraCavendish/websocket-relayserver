const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

let espSocket = null; // store ESP8266 connection

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

    if (espSocket && espSocket.readyState === WebSocket.OPEN) {
      espSocket.send(msg);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
    if (socket === espSocket) espSocket = null;
  });
});
