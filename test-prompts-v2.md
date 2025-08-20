# Test Prompts v2 - MCP3.0 Comprehensive Testing Guide
## Q-SYS MCP3.0 Server Validation Suite

This document contains comprehensive test prompts for the MCP3.0 reduced toolset (5 tools). Each prompt is designed to be copied and pasted directly into an MCP agent chat for execution.

**IMPORTANT**: Every test session MUST start with connection verification. The agent will check connection status and establish/verify connection before proceeding with tests.

**PERFORMANCE REQUIREMENTS**: MCP3.0 is designed for ultra-high performance:
- Tool response time: < 10ms overhead
- Connection time: < 1 second
- Memory usage: < 50MB
- Startup time: < 500ms
- All batch operations must be parallel

---

## CONNECTION SETUP (MANDATORY FIRST STEP)

### Test 0.1: Initial Connection Verification and Setup

```
TEST: Connection Verification and Setup

IMPORTANT: If not connected, ASK FOR IP FIRST before showing any test reports.

Please execute the following connection verification steps:

1. Use qsys_status to check current connection
2. If connected:
   - Report Core IP, status, and component count
   - Proceed to next test
3. If disconnected:
   - IMMEDIATELY ask the user (no test report needed yet):
     "No Q-SYS Core connection detected. Please provide the IP address of your Q-SYS Core (e.g., 192.168.1.100):"
   - WAIT for user to provide IP address (just the question, nothing else)
   - Once IP is provided, use qsys_connect with: 
     {host: "[provided IP]", port: 443, secure: true}
   - After connection attempt, use qsys_status to verify
   - THEN provide the complete test report
4. If connection still fails after receiving IP:
   - Check the error message from the connect action
   - Ask: "Cannot reach [IP]. Please verify:
     - Q-SYS Core is powered on at [IP]
     - You can ping [IP] from your network
     Provide different IP or 'skip' to stop:"
   - If new IP provided, return to step 3
   - If 'skip', show brief connection error and stop

EXPECTED OUTPUT:
- Connection Status: [connected/disconnected]
- Core IP: [IP address if connected]
- Component Count: [number if connected]
- Control Count: [total controls if connected]
- Polling Interval: [ms]
- User Interaction: [IP requested and received]
- Action Taken: [connected/reconnected/failed]

IMPORTANT: Do not proceed with other tests until connection is confirmed.
IMPORTANT: You MUST ask for the IP address interactively - do not guess or use placeholder IPs.
```

### Test 0.2: Component Filtering Feature

```
TEST: Component Filtering During Connection

Test the new component filtering feature that reduces memory usage:

1. First, connect WITHOUT filter to get baseline:
   - Use qsys_connect with host only
   - Note componentsLoaded count from response
   - Use qsys_status to check memory baseline

2. Disconnect and reconnect WITH filter:
   - Use qsys_connect with host and filter: "Gain"
   - Note componentsLoaded count (should be much less)
   - Verify filterApplied: true in response
   - Use qsys_discover to verify only Gain components loaded

3. Test different filter patterns:
   - Try filter: "^Audio" (components starting with Audio)
   - Try filter: "Mixer|Matrix" (components with Mixer OR Matrix)
   - Try filter: ".*_1$" (components ending with _1)

4. Verify filtered discovery:
   - Use qsys_discover with no params
   - Should only show filtered components
   - Use qsys_get on filtered components - should work
   - Use qsys_get on non-filtered component - should error

5. Performance comparison:
   - Compare connection time with/without filter
   - Check memory usage difference
   - Verify faster connection with filtered subset

EXPECTED OUTPUT:
- Baseline Components: [e.g., 97 total]
- Filtered Components: [e.g., 5 Gain components]
- Filter Applied: [true]
- Memory Savings: [percentage reduced]
- Connection Speed: [faster with filter]
- Pattern Tests: [all regex patterns work]

NOTE: Filtering is ideal for large Q-SYS designs to reduce memory
```

### Test 0.3: Auto-Reconnection Capability

```
TEST: Auto-Reconnection Testing

Test the MCP3.0 auto-reconnection with exponential backoff:

1. Verify connected with qsys_status
2. Note current uptime and reconnectAttempt counter
3. Ask user: "To test auto-reconnection, temporarily disconnect network or power cycle Q-SYS Core. Type 'done' when disconnected:"
4. Once user confirms:
   - Check qsys_status - should show disconnected or reconnecting
   - Wait 5 seconds
   - Check status again - should show reconnectAttempt incrementing
5. Ask user: "Restore network/power. Type 'done' when restored:"
6. Monitor reconnection:
   - Check status every 2 seconds
   - Note when connection restored
   - Verify reconnectAttempt resets to 0

EXPECTED OUTPUT:
- Initial State: [connected, uptime]
- Disconnect Detected: [yes/no]
- Reconnect Attempts: [count observed]
- Reconnection Time: [seconds]
- Final State: [connected, new uptime]
- Exponential Backoff: [delays observed: 1s, 2s, 4s, 8s, 16s]

NOTE: MCP3.0 implements automatic reconnection with exponential backoff
```

---

## SECTION 1: CONNECTION MANAGEMENT (qsys_connect & qsys_status)

### Test 1.1: Connection Configurations (5 Scenarios)

```
TEST 1.1: Connection Configuration Options

Execute these 5 connection configuration scenarios:

1. Basic Connection (Host Only):
   - ASK user: "Please provide Q-SYS Core IP for connection testing (e.g., 192.168.1.100):"
   - Use qsys_connect with just host: "[provided IP]"
   - Verify defaults applied (port: 443, secure: true, pollingInterval: 350)
   - Measure connection time (target: < 1 second)

2. Custom Port Connection:
   - Use same IP from scenario 1
   - Use qsys_connect with host and port: 443
   - Verify explicit port specification works

3. Performance Tuning (Fast Polling):
   - Use qsys_connect with pollingInterval: 34 (minimum allowed)
   - Verify connection with aggressive polling
   - Check qsys_status shows pollingInterval: 34

4. Standard Polling:
   - Use qsys_connect with pollingInterval: 350 (default)
   - Verify standard polling rate
   - Compare performance vs fast polling

5. Invalid Connection:
   - Try qsys_connect with host: "999.999.999.999"
   - Verify error handling includes suggestion
   - Confirm no impact on future connections

REPORT FORMAT:
- Scenario 1: Basic Connect = [time in ms, defaults verified]
- Scenario 2: Custom Port = [success with port 443]
- Scenario 3: Fast Polling = [connected, interval: 34ms]
- Scenario 4: Standard Polling = [connected, interval: 350ms]
- Scenario 5: Invalid Host = [error with helpful suggestion]
- Connection Performance: [all < 1 second?]
- Overall Result: [PASS/FAIL]
```

### Test 1.2: Status Information Completeness (5 Scenarios)

