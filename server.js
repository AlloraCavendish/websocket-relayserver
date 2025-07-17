const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: process.env.PORT || 10000 });

let espSocket = null; // store ESP8266 connection
let webClients = []; // store web client connections

// Store latest sensor data for new clients
let latestSensorData = null;

wss.on("connection", (socket, req) => {
  console.log("New client connected");

  socket.on("message", (message) => {
    const msg = message.toString();
    console.log("Received:", msg);

    // ESP8266 identification
    if (msg === "ESP8266") {
      espSocket = socket;
      console.log("ESP8266 Distance Sensor connected.");
      
      // Send latest sensor data to new ESP connection if available
      if (latestSensorData) {
        console.log("Sending cached sensor data to ESP8266");
      }
      return;
    }

    // Register web client with a specific identifier
    if (msg === "WEB_CLIENT") {
      if (!webClients.includes(socket)) {
        webClients.push(socket);
        console.log("Web client registered. Total web clients:", webClients.length);
        
        // Send latest sensor data to new web client
        if (latestSensorData) {
          console.log("Sending cached sensor data to new web client");
          socket.send(JSON.stringify(latestSensorData));
        }
      }
      return;
    }

    // Check if message is JSON data from ESP8266
    try {
      const data = JSON.parse(msg);
      
      // Handle heartbeat messages
      if (data.type === "heartbeat") {
        console.log("♥ Heartbeat received from ESP8266:", {
          distance: data.distance,
          manual_mode: data.manual_mode,
          uptime: data.uptime,
          wifi_rssi: data.wifi_rssi,
          free_heap: data.free_heap
        });
        
        // Update latest sensor data with heartbeat info
        latestSensorData = {
          ...latestSensorData,
          ...data,
          type: "sensor_data", // Convert to sensor_data for web clients
          timestamp: new Date().toISOString()
        };
        
        // Forward heartbeat as sensor data to web clients
        webClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(latestSensorData));
          }
        });
        
        // Send pong response to ESP8266
        if (espSocket && espSocket.readyState === WebSocket.OPEN) {
          espSocket.send("pong");
        }
        return;
      }
      
      if (data.type === "sensor_data") {
        // Cache the latest sensor data
        latestSensorData = data;
        latestSensorData.timestamp = new Date().toISOString();
        
        // Determine distance status based on distance value
        let distanceStatus = "UNKNOWN";
        if (data.distance > 0) {
          if (data.distance < 10) {
            distanceStatus = "DANGER";
          } else if (data.distance <= 30) {
            distanceStatus = "WARNING";
          } else {
            distanceStatus = "SAFE";
          }
        }
        
        // Add status to data
        data.distance_status = distanceStatus;
        data.distance_cm = data.distance;
        
        // Log distance status for monitoring
        if (distanceStatus === "DANGER") {
          console.log(`🚨 DANGER: Distance ${data.distance}cm detected!`);
        } else if (distanceStatus === "WARNING") {
          console.log(`⚠  WARNING: Distance ${data.distance}cm detected`);
        } else if (distanceStatus === "SAFE") {
          console.log(`✅ SAFE: Distance ${data.distance}cm`);
        }
        
        // Forward sensor data to all web clients
        console.log("Forwarding sensor data to web clients:", {
          distance: data.distance,
          status: distanceStatus,
          manual_mode: data.manual_mode,
          red_led: data.red_led,
          yellow_led: data.yellow_led,
          green_led: data.green_led,
          vibration: data.vibration,
          buzzer: data.buzzer,
          device_id: data.device_id
        });
        
        webClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
        return;
      }
      
      // Handle button events
      if (data.type === "button_event") {
        console.log("Button event received:", data);
        // Update cached sensor data if available
        if (latestSensorData) {
          latestSensorData.manual_mode = data.manual_mode;
          latestSensorData.timestamp = new Date().toISOString();
        }
        
        // Forward to web clients
        webClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
        return;
      }
      
    } catch (e) {
      // Not JSON, continue with normal processing
    }

    // Handle LED control commands from web clients (for backward compatibility)
    if (msg === "on" || msg === "off") {
      console.log(`LED command received: ${msg}`);
      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        espSocket.send(msg);
        console.log(`LED command sent to ESP8266: ${msg}`);
      } else {
        console.log("ESP8266 not connected, cannot send LED command");
      }
      return;
    }

    // Handle distance request from web clients
    if (msg === "get_distance") {
      console.log("Distance request received from web client");
      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        espSocket.send(msg);
        console.log("Distance request sent to ESP8266");
      } else if (latestSensorData) {
        // Send cached data if ESP is not connected
        console.log("ESP8266 not connected, sending cached sensor data");
        webClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(latestSensorData));
          }
        });
      }
      return;
    }

    // Handle manual mode toggle from web clients
    if (msg === "toggle_manual") {
      console.log("Manual mode toggle received from web client");
      if (espSocket && espSocket.readyState === WebSocket.OPEN) {
        espSocket.send(msg);
        console.log("Manual mode toggle sent to ESP8266");
      } else {
        console.log("ESP8266 not connected, cannot send manual mode toggle");
      }
      return;
    }

    // Handle LED status responses from ESP8266
    if (msg === "LED_ON" || msg === "LED_OFF") {
      console.log(`LED status received from ESP8266: ${msg}`);
      // Forward LED status to web clients
      webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(msg);
        }
      });
      return;
    }

    // Handle legacy LED responses (for backward compatibility)
    if (msg === "ON" || msg === "OFF") {
      console.log(`Legacy LED status received: ${msg}`);
      // Convert to new format and forward to web clients
      const newFormat = msg === "ON" ? "LED_ON" : "LED_OFF";
      webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(newFormat);
        }
      });
      return;
    }

    // Log unhandled messages
    console.log("Unhandled message:", msg);
  });

  socket.on("close", () => {
    console.log("Client disconnected");
    
    if (socket === espSocket) {
      espSocket = null;
      console.log("ESP8266 Distance Sensor disconnected");
      
      // Notify web clients about ESP disconnection
      webClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: "esp_status",
            status: "disconnected",
            timestamp: new Date().toISOString()
          }));
        }
      });
    } else {
      // Remove from web clients
      const initialCount = webClients.length;
      webClients = webClients.filter(client => client !== socket);
      console.log(`Web client disconnected. Remaining clients: ${webClients.length} (was ${initialCount})`);
    }
  });

  socket.on("error", (error) => {
    console.error("WebSocket error:", error);
    
    // Clean up broken connections
    if (socket === espSocket) {
      espSocket = null;
      console.log("ESP8266 connection error, cleared espSocket");
    } else {
      webClients = webClients.filter(client => client !== socket);
      console.log("Web client connection error, cleaned up webClients array");
    }
  });
});

