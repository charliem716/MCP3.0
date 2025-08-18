# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP3.0 is an ultra-minimal, high-performance MCP (Model Context Protocol) server for Q-SYS control. The implementation prioritizes speed, simplicity, and reliability with a target of ~400 lines of code and only 3 dependencies.

## Key Commands

### Development
```bash
# Install dependencies (only 3 required)
npm install

# Run the MCP server
node index.js

# Run with environment variables
QSYS_HOST=192.168.1.100 node index.js

# Run with debug logging
QSYS_MCP_DEBUG=true node index.js
```

### Testing
```bash
# No test framework - manual testing checklist:
# 1. Connect to Q-SYS Core
# 2. Test auto-reconnection (disconnect/reconnect network)
# 3. Discover components
# 4. Get/set control values (single and batch)
# 5. Verify type/range validation
# 6. Test protected controls
# 7. Monitor memory usage (must stay under 50MB)
```

## Architecture

The project follows a direct SDK pass-through pattern:
- **MCP Client** → **MCP3 Server** (stdio) → **@q-sys/qrwc SDK** → **Q-SYS Core** (WebSocket)
- Single file implementation (`index.js`) containing all server logic
- 5 MCP tools: `qsys_connect`, `qsys_discover`, `qsys_get`, `qsys_set`, `qsys_status`
- Auto-reconnection with exponential backoff
- Parallel batch operations for performance

## Core Implementation Guidelines

### Performance Requirements
- Tool response time: < 10ms overhead
- Connection time: < 1 second
- Memory usage: < 50MB
- Startup time: < 500ms
- All batch operations must be parallel, not sequential

### Code Principles
1. **Direct SDK usage** - Don't abstract the QRWC SDK, it already handles complexity
2. **Fast failures** - Fail immediately with clear, actionable error messages
3. **Zero state** - No databases, minimal caching (1-second discovery cache only)
4. **Safety first** - Protected controls and validation are mandatory
5. **Helpful errors** - Always suggest available alternatives when something fails

### Protected Controls
The following control patterns require `force: true` to modify:
- `^Master\.` - Master controls
- `^Emergency\.` - Emergency systems
- `\.power$` - Power controls
- `^SystemMute` - System-wide mutes

### Error Handling
All errors must return structured JSON with:
- `error`: Clear description of what went wrong
- `suggestion`: How to fix it
- `details`: Relevant context (available components/controls)

## File Structure
```
qsys-mcp3/
├── package.json    # Dependencies: @q-sys/qrwc, @modelcontextprotocol/sdk, ws
├── index.js        # Main server implementation (~400 lines)
├── README.md       # User documentation
└── CLAUDE.md       # This file
```

## Configuration

### Environment Variables
- `QSYS_HOST` - Q-SYS Core IP address
- `QSYS_PORT` - WebSocket port (default: 443)
- `QSYS_AUTO_CONNECT` - Auto-connect on startup (default: true)
- `QSYS_MCP_DEBUG` - Enable debug logging

### Config File
Location: `~/.qsys-mcp/config.json`
- Stores last successful connection
- Auto-loaded on startup if present

## Implementation Checklist

When implementing features:
1. Check if QRWC SDK already provides the functionality
2. Use parallel execution for batch operations
3. Validate all inputs (type, range, format)
4. Return helpful errors with suggestions
5. Keep implementation under 500 total lines
6. Test memory usage stays under 50MB
7. Ensure auto-reconnection works properly