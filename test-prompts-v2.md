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

Execute these 5 status monitoring scenarios:

1. Basic Status:
   - Use qsys_status with no parameters
   - Document all fields returned
   - Verify minimal overhead (< 10ms)

2. Detailed Status:
   - Use qsys_status with detailed: true
   - Verify component inventory included
   - Check performance impact

3. Disconnected Status:
   - Disconnect from Core (if connected)
   - Use qsys_status
   - Verify shows disconnected state properly

4. Reconnecting Status:
   - During reconnection attempt
   - Use qsys_status
   - Check for reconnectAttempt counter

5. Uptime Tracking:
   - Connect and note time
   - Wait 30 seconds
   - Check qsys_status shows correct uptime

REPORT FORMAT:
- Scenario 1: Basic Fields = [list all fields]
- Scenario 2: Detailed Components = [count, sample shown]
- Scenario 3: Disconnected = [proper state shown]
- Scenario 4: Reconnecting = [attempt counter present]
- Scenario 5: Uptime = [accurate to within 1s]
- Status Overhead: [< 10ms verified?]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 2: DISCOVERY TOOL (qsys_discover)

### Test 2.1: Component Discovery Performance (5 Scenarios)

```
TEST 2.1: Component Discovery and Caching

PREREQUISITE: Check connection with qsys_status. If not connected:
- ASK user: "Q-SYS Core connection required. Please provide IP address (e.g., 192.168.1.100):"
- Connect using qsys_connect with host: "[provided IP]"

Execute these 5 discovery scenarios:

1. Full Discovery:
   - Use qsys_discover with no parameters
   - Measure response time
   - Count total components found

2. Cache Performance:
   - Immediately call qsys_discover again
   - Measure response time (should be < 1ms due to 1-second cache)
   - Verify identical results

3. Filtered Discovery:
   - Use qsys_discover with component: "gain"
   - Count filtered results
   - Verify regex pattern matching works

4. Discovery with Controls:
   - Use qsys_discover with includeControls: true
   - Verify control details included
   - Check for value, string, position, bool fields

5. Large System Test:
   - Use qsys_discover on full system
   - Verify handles 100+ components
   - Confirm memory usage stays < 50MB

REPORT FORMAT:
- Scenario 1: Full Discovery = [component count, time in ms]
- Scenario 2: Cached = [time < 1ms, identical results]
- Scenario 3: Filtered = [count matches pattern]
- Scenario 4: With Controls = [control details present]
- Scenario 5: Large System = [handled efficiently]
- Discovery Performance: [meets < 10ms target?]
- Overall Result: [PASS/FAIL]
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

Test the new qsys_monitor tool for real-time control monitoring:

1. Start Simple Monitor:
   - Find a Gain control using qsys_discover
   - Use qsys_monitor with:
     * action: "start"
     * id: "test_monitor_1"
     * controls: ["[GainComponent].gain"]
   - Verify response: started: true, monitoring: 1

2. Read Monitor Events (No Changes):
   - Use qsys_monitor with:
     * action: "read"
     * id: "test_monitor_1"
   - Should return: events: [], count: 0
   - Verify no events when control unchanged

3. Trigger and Capture Events:
   - Change the monitored control value using qsys_set
   - Wait 1 second
   - Use qsys_monitor action: "read"
   - Verify events array contains change
   - Check event has: path, Value, String, Position, Bool, time

4. Monitor Multiple Controls:
   - Start new monitor "test_monitor_2" with 5 controls
   - Change 3 of the 5 controls
   - Read monitor events
   - Verify only changed controls appear in events
   - Check events are in chronological order

5. Stop Monitor:
   - Use qsys_monitor with:
     * action: "stop"
     * id: "test_monitor_1"
   - Verify response: stopped: true
   - Try to read stopped monitor
   - Should error with "Monitor not found"

REPORT FORMAT:
- Scenario 1: Start Monitor = [started successfully]
- Scenario 2: Empty Read = [no false events]
- Scenario 3: Capture Events = [changes detected]
- Scenario 4: Multi-Control = [3/5 events captured]
- Scenario 5: Stop Monitor = [cleaned up properly]
- Monitor Performance: [real-time detection]
- Overall Result: [PASS/FAIL]
```

