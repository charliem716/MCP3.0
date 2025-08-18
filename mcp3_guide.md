# MCP3.0 Implementation Guide

## Overview

MCP3.0 is an ultra-minimal, high-performance MCP server for Q-SYS control. It prioritizes speed, simplicity, and reliability over features. The entire implementation should be ~400 lines of code with only 3 dependencies.

**Core Philosophy**: Direct SDK pass-through with minimal abstraction. The QRWC SDK already handles the complexity - we just expose it efficiently to MCP.

## Architecture

```
┌─────────────────┐
│   MCP Client    │
└────────┬────────┘
         │ stdio
┌────────▼────────┐
│   MCP3 Server   │  ← ~400 lines total
│   (5 tools)     │
└────────┬────────┘
         │ Direct pass-through
┌────────▼────────┐
│   @q-sys/qrwc   │  ← Heavy lifting done here
└────────┬────────┘
         │ WebSocket
┌────────▼────────┐
│   Q-SYS Core    │
└─────────────────┘
```

## Dependencies

```json
{
  "dependencies": {
    "@q-sys/qrwc": "^0.4.1-beta",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "ws": "^8.0.0"
  }
}
```

That's it. No other dependencies.

## Tool Specifications

### 1. `qsys_connect` - Establish Connection

**Purpose**: Connect to Q-SYS Core with auto-reconnection capability.

```typescript
{
  name: "qsys_connect",
  description: "Connect to Q-SYS Core processor",
  inputSchema: {
    type: "object",
    properties: {
      host: {
        type: "string",
        description: "IP address or hostname of Q-SYS Core"
      },
      secure: {
        type: "boolean",
        description: "Use secure WebSocket (wss://)",
        default: true
      },
      pollingInterval: {
        type: "number",
        description: "Control polling interval in ms (min: 34, default: 350)",
        minimum: 34,
        default: 350
      }
    },
    required: ["host"]
  }
}
```

**Implementation Notes**:
- Store connection details for auto-reconnect
- Setup disconnection handler for automatic reconnection
- Use exponential backoff: 1s, 2s, 4s, 8s, 16s, then stop
- Save successful connection to `~/.qsys-mcp/last-connection.json`

### 2. `qsys_discover` - List Components & Controls

**Purpose**: Discover available components and their controls.

```typescript
{
  name: "qsys_discover",
  description: "Discover available components and their controls",
  inputSchema: {
    type: "object",
    properties: {
      component: {
        type: "string",
        description: "Component name or regex pattern (omit for all)"
      },
      includeControls: {
        type: "boolean",
        description: "Include control details for each component",
        default: true
      }
    }
  }
}
```

**Response Format**:
```json
[
  {
    "name": "Gain_1",
    "type": "gain",
    "controlCount": 2,
    "controls": [
      {
        "name": "gain",
        "type": "Float",
        "value": -10,
        "string": "-10.0dB",
        "position": 0.75
      },
      {
        "name": "mute",
        "type": "Boolean",
        "value": 0,
        "string": "false",
        "bool": false
      }
    ]
  }
]
```

**Implementation Notes**:
- Direct iteration over `qrwc.components` dictionary
- Use regex for flexible component filtering
- Cache results for 1 second to avoid repeated discovery

### 3. `qsys_get` - Read Control Values

**Purpose**: Get current values from one or more controls.

```typescript
{
  name: "qsys_get",
  description: "Get current values from controls",
  inputSchema: {
    type: "object",
    properties: {
      controls: {
        type: "array",
        description: "Control paths in 'Component.control' format",
        items: { type: "string" },
        minItems: 1,
        maxItems: 100
      }
    },
    required: ["controls"]
  }
}
```

**Response Format**:
```json
[
  {
    "control": "Gain_1.gain",
    "value": -10,
    "string": "-10.0dB",
    "position": 0.75
  },
  {
    "control": "Gain_1.mute",
    "value": 0,
    "string": "false",
    "bool": false
  }
]
```

**Implementation Notes**:
- Direct access: `qrwc.components[comp].controls[ctrl].state`
- Include helpful error if control not found (suggest available controls)
- Always return Value, String, Position, and Bool (QRWC computed)

### 4. `qsys_set` - Update Control Values

**Purpose**: Set control values with validation and protection.