```
TEST 1.2: Status Information and Monitoring

Execute these 5 status monitoring scenarios IN ORDER:

1. Basic Status (while connected):
   - First ensure you are connected: use qsys_connect with host: "192.168.50.150"
   - Wait for connection to complete
   - Use qsys_status with no parameters
   - Document all fields returned (should include: connected, connectionState, host, componentCount, controlCount, pollingInterval, uptime)
   - Note: overhead verification not required (no timing data in response)

2. Detailed Status:
   - Use qsys_status with detailed: true
   - Verify component inventory included (components array with name, type, controlCount)
   - Count total components returned

3. Disconnected Status:
   - First force a disconnection: use qsys_connect with host: "1.1.1.1" (invalid IP)
   - Wait for connection to fail (will return error)
   - Now use qsys_status
   - Verify connectionState shows "disconnected"
   - Verify connected field is false

4. Reconnecting Status:
   - Connect to valid host: use qsys_connect with host: "192.168.50.150"
   - Wait for successful connection
   - Force disconnect by connecting to invalid host: use qsys_connect with host: "1.1.1.1"
   - IMMEDIATELY (within 1 second) use qsys_status
   - Check if connectionState shows "reconnecting" (may show "disconnected" if reconnect not yet started)
   - Note: reconnectAttempt field only appears when state.reconnectAttempt > 0

5. Uptime Tracking:
   - Connect fresh: use qsys_connect with host: "192.168.50.150"
   - Wait for successful connection
   - Immediately use qsys_status and note the uptime value (should be small, < 1000ms)
   - Wait exactly 5 seconds
   - Use qsys_status again and note the new uptime value
   - Verify new uptime is approximately 5000ms larger than first value (±500ms tolerance)

REPORT FORMAT:
- Scenario 1: Basic Fields = [list all fields returned]
- Scenario 2: Detailed Components = [count: X, sample: first 5 component names]
- Scenario 3: Disconnected = [connected: false, connectionState: "disconnected"]
- Scenario 4: Reconnecting = [connectionState value observed]
- Scenario 5: Uptime = [first: Xms, after 5s: Yms, difference: ~5000ms]
- Overall Result: [PASS if all scenarios complete successfully]
```

---

## SECTION 2: DISCOVERY TOOL (qsys_discover)

### Test 2.1: Component Discovery Performance (5 Scenarios)

```
TEST 2.1: Component Discovery and Caching

PREREQUISITE STEPS (execute in order):
1. Use qsys_status to check connection
2. If not connected or wrong host:
   - Use qsys_connect with host: "192.168.50.150"
   - Wait for connection response
3. Verify connected before proceeding

Execute these 5 discovery scenarios IN ORDER:

1. Full Discovery:
   - Use qsys_discover with no parameters (empty object: {})
   - Count total components in response array
   - Note: Response will be array of objects with {name, type, controlCount}
   - Save the full result for comparison in scenario 2

2. Cache Performance:
   - Wait exactly 0.5 seconds (cache is still valid)
   - Call qsys_discover again with no parameters
   - Compare results with scenario 1 - should be IDENTICAL
   - Note: Cache expires after 1 second

3. Filtered Discovery:
   - Wait 1 second for cache to expire
   - Use qsys_discover with component: "Gain"
   - Count components in result array
   - All component names should contain "Gain" (case-insensitive)
   - If no Gain components, try component: "Matrix" instead

4. Discovery with Controls:
   - Use qsys_discover with component: "Gain", includeControls: true
   - First component should have "controls" array
   - Each control should have these fields:
     * name, type, value, string, position, bool
     * NEW: direction, choices, min, max
   - Count total controls across all components

5. Large System Test:
   - Use qsys_discover with no parameters
   - Count components (typical Q-SYS has 50-200 components)
   - If count > 100, mark as "large system handled"
   - If count < 100, mark as "medium system"
   - Note: Memory monitoring not possible from MCP client

REPORT FORMAT:
- Scenario 1: Full Discovery = [X components found]
- Scenario 2: Cached = [identical: yes/no]
- Scenario 3: Filtered = [Y components match "Gain"]
- Scenario 4: With Controls = [controls included, metadata complete]
- Scenario 5: Large System = [X components, system size: large/medium]
- Overall Result: [PASS if all complete successfully]
```

### Test 2.2: Enhanced Metadata Discovery (5 Scenarios)

```
TEST 2.2: Enhanced Control Metadata Features

Test the new enhanced metadata fields in discovery:

1. Basic Metadata Check:
   - Use qsys_discover with includeControls: true
   - Pick any control and verify these NEW fields present:
     * direction (Read/Write/Read-Write)
     * choices (array for dropdowns)
     * min (minimum value)
     * max (maximum value)
   - Document which fields are populated

2. Direction Field Testing:
   - Find controls with direction: "Read"
   - Attempt qsys_set on read-only control
   - Should fail with appropriate error
   - Find controls with direction: "Read/Write"
   - Verify qsys_set works on these

3. Choices Array (Dropdown Controls):
   - Find control with choices array populated
   - Document the available choices
   - Use qsys_set with valid choice
   - Use qsys_set with invalid choice
   - Verify validation against choices

4. Min/Max Range Values:
   - Find numeric control with min/max defined
   - Try qsys_set with value below min
   - Try qsys_set with value above max
   - Try qsys_set with value in range
   - Verify range enforcement

5. Metadata in qsys_get:
   - Use qsys_get on various controls
   - Verify enhanced metadata included:
     * direction field present
     * choices array (if applicable)
     * min/max values (if applicable)
   - Compare with old version (only had value/string/position/bool)

REPORT FORMAT:
- Scenario 1: Metadata Fields = [all 4 new fields present]
- Scenario 2: Direction = [Read prevents set, Read/Write allows]
- Scenario 3: Choices = [validation works against array]
- Scenario 4: Min/Max = [range properly enforced]
- Scenario 5: Get Metadata = [enhanced fields included]
- Metadata Quality: [complete and useful]
- Overall Result: [PASS/FAIL]
```

### Test 2.3: Discovery Filtering and Patterns (5 Scenarios)

```
TEST 2.2: Advanced Discovery Filtering

Execute these 5 filtering scenarios:

1. Case-Insensitive Search:
   - Use qsys_discover with component: "GAIN"
   - Then with component: "gain"
   - Verify same results (case-insensitive)

2. Partial Match:
   - Use qsys_discover with component: "mix"
   - Should find mixer, matrix_mixer, etc.
   - Document all matches

3. Complex Pattern:
   - Use qsys_discover with component: "gain|mute|level"
   - Verify regex OR pattern works
   - Count matches for each type

4. Component Filter with Discovery:
   - Connect with filter: "Gain"
   - Use qsys_discover with no params
   - Should only see Gain components
   - Use qsys_discover with component: "Matrix"
   - Should return empty (Matrix filtered out at connection)

5. Non-Existent Component:
   - Use qsys_discover with component: "xyz123nonexistent"
   - Should return empty array, not error
   - Verify graceful handling

6. Control Type Analysis:
   - Use qsys_discover with includeControls: true
   - Analyze control types found (Float, Integer, Boolean, String)
   - Document type distribution

REPORT FORMAT:
- Scenario 1: Case Insensitive = [working correctly]
- Scenario 2: Partial Match = [found X components]
- Scenario 3: Regex Pattern = [OR pattern works]
- Scenario 4: Filter+Discovery = [filtered at connection level]
- Scenario 5: No Match = [empty array returned]
- Scenario 6: Control Types = [Float: X, Boolean: Y, etc.]
- Filter Performance: [no slowdown with patterns]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 3: REAL-TIME MONITORING (qsys_monitor)

### Test 3.1: Monitor Tool Basic Operations (5 Scenarios)

```
TEST 3.1: Real-time Monitor Tool Testing

