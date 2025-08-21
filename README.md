# Q-SYS MCP3.0 Server

Ultra-minimal MCP server for Q-SYS control. 582 lines, 3 dependencies, 4 tools.

## Quick Start

```bash
# Install (only 3 dependencies)
npm install

# Run with Q-SYS Core IP
QSYS_HOST=192.168.1.100 node index.js

# With debug logging
QSYS_HOST=192.168.1.100 QSYS_MCP_DEBUG=true node index.js
```

## Configuration

### Environment Variables (Required)
```bash
QSYS_HOST=192.168.1.100    # Q-SYS Core IP address (required)
QSYS_PORT=443               # WebSocket port (default: 443)
QSYS_SECURE=true            # Use secure WebSocket (default: true)
QSYS_POLLING_INTERVAL=350   # Control polling interval in ms (default: 350)
QSYS_MCP_DEBUG=true         # Enable debug logging (default: false)
```

### Persistent Configuration
The server saves successful connections to `~/.qsys-mcp/last-connection.json` for convenience.

## Tools

All tools auto-connect using the `QSYS_HOST` environment variable if not already connected.

### qsys_status
Get connection and system status without triggering auto-connection.
```json
{
  "detailed": false    // Include component inventory
}
```

### qsys_discover
List components and controls. Auto-connects if needed.
```json
{
  "component": "Gain.*",     // Optional regex filter
  "includeControls": true    // Include control details
}
```

### qsys_get
Read control values with metadata. Auto-connects if needed.
```json
{
  "controls": ["Gain_1.gain", "Gain_1.mute"]
}
// Returns: value, string, position, bool, direction, choices, min, max
```

### qsys_set
Update control values with validation. Auto-connects if needed.
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

## Protected Controls

These patterns require `force: true` to modify:
- `Master.*` - Master controls
- `Emergency.*` - Emergency systems
- `*.power` - Power controls
- `SystemMute` - System-wide mutes

## Core Features

- **Auto-connection**: Connects automatically using QSYS_HOST environment variable
- **Auto-reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 16s)
- **Discovery cache**: 1-second cache for performance
- **Parallel operations**: Batch updates execute simultaneously
- **Type validation**: Enforces Boolean, Float, Integer types
- **Range validation**: Respects min/max limits
- **Helpful errors**: Suggests available components/controls

## Performance

- Connection time: < 1 second
- Memory usage: < 50MB typical
- Startup time: < 500ms
- Batch limits: 100 get, 50 set

## Claude Desktop Configuration

Add to your Claude Desktop config:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "qsys-mcp3": {
      "command": "node",
      "args": ["/absolute/path/to/MCP3.0/index.js"],
      "env": {
        "QSYS_HOST": "192.168.50.150",
        "QSYS_PORT": "443",
        "QSYS_MCP_DEBUG": "false"
      }
    }
  }
}
```

Replace `/absolute/path/to/MCP3.0/index.js` with your actual path.
Replace `192.168.50.150` with your Q-SYS Core IP address.

## Testing

Basic functionality test:
```bash
# Set your Q-SYS Core IP
export QSYS_HOST=192.168.50.150

# Run the server
node index.js

# In another terminal, use the MCP inspector or test scripts
```

For comprehensive testing, see `test-prompts-v2.md`.

## License

MIT