```typescript
{
  name: "qsys_set",
  description: "Set control values",
  inputSchema: {
    type: "object",
    properties: {
      controls: {
        type: "array",
        description: "Controls to update",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Control path in 'Component.control' format"
            },
            value: {
              oneOf: [
                { type: "number" },
                { type: "string" },
                { type: "boolean" }
              ]
            },
            force: {
              type: "boolean",
              description: "Override protection for critical controls",
              default: false
            }
          },
          required: ["path", "value"]
        },
        minItems: 1,
        maxItems: 50
      }
    },
    required: ["controls"]
  }
}
```

**Response Format**:
```json
[
  {
    "control": "Gain_1.gain",
    "value": -5,
    "string": "-5.0dB",
    "confirmed": true
  }
]
```

**Implementation Notes**:
- Use `control.update(value)` which returns new state
- Implement parallel updates with `Promise.allSettled()`
- Check protected patterns unless `force: true`
- Validate type compatibility (Boolean → boolean, Float → number)
- Range validation if ValueMin/ValueMax present

**Protected Control Patterns**:
```typescript
const PROTECTED_CONTROLS = [
  /^Master\.volume$/,
  /^Emergency\./,
  /\.power$/,
  /^SystemMute/
];
```

### 5. `qsys_status` - Connection & System Status

**Purpose**: Get connection status and system information.

```typescript
{
  name: "qsys_status",
  description: "Get connection status and system information",
  inputSchema: {
    type: "object",
    properties: {
      detailed: {
        type: "boolean",
        description: "Include component inventory",
        default: false
      }
    }
  }
}
```

**Response Format**:
```json
{
  "connected": true,
  "connectionState": "connected",
  "host": "192.168.1.100",
  "componentCount": 42,
  "controlCount": 250,
  "pollingInterval": 350,
  "uptime": 3600000
}
```

## Core Implementation

### Main Server Class

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';

class QSysMCP3Server {
  private server: Server;
  private transport: StdioServerTransport;
  private qrwc?: Qrwc;
  private config: MCP3Config;
  private connectionState: ConnectionState = 'disconnected';
  private lastHost?: string;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempt = 0;
  private connectedAt?: Date;
  private discoveryCache?: { timestamp: number; data: any };

  constructor() {
    this.config = this.loadConfig();
    this.server = new Server(
      {
        name: 'qsys-mcp',
        version: '3.0.0'
      },
      {
        capabilities: { tools: {} }
      }
    );
    
    this.transport = new StdioServerTransport();
    this.registerTools();
    this.setupServer();
    
    if (this.config.host && this.config.autoConnect) {
      setTimeout(() => this.connect(this.config.host!), 100);
    }
  }