PREREQUISITE STEPS:
1. Ensure connected: use qsys_connect with host: "192.168.50.150"
2. Use qsys_discover with component: "Gain" to find Gain components
3. If no Gain components found, use qsys_discover with no parameters and pick first component
4. Note the component name (e.g., "Gain_1") for use in tests

Execute these 5 monitor scenarios IN ORDER:

1. Start Simple Monitor:
   - Use the component from prerequisite (e.g., "Gain_1")
   - Use qsys_monitor with:
     * action: "start"
     * id: "test_monitor_1"
     * controls: ["Gain_1.gain"] (adjust component name as needed)
   - Expected response: {started: true, id: "test_monitor_1", monitoring: 1}
   - If monitoring: 0, the control path was invalid

2. Read Monitor Events (No Changes):
   - DO NOT change any controls yet
   - Use qsys_monitor with:
     * action: "read"
     * id: "test_monitor_1"
   - Expected response: {events: [], count: 0}
   - Empty array confirms no false events

3. Trigger and Capture Events:
   - First change the control: use qsys_set with:
     * controls: [{path: "Gain_1.gain", value: -10}]
   - Wait exactly 2 seconds for event to register
   - Use qsys_monitor with:
     * action: "read"
     * id: "test_monitor_1"
   - Events array should have 1 entry with:
     * path: "Gain_1.gain"
     * Value, String, Position, Bool fields
     * time: timestamp in milliseconds

4. Monitor Multiple Controls:
   - Find 5 controls: use qsys_discover with includeControls: true
   - Take first 5 control paths from any component
   - Use qsys_monitor with:
     * action: "start"
     * id: "test_monitor_2"
     * controls: [array of 5 control paths]
   - Change 3 controls using qsys_set
   - Wait 2 seconds
   - Read monitor with action: "read", id: "test_monitor_2"
   - Should have exactly 3 events

5. Stop Monitor:
   - Use qsys_monitor with:
     * action: "stop"
     * id: "test_monitor_1"
   - Expected: {stopped: true, id: "test_monitor_1"}
   - Now try to read: use qsys_monitor with:
     * action: "read"
     * id: "test_monitor_1"
   - Should get error: "Monitor not found"

REPORT FORMAT:
- Scenario 1: Start Monitor = [started: true, monitoring: 1]
- Scenario 2: Empty Read = [events: [], count: 0]
- Scenario 3: Capture Events = [1 event captured with timestamp]
- Scenario 4: Multi-Control = [3 events from 5 monitored controls]
- Scenario 5: Stop Monitor = [stopped: true, read error: "Monitor not found"]
- Overall Result: [PASS if all scenarios complete]
```

### Test 3.2: Monitor Advanced Features (5 Scenarios)

```
TEST 3.2: Advanced Monitor Capabilities

PREREQUISITE STEPS:
1. Use qsys_discover with includeControls: true
2. Pick any component with at least 3 controls
3. Note 3 control paths (e.g., "Component.control1", "Component.control2", "Component.control3")

Execute these 5 advanced scenarios IN ORDER:

1. Buffer Overflow Test:
   - Start monitor: use qsys_monitor with:
     * action: "start", id: "overflow_test", controls: [first control path]
   - Make 105 rapid changes using qsys_set:
     * Loop: set value to 0, then 1, then 2... up to 104
     * Each qsys_set call: controls: [{path: control_path, value: N}]
   - Wait 3 seconds for all events to register
   - Read monitor: action: "read", id: "overflow_test"
   - Count events in array (should be exactly 100, not 105)
   - Stop monitor: action: "stop", id: "overflow_test"

2. Multiple Monitor Instances:
   - Start monitor 1: action: "start", id: "mon_1", controls: [control_1]
   - Start monitor 2: action: "start", id: "mon_2", controls: [control_2]
   - Start monitor 3: action: "start", id: "mon_3", controls: [control_3]
   - Change control_1 with qsys_set to value: 5
   - Change control_2 with qsys_set to value: 10
   - Read mon_1: should have 1 event
   - Read mon_2: should have 1 event
   - Read mon_3: should have 0 events
   - Stop all three monitors

3. Overlapping Monitors:
   - Start monitor_A: action: "start", id: "mon_A", controls: [control_1, control_2]
   - Start monitor_B: action: "start", id: "mon_B", controls: [control_2, control_3]
   - Change control_2 with qsys_set to value: 20
   - Wait 1 second
   - Read mon_A: should have 1 event for control_2
   - Read mon_B: should also have 1 event for control_2
   - Stop both monitors

4. Monitor Non-Existent Control:
   - Try to start monitor with invalid path:
     * action: "start", id: "invalid_test", controls: ["FakeComponent.fakeControl"]
   - Response should show: started: true, monitoring: 0
   - This indicates monitor started but no valid controls
   - Stop monitor: action: "stop", id: "invalid_test"

5. Rapid Read Clearing:
   - Start monitor: action: "start", id: "clear_test", controls: [control_1]
   - Make 10 changes to control_1 (values 0-9)
   - Wait 2 seconds
   - First read: action: "read", id: "clear_test"
   - Should get events array with 10 items
   - Immediately read again: action: "read", id: "clear_test"
   - Should get events: [], count: 0 (buffer cleared)
   - Make 5 more changes (values 10-14)
   - Wait 1 second
   - Read again: should get exactly 5 new events
   - Stop monitor

REPORT FORMAT:
- Scenario 1: Buffer = [100 events max (not 105)]
- Scenario 2: Multiple = [3 monitors work independently]
- Scenario 3: Overlapping = [both captured control_2 change]
- Scenario 4: Invalid = [started: true, monitoring: 0]
- Scenario 5: Read Clear = [10 events, then 0, then 5]
- Overall Result: [PASS if all scenarios complete]
```

## SECTION 4: CONTROL OPERATIONS (qsys_get & qsys_set)

### Test 4.1: Enhanced Get Operations (5 Scenarios)

```
TEST 4.1: Control Get with Enhanced Metadata

PREREQUISITE STEPS:
1. Use qsys_connect with host: "192.168.50.150"
2. Use qsys_discover with component: "Gain", includeControls: true
3. If no Gain found, use qsys_discover with includeControls: true and pick first component
4. Note control paths from the component for testing

Execute these 5 get scenarios IN ORDER:

1. Single Control Get with Metadata:
   - Pick a ".gain" control path (e.g., "Gain_1.gain")
   - Use qsys_get with controls: ["Gain_1.gain"]
   - Response array should have 1 object with these fields:
     * control: the path you requested
     * value: numeric value
     * string: string representation
     * position: 0-1 normalized position
     * bool: boolean state
     * direction: "Read", "Write", or "Read/Write"
     * choices: array (may be empty)
     * min: minimum value (may be undefined)
     * max: maximum value (may be undefined)
   - Count how many fields are present (should be 9 including control)