### Test 3.2: Monitor Advanced Features (5 Scenarios)

```
TEST 3.2: Advanced Monitor Capabilities

Test advanced monitoring features and edge cases:

1. Buffer Overflow Test:
   - Start monitor on frequently changing control
   - Trigger > 100 changes without reading
   - Read events
   - Should have exactly 100 events (circular buffer)
   - Verify oldest events dropped, newest kept

2. Multiple Monitor Instances:
   - Start 3 different monitors with different IDs
   - Each monitoring different controls
   - Verify all work independently
   - Read from each separately
   - Stop each separately

3. Overlapping Monitors:
   - Start monitor_A on controls [X, Y]
   - Start monitor_B on controls [Y, Z]
   - Change control Y
   - Both monitors should capture the change
   - Verify independence

4. Monitor Non-Existent Control:
   - Try to monitor invalid control path
   - Should start but with monitoring: 0
   - Or handle gracefully with partial success

5. Rapid Read Clearing:
   - Start monitor and trigger 10 events
   - Read events (should get 10)
   - Immediately read again (should get 0)
   - Verify read clears the buffer
   - Trigger 5 more events
   - Read should get exactly 5 new events

REPORT FORMAT:
- Scenario 1: Buffer = [100 event limit, circular]
- Scenario 2: Multiple = [3 independent monitors]
- Scenario 3: Overlapping = [both capture shared control]
- Scenario 4: Invalid = [graceful handling]
- Scenario 5: Read Clear = [buffer clears on read]
- Monitor Reliability: [stable and predictable]
- Overall Result: [PASS/FAIL]
```

## SECTION 4: CONTROL OPERATIONS (qsys_get & qsys_set)

### Test 4.1: Enhanced Get Operations (5 Scenarios)

```
TEST 4.1: Control Get with Enhanced Metadata

Test the enhanced qsys_get with new metadata fields:

1. Single Control Get with Metadata:
   - Find a gain control using qsys_discover
   - Use qsys_get with single control path
   - Verify ALL fields returned:
     * Original: value, string, position, bool
     * NEW: direction, choices, min, max
   - Document which fields are populated

2. Dropdown Control Get:
   - Find a control that's a dropdown/selector
   - Use qsys_get on it
   - Verify choices array contains options
   - Verify current value matches one of the choices
   - Test setting to different choice

3. Read-Only Control Get:
   - Find control with direction: "Read"
   - Use qsys_get to retrieve it
   - Note the direction field
   - Attempt qsys_set (should fail)
   - Verify error mentions read-only

4. Range-Limited Control:
   - Find control with min/max defined
   - Use qsys_get to see limits
   - Try setting to min-1 (should fail)
   - Try setting to max+1 (should fail)
   - Try setting to (min+max)/2 (should work)

5. Batch Get with Mixed Types:
   - Get 10 controls of different types in one call
   - Verify each has appropriate metadata
   - Check booleans have direction but not min/max
   - Check floats have min/max but not choices
   - Check selectors have choices but not min/max

REPORT FORMAT:
- Scenario 1: Full Metadata = [8 fields present]
- Scenario 2: Dropdown = [choices array works]
- Scenario 3: Read-Only = [direction prevents set]
- Scenario 4: Range = [min/max enforced]
- Scenario 5: Mixed Types = [appropriate metadata per type]
- Metadata Completeness: [all relevant fields]
- Overall Result: [PASS/FAIL]
```

### Test 4.2: Batch Get Operations (5 Scenarios)

