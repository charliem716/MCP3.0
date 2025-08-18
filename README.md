# Q-SYS MCP3.0 Server

Ultra-minimal MCP server for Q-SYS control. ~400 lines, 3 dependencies, 5 tools.

<a href="https://glama.ai/mcp/servers/@charliem716/MCP3.0">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@charliem716/MCP3.0/badge" alt="Q-SYS Server MCP server" />
</a>

## Quick Start

```bash
# Install
npm install

# Run with environment variable
QSYS_HOST=192.168.1.100 npm start

# Run with debug logging
npm run dev
```

## Configuration

### Environment Variables
```bash
QSYS_HOST=192.168.1.100    # Q-SYS Core IP address
QSYS_PORT=443               # WebSocket port (default: 443)
QSYS_AUTO_CONNECT=true      # Auto-connect on startup
QSYS_MCP_DEBUG=true         # Enable debug logging
QSYS_POLLING_INTERVAL=350   # Control polling interval in ms
```

### Config File
The server saves successful connections to `~/.qsys-mcp/last-connection.json` and auto-connects on next startup.

## Tools

### qsys_connect
Connect to Q-SYS Core with auto-reconnection.
```json
{
  "host": "192.168.1.100",
  "port": 443,
  "secure": true,
  "pollingInterval": 350
}
```

### qsys_discover
List components and their controls.
```json
{
  "component": "Gain.*",     // Optional regex filter
  "includeControls": true    // Include control details
}
```

### qsys_get
Read control values.
```json
{
  "controls": ["Gain_1.gain", "Gain_1.mute"]
}
```

### qsys_set
Update control values with protection.
```json
{
  "controls": [
    {
      "path": "Gain_1.gain",
      "value": -10,
      "force": false    // Required for protected controls
    }
  ]
}
```

### qsys_status
Get connection and system status.
```json
{
  "detailed": false    // Include component inventory
}
```

## Protected Controls

These patterns require `force: true` to modify:
- `Master.*` - System-wide master controls
- `Emergency.*` - Emergency systems
- `*.power` - Power controls
- `SystemMute` - Venue-wide mute

## Features

- **Auto-reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Global cache**: 1-second discovery cache, clears on reconnect
- **Parallel operations**: Batch updates execute simultaneously
- **Type validation**: Enforces correct types for Boolean, Float, Integer
- **Range validation**: Respects ValueMin/ValueMax limits
- **Helpful errors**: Suggests available components/controls when not found

## Performance

- Tool response: <10ms overhead
- Memory usage: <50MB
- Startup time: <500ms
- Connection time: <1 second
- Batch operations: Parallel execution

## MCP Client Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "qsys": {
      "command": "node",
      "args": ["/path/to/qsys-mcp3/index.js"],
      "env": {
        "QSYS_HOST": "192.168.1.100"
      }
    }
  }
}
```

## Testing

Manual testing checklist:
1. Connect to Q-SYS Core
2. Verify auto-reconnection (disconnect/reconnect network)
3. Discover components
4. Get/set control values
5. Test protected controls
6. Verify batch operations
7. Monitor memory usage

## Agent Prompts

See `agent-mcp3-prompts.md` for example system prompts for:
- AV Room Controller Assistant
- Audio System Troubleshooting Agent
- Event Production Coordinator

## License

MIT