2. Dropdown Control Get:
   - Use qsys_discover to find a control with type "String" that has choices
   - Common examples: routing selectors, mode switches
   - Use qsys_get on that control
   - Verify choices array is not empty
   - Current string value should match one of the choices
   - If no dropdown found, skip with note "No dropdown controls available"

3. Read-Only Control Get:
   - Look for control with ".status" or ".meter" in name
   - Use qsys_get on it
   - Check if direction field shows "Read"
   - If direction is "Read", try qsys_set with:
     * controls: [{path: control_path, value: 0}]
   - Should get error mentioning read-only or permission
   - If no read-only found, note "No read-only controls found"

4. Range-Limited Control:
   - Use gain control from scenario 1
   - qsys_get should show min and max values (typically -100 to 20 for gain)
   - Try qsys_set with value: min - 10 (e.g., -110 for gain)
   - Should get error about minimum value
   - Try qsys_set with value: max + 10 (e.g., 30 for gain)
   - Should get error about maximum value
   - Try qsys_set with value: 0 (midrange)
   - Should succeed with confirmed: true

5. Batch Get with Mixed Types:
   - Use qsys_discover with includeControls: true
   - Find at least 3 different control types (Float, Boolean, String)
   - Create array of 10 control paths mixing these types
   - Use qsys_get with controls: [array of 10 paths]
   - For each control in response:
     * Boolean type: should have direction, no min/max
     * Float type: should have min/max, no choices
     * String type: might have choices, no min/max
   - If can't find 10 controls, use whatever available

REPORT FORMAT:
- Scenario 1: Full Metadata = [9 fields present on gain control]
- Scenario 2: Dropdown = [choices array populated or N/A]
- Scenario 3: Read-Only = [direction field works or N/A]
- Scenario 4: Range = [min: X, max: Y, validation works]
- Scenario 5: Mixed Types = [10 controls retrieved with appropriate metadata]
- Overall Result: [PASS if core scenarios work]
```

### Test 4.2: Batch Get Operations (5 Scenarios)

```
TEST 4.2: Control Value Retrieval in Batches

PREREQUISITE STEPS:
1. Use qsys_connect with host: "192.168.50.150"
2. Use qsys_discover with includeControls: true
3. Collect control paths from multiple components
4. You need at least 100 valid control paths for this test

Execute these 5 batch retrieval scenarios IN ORDER:

1. Single Control Get:
   - Pick any single control path (e.g., "Gain_1.gain")
   - Use qsys_get with controls: [single_path]
   - Verify response array has 1 object with:
     * value (number), string, position, bool
     * direction, choices, min, max
   - All 8 metadata fields should be present

2. Small Batch (10 controls):
   - Create array of exactly 10 control paths
   - Use qsys_get with controls: [array_of_10]
   - Response should have exactly 10 objects
   - Each object should have control field matching requested path
   - Note: Parallel execution means all 10 return together

3. Medium Batch (50 controls):
   - Create array of exactly 50 control paths
   - Use qsys_get with controls: [array_of_50]
   - Response should have exactly 50 objects
   - Verify no errors in any control response
   - All should complete successfully

4. Maximum Batch (100 controls):
   - Create array of exactly 100 control paths
   - Use qsys_get with controls: [array_of_100]
   - Response should have exactly 100 objects
   - This is the maximum allowed per call
   - All should return valid data

5. Error Handling in Batch:
   - Create array with 10 paths:
     * 5 valid paths from discovery
     * 5 invalid: ["Fake.control", "Bad.path", "No.exist", "Wrong.name", "Invalid.ctrl"]
   - Use qsys_get with controls: [mixed_array]
   - Response should have 10 objects
   - Valid paths: have value, string, etc.
   - Invalid paths: have error field with helpful message
   - Errors should suggest available controls

REPORT FORMAT:
- Scenario 1: Single Get = [8 fields present]
- Scenario 2: Batch 10 = [10 responses received]
- Scenario 3: Batch 50 = [50 responses received]
- Scenario 4: Batch 100 = [100 responses received, max limit works]
- Scenario 5: Mixed Valid/Invalid = [5 valid, 5 errors with suggestions]
- Overall Result: [PASS if all batches complete]
```

### Test 4.3: Batch Set Operations with Validation (5 Scenarios)

```
TEST 4.3: Control Value Setting with Type Safety

PREREQUISITE STEPS:
1. Use qsys_discover with includeControls: true
2. Identify controls by type:
   - Float controls (Type: "Float") - usually gains, levels
   - Boolean controls (Type: "Boolean") - usually mutes, enables
   - Integer controls (Type: "Integer") - if available
3. Note their paths and current values

Execute these 5 batch set scenarios IN ORDER:

1. Simple Set with Type Validation:
   - Find one Float control (e.g., gain)
   - Find one Boolean control (e.g., mute)
   - Use qsys_set with controls:
     [{path: float_path, value: -10.5},
      {path: bool_path, value: true}]
   - Both should return confirmed: true
   - Try setting Boolean with number:
     [{path: bool_path, value: 1}]
   - Should get type error: "Boolean control requires true/false"

2. Batch Set (10 controls):
   - Create array of 10 control updates
   - Mix Float and Boolean types with valid values
   - Use qsys_set with controls: [array_of_10]
   - Response should have 10 objects
   - Each should have confirmed: true
   - All should complete together (parallel)

3. Range Validation:
   - Use a gain control (typically min: -100, max: 20)
   - First get the control to see actual min/max
   - Try qsys_set with value: -200 (below min)
   - Error should state: "Value -200 below minimum -100"
   - Try qsys_set with value: 50 (above max)
   - Error should state: "Value 50 above maximum 20"
   - Try qsys_set with value: 0 (valid)
   - Should succeed with confirmed: true

4. Protected Control Testing:
   - Look for control starting with "Master." or "Emergency."
   - If none exist, try "SystemMute" or any ".power" control
   - First attempt without force:
     [{path: protected_path, value: any_value}]
   - Should get error: "Protected control. Use force:true to override"
   - Retry with force:
     [{path: protected_path, value: any_value, force: true}]
   - Should succeed with confirmed: true
   - If no protected controls, note "No protected controls found"

5. Maximum Batch (50 controls):
   - Create array of exactly 50 control updates
   - Use any available control paths
   - Set all to safe values (0 for gains, false for mutes)
   - Use qsys_set with controls: [array_of_50]
   - This is the maximum allowed per call
   - All 50 should return with confirmed: true
   - Or error if control is read-only

REPORT FORMAT:
- Scenario 1: Type Validation = [Float works, Boolean works, type error caught]
- Scenario 2: Batch 10 = [10 confirmed updates]
- Scenario 3: Range Check = [min: X, max: Y, validation works]
- Scenario 4: Protection = [blocked without force, succeeded with force]
- Scenario 5: Batch 50 = [50 updates processed, max limit works]
- Overall Result: [PASS if validation and batching work]
```

### Test 4.4: Error Messages and Recovery (5 Scenarios)

```
TEST 3.3: Helpful Error Messages