```
TEST 3.1: Control Value Retrieval Performance

PREREQUISITE: Ensure connected to Q-SYS Core

Execute these 5 batch retrieval scenarios:

1. Single Control Get:
   - Find a gain control using qsys_discover
   - Use qsys_get with single control path
   - Verify all value types returned (value, string, position, bool)

2. Small Batch (10 controls):
   - Use qsys_get with 10 control paths
   - Measure total response time
   - Verify parallel execution (should be same speed as single)

3. Medium Batch (50 controls):
   - Use qsys_get with 50 control paths
   - Measure response time
   - Calculate per-control overhead

4. Maximum Batch (100 controls):
   - Use qsys_get with 100 control paths (max allowed)
   - Verify successful completion
   - Check memory usage stays < 50MB

5. Error Handling in Batch:
   - Mix 5 valid paths with 5 invalid paths
   - Use qsys_get on all 10
   - Verify valid controls return values, invalid show helpful errors

REPORT FORMAT:
- Scenario 1: Single Get = [time, all fields present]
- Scenario 2: Batch 10 = [time, parallel verified]
- Scenario 3: Batch 50 = [time, overhead per control]
- Scenario 4: Batch 100 = [time, memory OK]
- Scenario 5: Mixed Valid/Invalid = [errors helpful]
- Batch Performance: [< 10ms overhead achieved?]
- Overall Result: [PASS/FAIL]
```

### Test 4.3: Batch Set Operations with Validation (5 Scenarios)

```
TEST 3.2: Control Value Setting with Type Safety

Execute these 5 batch set scenarios:

1. Simple Set with Type Validation:
   - Find Float, Integer, and Boolean controls
   - Use qsys_set with appropriate values for each type
   - Verify type validation works (e.g., boolean requires true/false)

2. Batch Set Performance (10 controls):
   - Set 10 controls in single qsys_set call
   - Measure response time
   - Verify all updates confirmed

3. Range Validation:
   - Try setting value below ValueMin
   - Try setting value above ValueMax
   - Verify proper error messages with actual limits

4. Protected Control Testing:
   - Try setting a Master.* or Emergency.* control without force
   - Verify protection error
   - Retry with force: true
   - Confirm override works

5. Maximum Batch (50 controls):
   - Use qsys_set with 50 control updates
   - Mix different value types
   - Verify parallel execution performance

REPORT FORMAT:
- Scenario 1: Type Validation = [Float, Integer, Boolean correct]
- Scenario 2: Batch 10 = [time, all confirmed]
- Scenario 3: Range Check = [min/max enforced properly]
- Scenario 4: Protection = [blocked, then forced successfully]
- Scenario 5: Batch 50 = [time, parallel execution]
- Set Performance: [< 10ms overhead per control?]
- Overall Result: [PASS/FAIL]
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

Execute these 5 performance stress tests including monitors:

1. Monitor Performance Impact:
   - Start 5 monitors each watching 10 controls
   - Run 50 qsys_get calls
   - Compare response time with/without monitors
   - Verify minimal impact (< 10% slower)

2. Sustained Monitoring:
   - Start monitor on 20 controls
   - Continuously change 10 controls for 30 seconds
   - Read monitor every 2 seconds
   - Verify no event loss
   - Check memory stays < 50MB

3. Mixed Operation Load with Monitors:
   - 2 active monitors running
   - Alternate between get, set, discover, status (25 each)
   - Periodically read monitor events
   - Total 100 operations + monitor reads
   - Measure total time and memory usage

4. Monitor Stress Test:
   - Start 10 monitors
   - Each monitoring 10 controls (100 total)
   - Change 50 controls rapidly
   - Read all monitors
   - Verify correct event distribution
   - Stop all monitors
   - Check cleanup (memory returns to baseline)

5. Filter + Monitor Performance:
   - Connect with filter: "Gain" (reduced components)
   - Start monitors on filtered components only
   - Compare performance vs. non-filtered
   - Should be significantly faster/lighter

REPORT FORMAT:
- Scenario 1: Monitor Overhead = [< 10% impact]
- Scenario 2: Sustained = [no event loss, memory OK]
- Scenario 3: Mixed + Monitors = [total time, stable]
- Scenario 4: 10 Monitors = [handled correctly]
- Scenario 5: Filtered = [better performance]
- Performance Grade: [A/B/C/D/F based on targets]
- Overall Result: [PASS/FAIL]
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
TEST 4.2: Parallel Batch Performance

MCP3.0 emphasizes parallel execution for batch operations:

1. Parallel vs Sequential Comparison:
   - Get 20 controls individually (sequential)
   - Get same 20 controls in one batch call
   - Compare times (batch should be ~20x faster)

2. Parallel Set Operations:
   - Set 30 controls in one batch
   - Verify all complete simultaneously
   - Check no sequential delays

3. Maximum Parallel Gets:
   - Get 100 controls (maximum) in one call
   - Measure total time
   - Should be same as getting 1 control

4. Maximum Parallel Sets:
   - Set 50 controls (maximum) in one call
   - Measure total time
   - Verify parallel execution

5. Mixed Parallel Operations:
   - While batch get is running, call qsys_status
   - Verify both complete without blocking

REPORT FORMAT:
- Scenario 1: Sequential vs Batch = [20x speedup achieved?]
- Scenario 2: Parallel Sets = [simultaneous completion]
- Scenario 3: 100 Gets = [time same as 1 get?]
- Scenario 4: 50 Sets = [parallel verified]
- Scenario 5: Non-blocking = [operations don't block]
- Parallel Efficiency: [target met?]
- Overall Result: [PASS/FAIL]
```

