# Fix: Extension Connection Status Always Shows "Disconnected"

## Problem

The extension connection status shows "disconnected" even when the extension is actually connected to the server. This is because:

1. The Expo app only tracks `isConnected` (Expo↔Server connection)
2. The server tracks which browsers are connected via `clientTypes` map
3. The Expo app doesn't query the server to know if browser/extension is connected
4. So it has no way to know the extension status

## Root Cause

In `WebSocketContext.js`:
- `connectionStatus` = Expo↔Server connection ("connected" / "disconnected")
- No tracking of extension↔Server connection status
- No message type to query server for connected browser/extension clients

## Solution

Add a new mechanism to track extension connection status:

### Step 1: Add Extension Connection State to WebSocketContext

**File**: `E:/fiverr-expo/context/WebSocketContext.js`

**Location**: Line 509 (near other state declarations)

**Add**:
```javascript
// Track connected browser extensions/clients
const [extensionConnectionStatus, setExtensionConnectionStatus] = useState("unknown"); // 'connected', 'disconnected', 'unknown', 'checking'
const extensionStatusTimeoutRef = useRef(null);
```

### Step 2: Request Extension Status on Connect

**File**: `E:/fiverr-expo/context/WebSocketContext.js`

**Location**: After line 862 (after sending connect message)

**Add**:
```javascript
// Query server for connected browser/extension clients
const queryExtensionStatus = () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "query_client_status",
        query_client_type: "browser", // Query for browser/extension connections
      })
    );
  }
};

// Query immediately on connect
queryExtensionStatus();

// Query periodically to keep status updated
const extensionStatusInterval = setInterval(() => {
  if (connectGenerationRef.current === thisGeneration && ws && ws.readyState === WebSocket.OPEN) {
    queryExtensionStatus();
  }
}, 5000); // Check every 5 seconds
```

### Step 3: Handle Extension Status Response

**File**: `E:/fiverr-expo/context/WebSocketContext.js`

**Location**: In the `handleMessage` callback (around line 1680-2700)

**Add**:
```javascript
case "client_status_response":
  // Server sent us info about connected clients
  if (data.clientTypes && typeof data.clientTypes === 'object') {
    const browserConnections = (data.clientTypes || []).filter(
      type => type === "browser"
    );
    
    if (browserConnections && browserConnections.length > 0) {
      setExtensionConnectionStatus("connected");
    } else {
      setExtensionConnectionStatus("disconnected");
    }
  } else {
    setExtensionConnectionStatus("disconnected");
  }
  break;
```

### Step 4: Export Extension Status in Context Value

**File**: `E:/fiverr-expo/context/WebSocketContext.js`

**Location**: Line 3050-3065 (the value object)

**Change**:
```javascript
const value = {
  isConnected,
  connectionStatus,
  extensionConnectionStatus,  // ← ADD THIS
  clients,
  messages,
  clientData,
  newClientData,
  setNewClientData,
  sellerProfile,
  sellerProfiles,
  selectedSellerProfile,
  setSelectedSellerProfile,
  // ... rest of exports
};
```

### Step 5: Update Components to Use Extension Status

**For AdminProfileSettings.js** (already has the fix):
The `extensionStatus` is already tracking extension connection properly via reload status updates. Good! ✅

**For AdminDashboard.js** (if needed):
Can use `extensionConnectionStatus` from context to show extension availability.

**For ClientsScreen.js** (if needed):
Update message to use `extensionConnectionStatus` instead of just `isConnected`.

---

## Server-Side Implementation

### Add Handler in MessageServer.js

**File**: `E:/fiverr-server/MessageServer.js`

**Location**: In `handleMessage()` method (around line 1580-1700)

**Add**:
```javascript
else if (msgType === "query_client_status") {
  // Client querying for connected clients of a specific type
  const queryClientType = data.query_client_type || "browser";
  
  const connectedClients = [];
  for (const [sessionId, clientType] of this.clientTypes.entries()) {
    if (clientType === queryClientType) {
      connectedClients.push({
        sessionId,
        clientType,
        profile: this.browserProfileBySession.get(sessionId) || null,
      });
    }
  }
  
  // Send response back to querying client
  ws.send(
    JSON.stringify({
      type: "client_status_response",
      queried_client_type: queryClientType,
      connected_count: connectedClients.length,
      clientTypes: connectedClients.map(c => c.clientType), // For backward compat
      hasExtension: queryClientType === "browser" && connectedClients.length > 0,
    })
  );
  return;
}
```

---

## Extension-Side (background.js)

The extension already sends its connection status to Expo apps via:
```javascript
broadcastConnectionStatus(true/false);
```

And the server broadcasts it to all clients. This is already working! ✅

---

## Testing the Fix

### Test 1: Check Connection Status on Load
1. Open Admin Dashboard
2. Extension connected → `extensionConnectionStatus` should be "connected"
3. Extension disconnected → `extensionConnectionStatus` should be "disconnected"

### Test 2: Check Status Updates Periodically
1. Disable extension
2. Wait 5 seconds
3. `extensionConnectionStatus` should change to "disconnected"

### Test 3: Check Immediate Response
1. Enable extension
2. `extensionConnectionStatus` should become "connected" within 5 seconds

### Test 4: Multiple Tabs
1. Open extension in one tab
2. Open Expo in another device/tab
3. Should show "connected" because extension is there
4. Close extension tab
5. Should show "disconnected"

---

## Implementation Timeline

1. **Add state and exports** (5 min)
2. **Add query on connect** (10 min)
3. **Add message handler in WebSocketContext** (10 min)
4. **Add server handler** (15 min)
5. **Test** (15 min)

**Total: ~55 minutes**

---

## Performance Considerations

- Query frequency: 5 seconds (conservative, can optimize to 10s)
- Message size: Very small (~100 bytes)
- No database queries needed
- Pure in-memory state checking on server

---

## Alternative Approach (Simpler)

If the above is too complex, we can use the existing reload_status_update messages:
- Extension already sends `reload_status_update` periodically
- Track when we last received one
- If > 15 seconds old, mark as disconnected

This is what AdminProfileSettings.js does! Can replicate globally.

---

## Backward Compatibility

- Old clients (without extension status tracking) still work
- Server ignores unknown message types
- Graceful fallback if extension status unavailable

---

## Related Files

- `E:/fiverr-expo/context/WebSocketContext.js` - Main implementation
- `E:/fiverr-server/MessageServer.js` - Server handler
- `E:/fiverr-agent-helper/background.js` - Already broadcasting status
- `E:/fiverr-expo/components/AdminProfileSettings.js` - Already has correct status tracking