  private loadConfig(): MCP3Config {
    const config: MCP3Config = {
      port: 443,
      autoConnect: true,
      pollingInterval: 350
    };
    
    // Try to load saved connection
    try {
      const saved = JSON.parse(
        fs.readFileSync('~/.qsys-mcp/last-connection.json', 'utf8')
      );
      Object.assign(config, saved);
    } catch {}
    
    // Environment variables override
    if (process.env.QSYS_HOST) config.host = process.env.QSYS_HOST;
    if (process.env.QSYS_PORT) config.port = parseInt(process.env.QSYS_PORT);
    
    return config;
  }
}
```

### Connection Management

```typescript
private async connect(host: string, port = 443): Promise<void> {
  if (this.qrwc) {
    this.qrwc.close();
  }
  
  this.connectionState = 'connecting';
  this.lastHost = host;
  
  const protocol = port === 443 ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${host}/qrc-public-api/v0`, {
    rejectUnauthorized: false
  });
  
  // Add connection timeout
  const timeout = setTimeout(() => {
    socket.close();
    throw new Error('Connection timeout after 5 seconds');
  }, 5000);
  
  try {
    this.qrwc = await Qrwc.createQrwc({
      socket,
      pollingInterval: this.config.pollingInterval,
      timeout: 5000
    });
    
    clearTimeout(timeout);
    this.connectionState = 'connected';
    this.connectedAt = new Date();
    this.reconnectAttempt = 0;
    
    // Setup auto-reconnection
    this.qrwc.on('disconnected', (reason) => {
      this.handleDisconnection(reason);
    });
    
    // Save successful connection
    this.saveLastConnection(host, port);
    
  } catch (error) {
    clearTimeout(timeout);
    this.connectionState = 'disconnected';
    throw error;
  }
}

private handleDisconnection(reason: string): void {
  this.connectionState = 'disconnected';
  this.qrwc = undefined;
  
  if (this.reconnectAttempt < 5 && this.lastHost) {
    this.reconnectAttempt++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    
    this.connectionState = 'reconnecting';
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.lastHost!);
      } catch {
        this.handleDisconnection('Reconnection failed');
      }
    }, delay);
  }
}
```

### Control Operations

```typescript
private async executeSet(params: any): Promise<MCPResponse> {
  if (!this.qrwc) {
    return this.errorResponse('Not connected to Q-SYS Core');
  }
  
  // Parallel execution for speed
  const updates = params.controls.map(async (item) => {
    try {
      const [compName, ctrlName] = this.parseControlPath(item.path);
      const control = this.qrwc!.components[compName]?.controls[ctrlName];
      
      if (!control) {
        return {
          control: item.path,
          error: this.getControlNotFoundError(item.path, compName)
        };
      }
      
      // Protection check
      if (!item.force && this.isProtectedControl(item.path)) {
        return {
          control: item.path,
          error: `Protected control. Use force:true to override`
        };
      }
      
      // Type validation
      this.validateControlValue(control, item.value);
      
      // Update and return confirmed state
      const newState = await control.update(item.value);
      
      return {
        control: item.path,
        value: newState.Value,
        string: newState.String,
        position: newState.Position,
        confirmed: true
      };
      
    } catch (error) {
      return {
        control: item.path,
        error: error.message,
        confirmed: false
      };
    }
  });
  
  const results = await Promise.allSettled(updates);
  const values = results.map(r => r.status === 'fulfilled' ? r.value : r.reason);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify(values, null, 2)
    }]
  };
}

private validateControlValue(control: any, value: any): void {
  const state = control.state;
  const type = state.Type;
  
  // Type checking
  if (type === 'Boolean' && typeof value !== 'boolean') {
    throw new Error(`Boolean control requires true/false, got "${value}"`);
  }
  
  if (type === 'Float' || type === 'Integer') {
    if (typeof value !== 'number') {
      throw new Error(`Numeric control requires number, got ${typeof value}`);
    }
    
    // Range validation
    if (state.ValueMin !== undefined && value < state.ValueMin) {
      throw new Error(`Value ${value} below minimum ${state.ValueMin}`);
    }
    if (state.ValueMax !== undefined && value > state.ValueMax) {
      throw new Error(`Value ${value} above maximum ${state.ValueMax}`);
    }
  }
}

private parseControlPath(path: string): [string, string] {
  if (path.includes('.')) {
    return path.split('.', 2) as [string, string];
  }
  
  throw new Error(`Invalid control path format: "${path}". Use "Component.control"`);
}

private isProtectedControl(path: string): boolean {
  const PROTECTED_PATTERNS = [
    /^Master\./i,
    /^Emergency\./i,
    /\.power$/i,
    /^SystemMute/i
  ];
  
  return PROTECTED_PATTERNS.some(pattern => pattern.test(path));
}

private getControlNotFoundError(path: string, componentName: string): string {
  const component = this.qrwc?.components[componentName];
  
  if (!component) {
    const available = Object.keys(this.qrwc?.components || {}).slice(0, 5);
    return `Component "${componentName}" not found. Available: ${available.join(', ')}`;
  }
  
  const controls = Object.keys(component.controls).slice(0, 5);
  return `Control not found in "${componentName}". Available: ${controls.join(', ')}`;
}
```

### Tool Registration

```typescript
private registerTools(): void {
  // qsys_connect
  this.server.setRequestHandler(
    CallToolRequestSchema,
    async (request) => {
      if (request.params.name === 'qsys_connect') {
        return await this.handleConnect(request.params.arguments);
      }
      // ... other tools
    }
  );
  
  // List available tools
  this.server.setRequestHandler(
    ListToolsRequestSchema,
    async () => ({
      tools: [
        {
          name: 'qsys_connect',
          description: 'Connect to Q-SYS Core processor',
          inputSchema: { /* ... */ }
        },
        // ... other tools
      ]
    })
  );
}
```

## Configuration

### Environment Variables

```bash
QSYS_HOST=192.168.1.100    # Q-SYS Core IP address
QSYS_PORT=443               # WebSocket port (default: 443)
QSYS_AUTO_CONNECT=true      # Auto-connect on startup
QSYS_MCP_DEBUG=true         # Enable debug logging
```

### Config File

Location: `~/.qsys-mcp/config.json`

```json
{
  "host": "192.168.1.100",
  "port": 443,
  "autoConnect": true,
  "pollingInterval": 350
}
```

### Usage Examples

```bash
# Method 1: Environment variable
QSYS_HOST=192.168.1.100 npx qsys-mcp

# Method 2: Config file
echo '{"host":"192.168.1.100"}' > ~/.qsys-mcp/config.json
npx qsys-mcp

# Method 3: Manual connection
npx qsys-mcp
# Then use qsys_connect tool
```

## Error Handling

### Error Response Format

```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify({
      error: "Descriptive error message",
      suggestion: "How to fix it",
      details: { /* context */ }
    }, null, 2)
  }],
  isError: true
}
```

### Common Errors

1. **Not Connected**
   - Message: "Not connected to Q-SYS Core. Use qsys_connect first."
   - Auto-reconnect will attempt to restore connection

2. **Control Not Found**
   - Message: "Control 'gain' not found in 'Mixer'. Available: mute, level, pan"
   - Provides list of valid controls

3. **Type Mismatch**
   - Message: "Boolean control requires true/false, got 'hello'"
   - Clear type requirements

4. **Protected Control**
   - Message: "Protected control 'Master.volume'. Use force:true to override"
   - Safety mechanism for critical controls

5. **Range Violation**
   - Message: "Value 150 above maximum 100"
   - Prevents invalid values

## Performance Targets

- **Tool Response Time**: < 10ms overhead (not including network)
- **Connection Time**: < 1 second
- **Memory Usage**: < 50MB
- **Startup Time**: < 500ms
- **Batch Operations**: Parallel execution, not sequential

## Testing Checklist

- [ ] Connect to Q-SYS Core
- [ ] Auto-reconnection works (disconnect network, reconnect)
- [ ] Discover all components
- [ ] Get control values (single and batch)
- [ ] Set control values (single and batch)
- [ ] Type validation prevents invalid values
- [ ] Range validation works
- [ ] Protected controls require force flag
- [ ] Error messages are helpful
- [ ] Memory usage stays under 50MB
- [ ] No memory leaks after disconnect/reconnect cycles

## Implementation Notes

1. **Keep It Simple**: Every line of code should have a clear purpose
2. **Direct SDK Usage**: Don't abstract what doesn't need abstracting
3. **Fast Failures**: Fail immediately with clear errors
4. **Parallel by Default**: Use Promise.allSettled for batch operations
5. **Helpful Errors**: Always suggest what the user might want
6. **Safety First**: Protected controls and validation are non-negotiable
7. **Zero State**: No databases, no complex caching, no persistence beyond config

## File Structure

```
qsys-mcp3/
├── package.json          # 3 dependencies only
├── index.js              # Main server (~400 lines)
├── README.md             # Usage documentation
└── .gitignore
```

That's it. One file, three dependencies, five tools, rock-solid functionality.

## Migration from MCP2.0

For users migrating from MCP2.0:

1. **Tool name changes**:
   - `list_components` → `qsys_discover`
   - `get_control_values` → `qsys_get`
   - `set_control_values` → `qsys_set`
   - `query_core_status` → `qsys_status`

2. **Removed features**:
   - No event monitoring (use `qsys_get` polling if needed)
   - No change groups (SDK handles internally)
   - No complex connection management tools

3. **Improved features**:
   - Auto-reconnection built-in
   - Parallel batch operations
   - Better error messages
   - 100x faster response times

## Success Criteria

MCP3.0 is successful if:

1. It connects reliably to Q-SYS Core
2. It stays connected (auto-reconnect works)
3. It responds in < 50ms for any operation
4. It uses < 50MB of memory
5. The entire implementation is < 500 lines
6. Any developer can understand it in 10 minutes
7. It never corrupts or loses control state
8. Error messages make sense to users
9. It prevents dangerous operations by default
10. It requires zero configuration for basic use