---

## SECTION 6: EDGE CASES AND LIMITS

### Test 6.1: Boundary Testing with New Features (5 Scenarios)

```
TEST 6.1: System Limits with Enhanced Features

Execute these 5 boundary tests including new features:

1. Monitor Limits:
   - Try starting monitor with 0 controls (empty array)
   - Try monitoring 200 controls (very large)
   - Try using duplicate monitor ID
   - Verify appropriate errors/handling

2. Filter Pattern Limits:
   - Connect with invalid regex in filter
   - Connect with filter matching 0 components
   - Connect with filter matching all components
   - Connect with very complex regex pattern
   - Verify graceful handling

3. Metadata Edge Cases:
   - Find control with undefined min/max
   - Find control with empty choices array
   - Find control with null direction
   - Verify qsys_get handles missing metadata

4. Monitor ID Validation:
   - Try monitor ID with special characters
   - Try very long monitor ID (100+ chars)
   - Try numeric-only ID
   - Try empty string ID
   - Verify acceptance or clear errors

5. Combined Feature Limits:
   - Connect with strict filter (5 components)
   - Start monitor on filtered components
   - Try to monitor non-filtered component
   - Should fail appropriately
   - Verify filter boundary respected

REPORT FORMAT:
- Scenario 1: Monitor Limits = [appropriate errors]
- Scenario 2: Filter Patterns = [handled gracefully]
- Scenario 3: Missing Metadata = [no crashes]
- Scenario 4: Monitor IDs = [validation works]
- Scenario 5: Filter+Monitor = [boundaries enforced]
- Boundary Handling: [robust]
- Overall Result: [PASS/FAIL]
```

### Test 6.2: Boundary Testing (5 Scenarios)