Execute these 5 error message scenarios:

1. Invalid Component Name:
   - Use qsys_get with path "FakeComponent.control"
   - Verify error suggests available components

2. Invalid Control Name:
   - Use valid component but fake control name
   - Verify error suggests available controls for that component

3. Malformed Path:
   - Use qsys_get with path "NoDotsHere"
   - Verify clear error about path format

4. Type Mismatch:
   - Try setting Boolean control with number
   - Try setting Float control with string
   - Verify specific type error messages

5. Batch Partial Failure:
   - Set 5 controls where 2 will fail
   - Verify successful ones complete
   - Verify failed ones have clear errors

REPORT FORMAT:
- Scenario 1: Bad Component = [suggests alternatives]
- Scenario 2: Bad Control = [suggests valid controls]
- Scenario 3: Bad Format = [explains format requirement]
- Scenario 4: Type Errors = [specific and helpful]
- Scenario 5: Partial Batch = [3 succeed, 2 fail with reasons]
- Error Quality: [actionable suggestions provided?]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 5: PERFORMANCE AND STRESS TESTING

### Test 5.1: Sustained Load Testing with Monitoring (5 Scenarios)

```
TEST 5.1: System Performance Under Load with Monitors

PREREQUISITE STEPS:
1. Use qsys_connect with host: "192.168.50.150"
2. Use qsys_discover with includeControls: true
3. Collect at least 20 control paths for testing

Execute these 5 performance stress tests IN ORDER:

1. Monitor Performance Impact:
   - Start 5 monitors, each with 2 controls:
     * qsys_monitor action: "start", id: "perf_1", controls: [2 paths]
     * qsys_monitor action: "start", id: "perf_2", controls: [2 paths]
     * Continue for perf_3, perf_4, perf_5
   - Execute 50 qsys_get calls with single control each
   - All operations should complete without errors
   - Stop all 5 monitors when done

2. Sustained Monitoring:
   - Pick 20 control paths
   - Start monitor: action: "start", id: "sustained", controls: [20 paths]
   - Loop 15 times (simulating 30 seconds):
     * Change 10 of the monitored controls with qsys_set
     * Wait 2 seconds
     * Read monitor: action: "read", id: "sustained"
     * Note event count
   - Total events should roughly match total changes made
   - Stop monitor when done

3. Mixed Operation Load with Monitors:
   - Start 2 monitors with 5 controls each
   - Execute in sequence:
     * 25 qsys_get calls
     * 25 qsys_set calls
     * 25 qsys_discover calls
     * 25 qsys_status calls
     * Read both monitors every 10 operations
   - All 100 operations should complete
   - Stop both monitors

4. Monitor Stress Test:
   - Start 10 monitors (id: "stress_0" through "stress_9")
   - Each monitoring 5 different controls
   - Change 25 controls using qsys_set
   - Read all 10 monitors
   - Each monitor should only have events for its controls
   - Stop all 10 monitors
   - Verify all stop successfully

5. Filter + Monitor Performance:
   - Reconnect with filter: use qsys_connect with host and filter: "Gain"
   - Use qsys_discover to verify reduced component count
   - Start monitor on available Gain controls only
   - Perform 20 operations (get/set) on filtered controls
   - All should complete successfully
   - Note: Filtered connection uses less memory

REPORT FORMAT:
- Scenario 1: Monitor Overhead = [50 gets completed with 5 monitors active]
- Scenario 2: Sustained = [~150 events captured over 15 reads]
- Scenario 3: Mixed + Monitors = [100 operations completed]
- Scenario 4: 10 Monitors = [all started, read, and stopped successfully]
- Scenario 5: Filtered = [reduced to X Gain components, ops successful]
- Overall Result: [PASS if all complete without errors]
```

### Test 5.2: Sustained Load Testing (5 Scenarios)

```
TEST 4.1: System Performance Under Load

Execute these 5 performance stress tests:

1. Rapid Sequential Operations:
   - Execute 50 qsys_get calls as fast as possible
   - Measure average response time
   - Verify no degradation

2. Large Discovery Caching:
   - Call qsys_discover 10 times in 2 seconds
   - First call should be slower (fresh)
   - Next 9 should hit cache (< 1ms each)

3. Mixed Operation Load:
   - Alternate between get, set, discover, status (25 each)
   - Total 100 operations
   - Measure total time and memory usage

4. Sustained 1-Minute Test:
   - Continuous operations for 60 seconds
   - Mix all 5 tools randomly
   - Monitor for memory leaks (must stay < 50MB)

5. Recovery After Load:
   - Stop all operations
   - Wait 5 seconds
   - Verify normal operation resumes
   - Check memory returns to baseline

REPORT FORMAT:
- Scenario 1: 50 Sequential = [avg time, stable performance]
- Scenario 2: Cache Hit Rate = [9/10 cached as expected]
- Scenario 3: Mixed 100 Ops = [total time, memory stable]
- Scenario 4: 1-Min Sustained = [ops/sec, memory < 50MB]
- Scenario 5: Recovery = [normal ops restored, memory OK]
- Performance Grade: [A/B/C/D/F based on targets]
- Overall Result: [PASS/FAIL]
```

### Test 5.3: Parallel Operation Testing (5 Scenarios)

```
TEST 5.3: Parallel Batch Performance

PREREQUISITE STEPS:
1. Use qsys_discover to collect 100+ control paths
2. Prepare arrays of different sizes for testing

Execute these 5 parallel operation tests IN ORDER:

1. Sequential vs Batch Comparison:
   - Pick 20 control paths
   - Sequential: Call qsys_get 20 times, each with 1 control
     * controls: [path1], then controls: [path2], etc.
   - Batch: Call qsys_get once with all 20
     * controls: [path1, path2, ... path20]
   - Both should work, batch returns all 20 at once
   - Note: Batch is more efficient (1 round trip vs 20)

2. Parallel Set Operations:
   - Create 30 control updates
   - Use qsys_set with controls: [array of 30 updates]
   - Response should have 30 objects
   - All should have confirmed: true (or error if read-only)
   - All 30 process together, not one-by-one

3. Maximum Parallel Gets:
   - Create array of exactly 100 control paths
   - Use qsys_get with controls: [array of 100]
   - Should return 100 control values
   - This is the maximum per call
   - All return together in one response

4. Maximum Parallel Sets:
   - Create array of exactly 50 control updates
   - Use qsys_set with controls: [array of 50]
   - Should return 50 confirmations
   - This is the maximum per call
   - All process together

5. Concurrent Tool Calls:
   - Note: MCP tools process sequentially, not concurrently
   - Call qsys_get with 50 controls
   - Immediately call qsys_status
   - Both should complete successfully
   - Second call waits for first to finish

REPORT FORMAT:
- Scenario 1: Sequential vs Batch = [20 individual vs 1 batch call works]
- Scenario 2: Parallel Sets = [30 updates in single response]
- Scenario 3: 100 Gets = [maximum batch retrieved]
- Scenario 4: 50 Sets = [maximum batch updated]
- Scenario 5: Tool Calls = [both complete successfully]
- Overall Result: [PASS if all batches work]
```

