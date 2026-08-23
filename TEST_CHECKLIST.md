# Tab Reload Admin Dashboard - Test Checklist

## Pre-Test Requirements
- [ ] Extension running (`fiverr-agent-helper/background.js`)
- [ ] Server running (`fiverr-server/MessageServer.js`)
- [ ] Expo app running
- [ ] Browser DevTools open to monitor console

## Console Monitoring
**What to watch for**:
- ❌ AVOID: Multiple `[MessageServer] Raw WS message received` with repeated `request_reload_status`
- ❌ AVOID: `sendMessage` called repeatedly in loops
- ✅ EXPECT: Initial `request_reload_status` on mount (1 call)
- ✅ EXPECT: `request_reload_status` when profile changes (debounced, ~1 per change)
- ✅ EXPECT: `reload_status_update` responses from extension

## Test 1: Initial Load ⭐
**Steps**:
1. Open Expo app
2. Navigate to Admin Dashboard
3. Click "Profile Settings"

**Expected Results**:
- [ ] Component loads without errors
- [ ] Status shows "Extension Connected" (green dot) OR "Checking" briefly then connected
- [ ] Next reload time displays (if reload is enabled for any profile)
- [ ] Only ONE `request_reload_status` message in console (debounced)

**Why it matters**: Verifies component mounts correctly and requests status without spam

---

## Test 2: Profile Switching 📱
**Steps**:
1. From Test 1, keep dashboard open
2. Use profile selector (top of screen) to switch profiles
3. Switch 2-3 times rapidly
4. Wait 1 second between switches

**Expected Results**:
- [ ] Status updates each time (shows updated reload settings)
- [ ] "Extension Connected" remains (green dot)
- [ ] Console shows ONE `request_reload_status` per profile change (debounced 300ms)
- [ ] NO error messages
- [ ] No infinite loops in console

**Why it matters**: Verifies profile change detection works and debouncing prevents spam

---

## Test 3: Enable/Disable Reload 🔄
**Steps**:
1. From previous test, stay in Admin Dashboard
2. Find a profile with reload settings
3. Toggle the reload enabled/disabled switch
4. Click "Save"

**Expected Results**:
- [ ] "Saving..." shows briefly
- [ ] "Settings saved and synced" message appears
- [ ] Status updates (should show "armed" if enabling, "disabled" if disabling)
- [ ] Status reflects enabled/disabled correctly in extension
- [ ] Only ONE `request_reload_status` after save (not multiple)

**Why it matters**: Verifies settings sync and status request on save work

---

## Test 4: Long Idle with No Updates 😴
**Steps**:
1. Leave Admin Dashboard open
2. Disable the extension (via Manage Extensions)
3. Wait 15+ seconds

**Expected Results**:
- [ ] After 15 seconds, status changes to "Extension Disconnected" (red dot)
- [ ] No error messages in console
- [ ] Component is still responsive (no frozen UI)
- [ ] Next reload time still displays (cached from last update)

**Why it matters**: Verifies health check detects actual disconnection

---

## Test 5: Extension Reconnects 🔌
**Steps**:
1. From Test 4 (status = disconnected)
2. Re-enable the extension
3. Trigger a profile change OR wait for next automatic request

**Expected Results**:
- [ ] Status changes back to "Extension Connected" (green dot)
- [ ] Shows "Checking" briefly if waiting for auto-request
- [ ] Updates immediately if you trigger profile change
- [ ] Latest reload status displays

**Why it matters**: Verifies recovery from disconnection

---

## Test 6: Multi-Profile Rapid Switch 🚀
**Steps**:
1. Have 3+ profiles configured
2. Click through all 3 profiles as fast as you can
3. Watch the console

**Expected Results**:
- [ ] Status updates for each profile
- [ ] Console shows debounced requests (300ms apart minimum)
- [ ] NOT one request per click
- [ ] Extension doesn't get hammered with requests
- [ ] UI stays responsive

**Why it matters**: Verifies debouncing prevents message storm

---

## Test 7: Countdown Timer Updates ⏱️
**Steps**:
1. Enable reload for a profile
2. Set min seconds to something small (e.g., 10s)
3. Watch the countdown in the "Next reload" display