```
TEST 5.1: System Limits and Boundaries

Execute these 5 boundary test scenarios:

1. Minimum Polling Interval:
   - Connect with pollingInterval: 33 (below minimum)
   - Should clamp to 34ms minimum
   - Connect with pollingInterval: 34 (exact minimum)
   - Verify accepts exact minimum

2. Empty Batch Operations:
   - Try qsys_get with empty controls array
   - Try qsys_set with empty controls array
   - Should error with clear message

3. Exceeding Batch Limits:
   - Try qsys_get with 101 controls (over limit)
   - Try qsys_set with 51 controls (over limit)
   - Should error with limit information

4. Long Control Names:
   - Test with very long component/control names
   - Verify proper handling
   - Check error messages truncate appropriately

5. Special Characters:
   - Test control paths with spaces, underscores, numbers
   - Verify proper parsing
   - Check Unicode handling if applicable

REPORT FORMAT:
- Scenario 1: Polling Limits = [33→34 clamped, 34 accepted]
- Scenario 2: Empty Batches = [proper error messages]
- Scenario 3: Over Limits = [clear limit errors]
- Scenario 4: Long Names = [handled gracefully]
- Scenario 5: Special Chars = [parsed correctly]
- Boundary Handling: [robust]
- Overall Result: [PASS/FAIL]
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

Execute these 5 complete workflow scenarios using new features:

1. Filtered Discovery to Monitoring:
   - Connect with filter: "Gain"
   - qsys_discover to verify only Gains loaded
   - Start monitor on all Gain.gain controls
   - Adjust gains using qsys_set
   - Read monitor to verify changes captured
   - Stop monitor

2. Metadata-Driven UI Workflow:
   - qsys_discover with includeControls: true
   - Find control with choices array
   - Display choices to user (simulate UI)
   - Set to valid choice from array
   - Find control with min/max
   - Validate input against range before set

3. Read-Only Control Handling:
   - qsys_get batch of 10 controls
   - Identify read-only via direction field
   - Skip read-only in batch set operation
   - Only attempt to set Read/Write controls
   - Verify intelligent handling

4. Real-time Dashboard Workflow:
   - Start 3 monitors for different subsystems
   - Continuously read all 3 monitors
   - Simulate dashboard update every second
   - Make changes via qsys_set
   - Verify dashboard reflects changes immediately
   - Stop all monitors cleanly

5. Memory-Optimized Large System:
   - Connect with aggressive filter (< 10 components)
   - Verify fast connection and low memory
   - Perform all operations on filtered set
   - Monitor filtered components only
   - Compare memory vs. unfiltered connection
   - Document memory savings percentage

REPORT FORMAT:
- Scenario 1: Filter→Monitor = [complete flow works]
- Scenario 2: Metadata UI = [choices/ranges used]
- Scenario 3: Read-Only = [intelligent skipping]
- Scenario 4: Dashboard = [real-time updates]
- Scenario 5: Optimized = [X% memory saved]
- Integration Quality: [smooth workflows]
- Overall Result: [PASS/FAIL]
```

### Test 7.2: Complete Workflow Testing (5 Scenarios)

```
TEST 6.1: End-to-End Integration Workflows

Execute these 5 complete workflow scenarios:

1. Discovery to Control:
   - qsys_discover to find components
   - Pick a component with controls
   - qsys_get to read current values
   - qsys_set to modify values
   - qsys_get to confirm changes

2. Connection Loss Recovery:
   - Establish connection
   - Perform operations
   - Simulate connection loss
   - Verify auto-reconnection
   - Resume operations

3. Filtered Discovery to Batch Update:
   - qsys_discover with component: "gain"
   - Extract all gain control paths
   - qsys_get all gain values
   - qsys_set all gains to -20dB
   - Verify batch update success

4. Status Monitoring During Operations:
   - Start batch operations
   - Call qsys_status during operations
   - Verify status accurate
   - Check control/component counts

5. Error Recovery Flow:
   - Trigger connection error
   - Verify state shows reconnecting
   - Wait for reconnection
   - Verify operations resume
   - Check no data loss

REPORT FORMAT:
- Scenario 1: Discovery→Control = [complete flow works]
- Scenario 2: Connection Recovery = [automatic, < 5s]
- Scenario 3: Filtered→Batch = [efficient workflow]
- Scenario 4: Concurrent Status = [accurate during ops]
- Scenario 5: Error Recovery = [seamless resumption]
- Integration Quality: [smooth workflows]
- Overall Result: [PASS/FAIL]
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