---

## SECTION 6: EDGE CASES AND LIMITS

### Test 6.1: Boundary Testing with New Features (5 Scenarios)

```
TEST 6.1: System Limits with Enhanced Features

PREREQUISITE STEPS:
1. Use qsys_connect with host: "192.168.50.150"
2. Use qsys_discover to get available components

Execute these 5 boundary tests IN ORDER:

1. Monitor Limits:
   - Try empty array: qsys_monitor with:
     * action: "start", id: "empty_test", controls: []
   - Should either error or start with monitoring: 0
   - Try 200 controls (create large array):
     * action: "start", id: "large_test", controls: [200 paths]
   - Should handle gracefully (may limit or accept all)
   - Try duplicate ID while "large_test" still active:
     * action: "start", id: "large_test", controls: [any path]
   - May error or replace existing monitor
   - Stop any started monitors

2. Filter Pattern Limits:
   - Try invalid regex: qsys_connect with:
     * host: "192.168.50.150", filter: "[invalid(regex"
   - Should error with "Invalid filter pattern"
   - Try filter matching nothing:
     * host: "192.168.50.150", filter: "^NoSuchComponent$"
   - Should error "No components match filter"
   - Try filter matching everything:
     * host: "192.168.50.150", filter: ".*"
   - Should connect with all components
   - Try complex pattern:
     * host: "192.168.50.150", filter: "(Gain|Matrix).*[0-9]+$"
   - Should work if valid regex

3. Metadata Edge Cases:
   - Use qsys_get on various controls
   - Look for controls where:
     * min/max are undefined (common for non-numeric)
     * choices is empty array or undefined
     * direction might be missing
   - All should return without crashing
   - Missing fields should be undefined or appropriate defaults

4. Monitor ID Validation:
   - Try special characters:
     * action: "start", id: "test!@#$%", controls: [path]
   - Try very long ID (create 150 character string):
     * action: "start", id: "x" repeated 150 times, controls: [path]
   - Try numeric only:
     * action: "start", id: "12345", controls: [path]
   - Try empty string:
     * action: "start", id: "", controls: [path]
   - Each should either work or give clear error
   - Stop any successful monitors

5. Combined Feature Limits:
   - Connect with strict filter:
     * qsys_connect host: "192.168.50.150", filter: "^Gain"
   - Use qsys_discover to see filtered components
   - Start monitor on filtered component:
     * action: "start", id: "filtered", controls: ["Gain_1.gain"]
   - Try to monitor non-filtered component:
     * action: "start", id: "outside", controls: ["Matrix_1.crosspoint"]
   - Should fail since Matrix not in filtered set
   - Error should mention component not found

REPORT FORMAT:
- Scenario 1: Monitor Limits = [empty: X, 200: Y, duplicate: Z]
- Scenario 2: Filter Patterns = [invalid: error, empty: error, all: works]
- Scenario 3: Missing Metadata = [handled gracefully, no crashes]
- Scenario 4: Monitor IDs = [special: X, long: Y, numeric: Z, empty: W]
- Scenario 5: Filter+Monitor = [filtered works, outside filter fails]
- Overall Result: [PASS if no crashes]
```

### Test 6.2: Boundary Testing (5 Scenarios)

```
TEST 6.2: System Limits and Boundaries

PREREQUISITE STEPS:
1. Have connection ready
2. Use qsys_discover to get valid control paths

Execute these 5 boundary test scenarios IN ORDER:

1. Minimum Polling Interval:
   - Connect with below minimum:
     * qsys_connect host: "192.168.50.150", pollingInterval: 33
   - Check response or qsys_status
   - Should show pollingInterval: 34 (clamped to minimum)
   - Connect with exact minimum:
     * qsys_connect host: "192.168.50.150", pollingInterval: 34
   - Should show pollingInterval: 34 (accepted)

2. Empty Batch Operations:
   - Try empty get:
     * qsys_get with controls: []
   - Should error: requires at least 1 control
   - Try empty set:
     * qsys_set with controls: []
   - Should error: requires at least 1 control

3. Exceeding Batch Limits:
   - Create array of 101 control paths
   - Try qsys_get with controls: [101 paths]
   - Should error mentioning 100 maximum
   - Create array of 51 control updates
   - Try qsys_set with controls: [51 updates]
   - Should error mentioning 50 maximum

4. Long Control Names:
   - Most Q-SYS controls have reasonable names
   - Try a very long fake path:
     * "VeryLongComponentName1234567890.VeryLongControlName1234567890"
   - Use qsys_get with this path
   - Should error gracefully
   - Error message should be readable (not overflow)

5. Special Characters in Paths:
   - Q-SYS typically uses: letters, numbers, spaces, underscores
   - Try these paths in qsys_get:
     * "Component_1.control_name" (underscores - should work)
     * "Component 1.control name" (spaces - may work)
     * "Component-1.control-name" (hyphens - may work)
     * "Component.control.extra.dots" (extra dots - should fail)
   - Valid characters should parse correctly
   - Invalid should give format error

REPORT FORMAT:
- Scenario 1: Polling Limits = [33 clamped to 34, 34 accepted]
- Scenario 2: Empty Batches = [both error with minItems message]
- Scenario 3: Over Limits = [101 error max 100, 51 error max 50]
- Scenario 4: Long Names = [error handled gracefully]
- Scenario 5: Special Chars = [underscores work, extra dots fail]
- Overall Result: [PASS if limits enforced]
```

### Test 6.3: Configuration and Environment (5 Scenarios)

```
TEST 5.2: Configuration Management

Test MCP3.0's configuration handling:

1. Environment Variables:
   - Set QSYS_HOST env var
   - Start new connection
   - Verify auto-connects to env var host

2. Saved Configuration:
   - Connect successfully
   - Check ~/.qsys-mcp/last-connection.json created
   - Verify contains host, port, secure, pollingInterval

3. Auto-Connect Feature:
   - With saved config present
   - Restart MCP server
   - Verify auto-connects on startup

4. Debug Mode:
   - Set QSYS_MCP_DEBUG=true
   - Perform operations
   - Verify debug output to stderr

5. Config Priority:
   - Set different values in env, config, and runtime
   - Verify priority: runtime > env > saved config

REPORT FORMAT:
- Scenario 1: Env Variables = [QSYS_HOST works]
- Scenario 2: Config Saved = [file created with settings]
- Scenario 3: Auto-Connect = [connects on startup]
- Scenario 4: Debug Mode = [logging to stderr]
- Scenario 5: Priority = [correct override order]
- Config System: [working as designed]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 7: INTEGRATION TESTING

### Test 7.1: Complete Workflow with New Features (5 Scenarios)

```
TEST 7.1: End-to-End Integration with All Features

Execute these 5 complete workflow scenarios STEP BY STEP:

1. Filtered Discovery to Monitoring:
   Step 1: Connect with filter
     - qsys_connect host: "192.168.50.150", filter: "Gain"
   Step 2: Verify filter worked
     - qsys_discover with no parameters
     - Should only show components with "Gain" in name
   Step 3: Start monitoring
     - Collect all .gain control paths from discovery
     - qsys_monitor action: "start", id: "gain_mon", controls: [gain paths]
   Step 4: Change values
     - qsys_set with 3 gain controls to value: -10
   Step 5: Read events
     - Wait 2 seconds
     - qsys_monitor action: "read", id: "gain_mon"
     - Should have 3 events
   Step 6: Cleanup
     - qsys_monitor action: "stop", id: "gain_mon"

2. Metadata-Driven UI Workflow:
   Step 1: Get detailed controls
     - qsys_discover component: "Matrix", includeControls: true
     - If no Matrix, use any component
   Step 2: Find dropdown control
     - Look for control with non-empty choices array
     - Note the available choices
   Step 3: Set valid choice
     - qsys_set with value from choices array
   Step 4: Find ranged control
     - Look for control with min/max defined
   Step 5: Test range validation
     - Try value below min (should fail)
     - Try value within range (should work)

3. Read-Only Control Handling:
   Step 1: Get mixed controls
     - qsys_get with 10 different control paths
   Step 2: Categorize by direction
     - Group into Read-only and Read/Write
   Step 3: Attempt batch set
     - Create updates only for Read/Write controls
     - qsys_set with filtered list
   Step 4: Verify results
     - All Read/Write should confirm
     - No attempts on Read-only controls

4. Real-time Dashboard Workflow:
   Step 1: Setup monitors
     - qsys_monitor action: "start", id: "dash_1", controls: [3 paths]
     - qsys_monitor action: "start", id: "dash_2", controls: [3 paths]
     - qsys_monitor action: "start", id: "dash_3", controls: [3 paths]
   Step 2: Initial read
     - Read all 3 monitors (should be empty)
   Step 3: Make changes
     - qsys_set to change 2 controls from each monitor
   Step 4: Read updates (repeat 3 times)
     - Wait 2 seconds
     - Read all 3 monitors
     - Each should show its changes
   Step 5: Cleanup
     - Stop all 3 monitors

5. Memory-Optimized Large System:
   Step 1: Full connection baseline
     - qsys_connect host: "192.168.50.150" (no filter)
     - qsys_status to see componentCount
   Step 2: Filtered connection
     - qsys_connect host: "192.168.50.150", filter: "^(Gain|Level)"
     - qsys_status to see reduced componentCount
   Step 3: Operations on filtered set
     - qsys_discover (should only show filtered)
     - qsys_get on filtered controls
     - qsys_set on filtered controls
   Step 4: Monitor filtered only
     - Start monitor on filtered controls
     - Verify works normally
   Step 5: Compare
     - Note component reduction (e.g., 89 → 10)
     - Calculate percentage saved

REPORT FORMAT:
- Scenario 1: Filter→Monitor = [6 steps completed]
- Scenario 2: Metadata UI = [choices and ranges work]
- Scenario 3: Read-Only = [skipped read-only correctly]
- Scenario 4: Dashboard = [3 monitors captured changes]
- Scenario 5: Optimized = [89 → X components, Y% reduction]
- Overall Result: [PASS if workflows complete]
```

### Test 7.2: Complete Workflow Testing (5 Scenarios)

```
TEST 7.2: End-to-End Integration Workflows

Execute these 5 complete workflow scenarios STEP BY STEP:

1. Discovery to Control:
   Step 1: Discover components
     - qsys_discover with no parameters
     - Pick first component with > 5 controls
   Step 2: Read current values
     - qsys_get with 5 control paths from that component
     - Note current values
   Step 3: Modify values
     - qsys_set same 5 controls with new values
     - All should confirm
   Step 4: Verify changes
     - qsys_get same 5 controls again
     - Values should match what you set

2. Connection Loss Recovery:
   Step 1: Establish baseline
     - qsys_connect host: "192.168.50.150"
     - qsys_status shows connected
   Step 2: Working operations
     - qsys_get with any control (verify works)
   Step 3: Force disconnection
     - qsys_connect host: "1.1.1.1" (invalid)
     - Will error but state changes
   Step 4: Check disconnected
     - qsys_status shows disconnected
   Step 5: Reconnect
     - qsys_connect host: "192.168.50.150"
     - qsys_status shows connected again
   Step 6: Verify resumed
     - qsys_get with same control works

3. Filtered Discovery to Batch Update:
   Step 1: Filtered discovery
     - qsys_discover component: "Gain"
     - Collect all component names
   Step 2: Build control paths
     - For each Gain component, append ".gain"
     - Create array of all gain paths
   Step 3: Read current
     - qsys_get with all gain paths
     - Note current values
   Step 4: Batch update
     - qsys_set all gains to value: -20
   Step 5: Verify
     - qsys_get all gains again
     - All should be -20

4. Status Monitoring During Operations:
   Step 1: Start operations
     - Begin qsys_get with 50 controls
   Step 2: Check status
     - Immediately qsys_status
     - Should still show connected
   Step 3: More operations
     - qsys_set with 25 controls
     - qsys_discover
   Step 4: Final status
     - qsys_status
     - Component/control counts unchanged

5. Error Recovery Flow:
   Step 1: Baseline state
     - qsys_status shows connected
   Step 2: Trigger error
     - qsys_connect host: "invalid.host.com"
     - Will error
   Step 3: Check state
     - qsys_status shows disconnected
   Step 4: Wait and retry
     - Wait 2 seconds
     - qsys_connect host: "192.168.50.150"
   Step 5: Verify recovery
     - qsys_status shows connected
     - qsys_get works normally

REPORT FORMAT:
- Scenario 1: Discovery→Control = [4 steps: discover, get, set, verify]
- Scenario 2: Connection Recovery = [6 steps completed]
- Scenario 3: Filtered→Batch = [all gains set to -20]
- Scenario 4: Concurrent Status = [status accurate throughout]
- Scenario 5: Error Recovery = [disconnected → reconnected]
- Overall Result: [PASS if all complete]
```

---

## SECTION 8: FINAL VALIDATION

### Test 8.1: Comprehensive System Validation with New Features

```
TEST 8.1: Complete MCP3.0 Validation Including Enhancements

This is the final comprehensive test covering all features:

1. PERFORMANCE VALIDATION:
   - Connection time: < 1 second (with and without filter)
   - Tool overhead: < 10ms per operation
   - Monitor overhead: < 5ms per event
   - Memory usage: < 50MB throughout
   - Filtered connection: < 30MB
   - Document actual measurements

2. TOOL COVERAGE:
   - Verify all 6 tools accessible:
     * qsys_connect (with filter option)
     * qsys_discover (with enhanced metadata)
     * qsys_get (with direction/choices/min/max)
     * qsys_set (with metadata validation)
     * qsys_status
     * qsys_monitor (NEW - real-time events)
   - Test one operation per tool

