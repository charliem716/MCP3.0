#!/usr/bin/env node
// Test 1.1: Connection Management
// Tests the full connection management functionality of qsys_connect

import { spawn } from 'child_process';
const mcp = spawn('node', ['index.js']);

// Suppress debug output unless TEST_DEBUG is set
if (!process.env.TEST_DEBUG) {
  mcp.stderr.on('data', () => {});
}

const tests = [];
const results = [];
let failures = 0;

// Helper to send command and track it
function sendCommand(name, args, id, description) {
  const cmd = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name, arguments: args },
    id
  };
  mcp.stdin.write(JSON.stringify(cmd) + '\n');
  results[id] = { description, sent: Date.now() };
}

// Test 1: Initial Connect
tests.push(async () => {
  console.log('\n1. Initial Connect to 192.168.50.150...');
  sendCommand('qsys_connect', { host: '192.168.50.150' }, 1, 'Initial Connect');
});

// Test 2: Return Existing Connection (same params)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1500));
  console.log('\n2. Connect again with same host (should return existing)...');
  sendCommand('qsys_connect', { host: '192.168.50.150' }, 2, 'Return Existing');
});

// Test 3: No host parameter (should use saved)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1000));
  console.log('\n3. Connect without host (should use saved config)...');
  sendCommand('qsys_connect', {}, 3, 'Use Saved Config');
});

// Test 4: Change Filter (should reconnect)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1000));
  console.log('\n4. Connect with filter "Gain" (should reconnect)...');
  sendCommand('qsys_connect', { host: '192.168.50.150', filter: 'Gain' }, 4, 'Filter Change');
});

// Test 5: Check status after filter
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1500));
  console.log('\n5. Check status after filter...');
  sendCommand('qsys_status', {}, 5, 'Status Check');
});

// Test 6: Remove filter (should reconnect)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1000));
  console.log('\n6. Connect without filter (should reconnect to load all)...');
  sendCommand('qsys_connect', { host: '192.168.50.150' }, 6, 'Remove Filter');
});

// Test 7: Change Host (should disconnect old, connect new)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1500));
  console.log('\n7. Connect to different host 192.168.50.151...');
  sendCommand('qsys_connect', { host: '192.168.50.151' }, 7, 'Change Host');
});

// Test 8: Invalid Host (should error and disconnect)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 1500));
  console.log('\n8. Connect to invalid host 999.999.999.999...');
  sendCommand('qsys_connect', { host: '999.999.999.999' }, 8, 'Invalid Host');
});

// Test 9: Status after invalid (should be disconnected)
tests.push(async () => {
  await new Promise(r => setTimeout(r, 2000));
  console.log('\n9. Check status after invalid host...');
  sendCommand('qsys_status', {}, 9, 'Status After Invalid');
});

// Process responses
mcp.stdout.on('data', (data) => {
  try {
    const lines = data.toString().split('\n').filter(l => l);
    lines.forEach(line => {
      const response = JSON.parse(line);
      if (!response.id || !results[response.id]) return;
      
      const test = results[response.id];
      const responseTime = Date.now() - test.sent;
      
      if (response.result?.content) {
        const content = JSON.parse(response.result.content[0].text);
        
        switch(response.id) {
          case 1: // Initial Connect
            if (content.connected && content.host === '192.168.50.150') {
              if (content.connectionTime) {
                console.log(`   ✓ Connected in ${content.connectionTime}ms, ${content.componentsLoaded} components loaded`);
              } else {
                console.log(`   ✓ Already connected (auto-connect), ${content.componentsLoaded} components loaded`);
              }
            } else {
              console.log(`   ✗ Failed to connect properly`);
              failures++;
            }
            break;
            
          case 2: // Return Existing
            if (content.connected && responseTime < 50) { // Should be instant
              console.log(`   ✓ Returned existing connection in ${responseTime}ms (no reconnect)`);
            } else {
              console.log(`   ✗ Took ${responseTime}ms (should be instant)`);
              failures++;
            }
            break;
            
          case 3: // Use Saved Config
            if (content.connected && content.host === '192.168.50.150') {
              console.log(`   ✓ Used saved host: ${content.host}`);
            } else {
              console.log(`   ✗ Failed to use saved config`);
              failures++;
            }
            break;
            
          case 4: // Filter Change
            if (content.connected && content.filterApplied && content.componentsLoaded > 0) {
              console.log(`   ✓ Reconnected with filter, ${content.componentsLoaded} components match`);
            } else if (content.error) {
              console.log(`   ⚠ No components match filter: ${content.error}`);
            } else {
              console.log(`   ✗ Filter not applied properly`);
              failures++;
            }
            break;
            
          case 5: // Status Check
            console.log(`   ℹ Connected: ${content.connected}, Components: ${content.componentCount}`);
            break;
            
          case 6: // Remove Filter
            if (content.connected && !content.filterApplied && content.componentsLoaded > 0) {
              console.log(`   ✓ Reconnected without filter, ${content.componentsLoaded} components loaded`);
            } else {
              console.log(`   ✗ Failed to remove filter`);
              failures++;
            }
            break;
            
          case 7: // Change Host
            // This will likely fail since .151 doesn't exist, but should attempt connection
            if (content.error) {
              console.log(`   ℹ Connection attempt to .151 failed as expected: ${content.error}`);
            } else if (content.connected && content.host === '192.168.50.151') {
              console.log(`   ✓ Connected to new host ${content.host}`);
            } else {
              console.log(`   ⚠ Unexpected result for host change`);
            }
            break;
            
          case 8: // Invalid Host
            if (content.error && content.suggestion) {
              console.log(`   ✓ Error returned: "${content.error}"`);
              console.log(`   ✓ Suggestion: "${content.suggestion}"`);
            } else {
              console.log(`   ✗ No error for invalid host`);
              failures++;
            }
            break;
            
          case 9: // Status After Invalid
            if (!content.connected && content.connectionState === 'disconnected') {
              console.log(`   ✓ Correctly disconnected after invalid host`);
            } else {
              console.log(`   ✗ Still showing connected: ${content.connectionState}`);
              failures++;
            }
            break;
        }
      } else if (response.result?.isError) {
        const content = JSON.parse(response.result.content[0].text);
        // Handle expected errors
        if (response.id === 7 || response.id === 8) {
          if (content.error && content.suggestion) {
            console.log(`   ✓ Error returned: "${content.error}"`);
            if (content.suggestion) {
              console.log(`   ✓ Suggestion: "${content.suggestion}"`);
            }
          }
        } else {
          console.log(`   ✗ Unexpected error: ${content.error}`);
          failures++;
        }
      }
    });
  } catch (e) {
    // Ignore partial data
  }
});

// Run tests sequentially
let testIndex = 0;
async function runNextTest() {
  if (testIndex < tests.length) {
    await tests[testIndex]();
    testIndex++;
    setTimeout(runNextTest, 100);
  } else {
    setTimeout(() => {
      console.log('\n' + '='.repeat(50));
      console.log(`Test 1.1 Complete: ${failures === 0 ? '✅ PASS' : `❌ FAIL (${failures} failures)`}`);
      console.log('='.repeat(50));
      mcp.kill();
      process.exit(failures > 0 ? 1 : 0);
    }, 2000);
  }
}

// Start tests
console.log('='.repeat(50));
console.log('Test 1.1: Connection Management');
console.log('='.repeat(50));
setTimeout(runNextTest, 500);