**Expected Results**:
- [ ] Time counts down smoothly (every second or close to it)
- [ ] Number changes: "10s" → "9s" → "8s" etc
- [ ] No jumping or skipping in countdown
- [ ] Timer continues while you switch profiles
- [ ] No lag when updating countdown

**Why it matters**: Verifies countdown timer works and doesn't cause performance issues

---

## Test 8: Check Network Monitoring 🌐
**Steps**:
1. Open Network tab in DevTools
2. Go to Admin Dashboard
3. Switch profiles 2-3 times

**Expected Results**:
- [ ] WebSocket frames show `request_reload_status` occasionally
- [ ] NO continuous flooding of `request_reload_status` messages
- [ ] Each frame is meaningful (not spam)
- [ ] Responses come back with status data

**Why it matters**: Verifies no message spam to server

---

## Test 9: Permission Scenarios 🔐
**Steps**:
1. Test with limited user (not admin) if available
2. Navigation to settings

**Expected Results**:
- [ ] Component doesn't break
- [ ] Still shows connection status (even if can't modify settings)
- [ ] Error handling is graceful

**Why it matters**: Verifies no crashes with different user roles

---

## Test 10: Memory/Cleanup 🧹
**Steps**:
1. Open Admin Dashboard
2. Switch profiles several times
3. Go back to main screen
4. Return to Admin Dashboard

**Expected Results**:
- [ ] No memory leaks (browser DevTools Memory tab)
- [ ] Event listeners properly cleaned up
- [ ] Intervals cleared when component unmounts
- [ ] Can switch dashboards multiple times without issues

**Why it matters**: Verifies cleanup code prevents memory leaks

---

## Critical Checks (Must Pass)

- [ ] **No error in console** when component mounts
- [ ] **No infinite loops** (check for repeated messages every second)
- [ ] **Status shows "connected" or "checking"** within 2 seconds of opening dashboard
- [ ] **Profile changes trigger status update** (not spam, just one request)
- [ ] **After 15s idle, status shows "disconnected"** 
- [ ] **Switching profiles re-connects status** (within 1-2 seconds)
- [ ] **Only 2 setInterval calls** running (health check + countdown)

## Console Commands for Testing

```javascript
// Check if status updates are being dispatched
window.addEventListener("fiverr-reload-status-update", (e) => {
  console.log("✓ Status update received:", e.detail);
});

// Monitor WebSocket messages
const originalSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(msg) {
  if (msg.includes("request_reload_status")) {
    console.log("→ Sending request_reload_status", new Date().toLocaleTimeString());
  }
  return originalSend.call(this, msg);
};
```

## Debugging Tips

If status shows "Disconnected" incorrectly:
1. Check `lastReloadStatusAt` value in React DevTools
2. Calculate `Date.now() - lastReloadStatusAt` 
3. If > 15000, health check will mark as disconnected (correct)
4. If < 15000, check if `setExtensionStatus("connected")` was called

If profile changes don't update status:
1. Check if `selectedSellerProfile` changed in React state
2. Verify effect dependency includes `selectedSellerProfile`
3. Check if debounce timeout is firing (should happen 300ms after change)
4. Verify `sendMessage` is being called with `request_reload_status`

If spam of requests:
1. Search console for repeated `request_reload_status` timestamps
2. Check if effect cleanup is working (should clear timeout on unmount)
3. Verify debounce timeout is actually debouncing (300ms minimum)
4. Check for duplicate effects or listeners

---

## Post-Fix Expected Behavior

✅ **Connection Status**
- Shows real Extension↔Server connection (not Expo↔Server)
- Updates within 1-2 seconds of receiving status from extension
- Shows "disconnected" only if no update in 15+ seconds

✅ **No Polling Loops**
- No more 5-second polling interval spam
- Only requests when: mounted, profile changes, settings saved
- Each request is debounced to prevent rapid succession

✅ **Profile Changes**
- Status updates immediately when switching profiles
- Shows correct reload settings for new profile
- No lag or unnecessary requests

✅ **Performance**
- Countdown timer doesn't cause lag
- Health check runs silently every 2 seconds (local state only)
- Memory stays stable even after many profile switches