// Periodic cleanup of dead connections
setInterval(() => {
  // Clean up dead web client connections
  const initialCount = webClients.length;
  webClients = webClients.filter(client => client.readyState === WebSocket.OPEN);
  
  if (webClients.length !== initialCount) {
    console.log(`Cleaned up ${initialCount - webClients.length} dead web client connections`);
  }
  
  // Check ESP connection
  if (espSocket && espSocket.readyState !== WebSocket.OPEN) {
    console.log("ESP8266 connection is dead, clearing espSocket");
    espSocket = null;
  }
  
  // Log current connections
  console.log(`Active connections - ESP8266: ${espSocket ? 'Connected' : 'Disconnected'}, Web clients: ${webClients.length}`);
}, 30000); // Every 30 seconds

// Heartbeat to keep connections alive
setInterval(() => {
  if (espSocket && espSocket.readyState === WebSocket.OPEN) {
    espSocket.ping();
  }
  
  webClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  });
}, 15000); // Every 15 seconds

console.log(`WebSocket relay server for ESP8266 Distance Sensor running on port ${process.env.PORT || 10000}`);
console.log("Server features:");
console.log("- Distance sensor data relay");
console.log("- Manual mode toggle support");
console.log("- Traffic light LED status monitoring");
console.log("- Vibration and buzzer status monitoring");
console.log("- Button event handling");
console.log("- Heartbeat message handling");
console.log("- Connection monitoring");
console.log("- Automatic cleanup of dead connections");
console.log("- Heartbeat pings to maintain connections");