3. NEW FEATURE VALIDATION:
   - Component filtering reduces memory by X%
   - Enhanced metadata includes all 4 new fields
   - Monitor captures real-time events
   - Circular buffer limits to 100 events
   - Multiple monitors work independently
   - Read-only controls properly identified

4. RELIABILITY TEST:
   - 100 random operations including monitors
   - Mix of all 6 tools
   - Include filtered and non-filtered configs
   - Include monitor start/read/stop cycles
   - Verify 95%+ success rate

5. PRODUCTION READINESS:
   Generate final report with:
   - Performance metrics vs targets
   - Memory usage (filtered vs non-filtered)
   - Monitor event capture rate
   - Metadata completeness
   - Error handling quality
   - Missing features (if any)

=== FINAL VALIDATION REPORT ===

PERFORMANCE METRICS:
- Connection Time: [actual ms] / 1000ms target
- Filtered Connection: [actual ms] / 500ms target
- Tool Overhead: [actual ms] / 10ms target
- Monitor Overhead: [actual ms] / 5ms target
- Memory (Full): [actual MB] / 50MB target
- Memory (Filtered): [actual MB] / 30MB target
- Batch Parallel: [verified/not verified]

TOOL VALIDATION:
- Available Tools: [6/6]
- Working Tools: [X/6]
- Failed Tools: [list any]

NEW FEATURES:
- Component Filter: [working, X% memory reduction]
- Enhanced Metadata: [4/4 fields working]
- Monitor Tool: [real-time capture working]
- Circular Buffer: [100 event limit working]
- Read-Only Detection: [direction field working]

FEATURES:
- Auto-Reconnect: [working/not working]
- Discovery Cache: [working/not working]
- Type Validation: [working/not working]
- Protected Controls: [working/not working]
- Error Messages: [helpful/confusing]

RELIABILITY:
- Operations Tested: 100
- Successful: [X/100]
- Success Rate: [X%]
- Monitor Events Captured: [X/Y expected]
- Recovery Time: [avg ms]

PRODUCTION READINESS:
- Score: [X/100]
- Grade: [A/B/C/D/F]
- Status: [Ready/Not Ready]

CRITICAL ISSUES:
[List any blockers]

RECOMMENDATIONS:
[Top 3 improvements needed]

=== END REPORT ===
```

### Test 8.2: Comprehensive System Validation

```
TEST 7.1: Complete MCP3.0 Validation

This is the final comprehensive test covering all requirements:

1. PERFORMANCE VALIDATION:
   - Connection time: < 1 second
   - Tool overhead: < 10ms per operation
   - Memory usage: < 50MB throughout
   - Startup time: < 500ms
   - Document actual measurements

2. TOOL COVERAGE:
   - Verify all 5 tools accessible:
     * qsys_connect
     * qsys_discover  
     * qsys_get
     * qsys_set
     * qsys_status
   - Test one operation per tool

3. FEATURE VALIDATION:
   - Auto-reconnection with exponential backoff
   - 1-second discovery cache
   - Parallel batch operations
   - Type and range validation
   - Protected control handling
   - Helpful error messages

4. RELIABILITY TEST:
   - 100 random operations
   - Mix of all tools
   - Include some errors
   - Verify 95%+ success rate

5. PRODUCTION READINESS:
   Generate final report with:
   - Performance metrics vs targets
   - Memory usage (peak and average)
   - Error handling quality
   - Auto-recovery capability
   - Missing features (if any)

=== FINAL VALIDATION REPORT ===

PERFORMANCE METRICS:
- Connection Time: [actual ms] / 1000ms target
- Tool Overhead: [actual ms] / 10ms target  
- Memory Usage: [actual MB] / 50MB target
- Startup Time: [actual ms] / 500ms target
- Batch Parallel: [verified/not verified]

TOOL VALIDATION:
- Available Tools: [5/5]
- Working Tools: [X/5]
- Failed Tools: [list any]

FEATURES:
- Auto-Reconnect: [working/not working]
- Discovery Cache: [working/not working]
- Type Validation: [working/not working]
- Protected Controls: [working/not working]
- Error Messages: [helpful/confusing]

RELIABILITY:
- Operations Tested: 100
- Successful: [X/100]
- Success Rate: [X%]
- Recovery Time: [avg ms]

PRODUCTION READINESS:
- Score: [X/100]
- Grade: [A/B/C/D/F]
- Status: [Ready/Not Ready]

CRITICAL ISSUES:
[List any blockers]

RECOMMENDATIONS:
[Top 3 improvements needed]

=== END REPORT ===
```

---

## TEST EXECUTION INSTRUCTIONS

### For Test Operators:

1. **Always start with Test 0.1** (Connection Verification)
2. **Copy entire test blocks** including expected output format
3. **Provide actual Q-SYS Core IP** when prompted
4. **Document exact timings** for performance tests
5. **Save complete results** for analysis

### Expected Testing Time:

- Quick Validation (Tests 0.1, 1.1, 2.1, 3.1): ~5 minutes
- Standard Validation (All sections except 7): ~15 minutes  
- Comprehensive Validation (All sections): ~20 minutes

### Success Criteria:

- **PASS**: Meets all performance targets and functional requirements
- **FAIL**: Misses performance targets or functional errors
- **PARTIAL**: Works but with performance below target

### Critical Success Metrics:

- All 5 tools must be accessible and functional
- Connection time must be < 1 second
- Tool overhead must be < 10ms
- Memory usage must stay < 50MB
- Auto-reconnection must work
- Batch operations must be parallel

---

## QUICK REFERENCE: MCP3.0 TOOLS

1. **qsys_connect** - Connect to Q-SYS Core with configuration options
   - NEW: `filter` parameter for component filtering (regex)
2. **qsys_discover** - Discover components and controls with caching
   - NEW: Returns `direction`, `choices`, `min`, `max` fields
3. **qsys_get** - Get control values in parallel batches (max 100)
   - NEW: Includes `direction`, `choices`, `min`, `max` in response
4. **qsys_set** - Set control values with validation (max 50)
5. **qsys_status** - Get connection status and system information
6. **qsys_monitor** - NEW: Real-time control monitoring
   - Actions: start, read, stop
   - Circular buffer of 100 events
   - Multiple independent monitors

## KEY DIFFERENCES FROM V1

- **Reduced from 18 to 6 tools** - Direct SDK pass-through pattern
- **No change groups** - Removed for simplicity
- **NEW: Real-time monitoring** - Via qsys_monitor tool
- **NEW: Component filtering** - Reduce memory usage
- **NEW: Enhanced metadata** - direction, choices, min/max fields
- **No API documentation tool** - Removed as unnecessary
- **Single connection action** - Instead of 11 separate actions
- **1-second discovery cache** - For performance optimization
- **Strict batch limits** - 100 for get, 50 for set
- **Protected control patterns** - Built-in safety

---

## NOTES

- Test results should be reported immediately after each test
- Performance metrics must include actual times in milliseconds
- Memory usage should be monitored throughout testing
- All batch operations should verify parallel execution
- Connection issues should be resolved before continuing tests

---

END OF TEST PROMPTS v2 - MCP3.0 Edition