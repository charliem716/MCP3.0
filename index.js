#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Qrwc } from '@q-sys/qrwc';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';



const CONFIG_DIR = path.join(os.homedir(), '.qsys-mcp');
const LAST_CONNECTION_FILE = path.join(CONFIG_DIR, 'last-connection.json');
const PROTECTED_PATTERNS = [/^Master\./i, /^Emergency\./i, /\.power$/i, /^SystemMute/i];
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_STDIO_SIZE = 1024 * 1024; // 1MB threshold for truncation
const MAX_RECORDING_SIZE = 600000; // 600KB limit for CSV recordings

class QSysMCP3Server {
  constructor() {
    this.qrwc = null;
    this.state = { connection: 'disconnected', host: null, reconnectAttempt: 0, connectedAt: null };
    this.cache = { discovery: null, timestamp: 0 };
    this.config = this.loadConfig();
    this.connectingPromise = null;  // Track ongoing connection attempt
    this.recording = null;  // Track active recording: { startTime, duration, file, stream, listener, count, filter }
    
    this.server = new Server(
      { name: 'qsys-mcp3', version: '3.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
    
    // Connect to stdio transport
    this.server.connect(new StdioServerTransport());
  }

  loadConfig() {
    const defaults = { port: 443, secure: true, autoConnect: true, pollingInterval: 350 };
    
    // Try loading saved config
    const tryLoad = (file) => {
      try { return JSON.parse(fs.readFileSync(file, 'utf8')); } 
      catch { return {}; }
    };
    
    const config = { 
      ...defaults, 
      ...tryLoad(path.join(CONFIG_DIR, 'config.json')),
      ...tryLoad(LAST_CONNECTION_FILE) 
    };
    
    // Environment overrides
    if (process.env.QSYS_HOST) config.host = process.env.QSYS_HOST;
    if (process.env.QSYS_PORT) config.port = parseInt(process.env.QSYS_PORT);
    if (process.env.QSYS_AUTO_CONNECT) config.autoConnect = process.env.QSYS_AUTO_CONNECT === 'true';
    if (process.env.QSYS_POLLING_INTERVAL) config.pollingInterval = parseInt(process.env.QSYS_POLLING_INTERVAL);
    
    // Debug logging
    if (process.env.QSYS_MCP_DEBUG === 'true') {
      console.error('MCP3.0 Config:', JSON.stringify(config, null, 2));
      console.error('Environment:', {
        QSYS_HOST: process.env.QSYS_HOST,
        QSYS_PORT: process.env.QSYS_PORT,
        QSYS_AUTO_CONNECT: process.env.QSYS_AUTO_CONNECT
      });
    }
    
    return config;
  }

  async connect({ host, port = 443, secure = true, pollingInterval = 350 }) {
    const startTime = Date.now();
    
    // Validate host parameter
    if (!host) {
      throw new Error('Host parameter is required');
    }
    
    if (this.qrwc) {
      this.qrwc.removeAllListeners();  // Clean up event handlers
      try {
        this.qrwc.close();
      } catch (e) {
        // Ignore close errors
      }
      this.qrwc = null;
    }
    
    // Reset reconnection state on manual connect
    this.state = { connection: 'connecting', host, reconnectAttempt: 0, connectedAt: null };
    this.cache = { discovery: null, timestamp: 0 };
    
    try {
      const socket = new WebSocket(
        `${secure ? 'wss' : 'ws'}://${host}:${port}/qrc-public-api/v0`,
        { rejectUnauthorized: false }
      );
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.terminate();
          reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);
        
        socket.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      const options = { 
        socket, 
        pollingInterval: Math.max(34, pollingInterval)
      };
      
      this.qrwc = await Qrwc.createQrwc(options);
      
      const componentsLoaded = Object.keys(this.qrwc.components || {}).length;
      
      // If no components loaded, there's a connection issue or empty design
      if (componentsLoaded === 0) {
        // Give SDK time to clean up before closing
        await new Promise(r => setTimeout(r, 100));
        try {
          this.qrwc.close();
        } catch {}
        this.qrwc = null;
        this.state.connection = 'disconnected';
        
        throw new Error('No components found in Q-SYS design. Verify Core is running and has a design loaded');
      }
      
      this.state.connection = 'connected';
      this.state.connectedAt = new Date();
      
      this.qrwc.on('disconnected', () => this.handleDisconnect());
      
      // Add error handler to prevent crashes
      this.qrwc.on('error', (error) => {
        if (process.env.QSYS_MCP_DEBUG === 'true') {
          console.error('QRWC Error caught:', error.message);
        }
        this.handleDisconnect();
      });
      
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(LAST_CONNECTION_FILE, JSON.stringify({ host, port, secure, pollingInterval }, null, 2));
      } catch {}
      
      const connectionTime = Date.now() - startTime;
      return { connected: true, host, port, secure, pollingInterval: Math.max(34, pollingInterval), componentsLoaded, connectionTime };
    } catch (error) {
      this.state.connection = 'disconnected';
      this.state.host = null;
      throw error;
    }
  }

  handleDisconnect() {
    // Stop any active recording before disconnect
    if (this.recording) {
      const summary = this.stopRecording();
      if (process.env.QSYS_MCP_DEBUG === 'true') {
        console.error('Recording stopped due to disconnect:', summary);
      }
    }
    
    // Don't restart if already reconnecting
    if (this.state.connection === 'reconnecting') return;
    
    this.state.connection = 'disconnected';
    this.qrwc = null;
    this.cache = { discovery: null, timestamp: 0 };
    
    if (this.state.reconnectAttempt < RECONNECT_DELAYS.length && this.state.host) {
      const delay = RECONNECT_DELAYS[this.state.reconnectAttempt++];
      this.state.connection = 'reconnecting';
      
      setTimeout(async () => {
        try {
          await this.connect({ 
            ...this.config, 
            host: this.state.host
          });
          this.state.reconnectAttempt = 0; // Reset on success
        } catch (error) {
          if (process.env.QSYS_MCP_DEBUG === 'true') {
            console.error('Reconnection failed:', error.message);
          }
          this.handleDisconnect(); // Try again
        }
      }, delay);
    }
  }

  // Tool implementations
  async ensureConnected() {
    // Already connected
    if (this.state.connection === 'connected' && this.qrwc) return;
    
    // Connection in progress - wait for it
    if (this.connectingPromise) return await this.connectingPromise;
    
    const host = process.env.QSYS_HOST || this.config.host;
    if (!host) {
      throw new Error('QSYS_HOST environment variable required');
    }
    
    // Start new connection
    this.connectingPromise = this.connect({
      host,
      port: parseInt(process.env.QSYS_PORT || this.config.port || 443),
      secure: process.env.QSYS_SECURE !== 'false',
      pollingInterval: parseInt(process.env.QSYS_POLLING_INTERVAL || this.config.pollingInterval || 350)
    });
    
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  async toolStatus({ detailed } = {}) {
    const status = {
      connected: this.state.connection === 'connected',
      connectionState: this.state.connection,
      host: this.state.host
    };
    
    if (this.qrwc) {
      const components = Object.entries(this.qrwc.components);
      status.componentCount = components.length;
      status.controlCount = components.reduce((sum, [, comp]) => 
        sum + Object.keys(comp.controls).length, 0);
      status.pollingInterval = this.config.pollingInterval;
      
      if (this.state.connectedAt) {
        status.uptime = Math.floor((Date.now() - this.state.connectedAt.getTime()) / 1000);
      }
      
      // Add memory usage
      status.memoryUsage = process.memoryUsage();
      
      if (detailed) {
        status.components = components.map(([name, comp]) => ({
          name,
          type: comp.type || 'unknown',
          controlCount: Object.keys(comp.controls).length
        }));
      }
    }
    
    if (this.state.reconnectAttempt > 0) {
      status.reconnectAttempt = this.state.reconnectAttempt;
    }
    
    // Add recording status if active
    if (this.recording) {
      const elapsed = (Date.now() - this.recording.startTime) / 1000;
      const remaining = (this.recording.duration / 1000) - elapsed;
      
      status.recording = {
        active: true,
        elapsed: Math.round(elapsed * 10) / 10,
        remaining: Math.max(0, Math.round(remaining * 10) / 10),
        eventsRecorded: this.recording.count,
        bytesWritten: this.recording.bytesWritten,
        file: this.recording.file
      };
    }
    
    return this.success(status);
  }

  async toolDiscover({ component, includeControls = false } = {}) {
    try {
      await this.ensureConnected();
    } catch (error) {
      return this.error(error.message, 'Check QSYS_HOST environment variable');
    }
    
    // Check cache (1 second TTL)
    if (this.cache.discovery && Date.now() - this.cache.timestamp < 1000) {
      let result = this.cache.discovery;
      
      if (component) {
        const regex = new RegExp(component, 'i');
        result = result.filter(c => regex.test(c.name));
      }
      
      if (!includeControls) {
        result = result.map(({ name, type, controlCount }) => ({ name, type, controlCount }));
      }
      
      return this.success(result);
    }
    
    // Build fresh discovery
    const components = Object.entries(this.qrwc.components).map(([name, comp]) => {
      const base = {
        name,
        type: comp.type || 'unknown',
        controlCount: Object.keys(comp.controls).length
      };
      
      if (includeControls) {
        base.controls = Object.entries(comp.controls).map(([ctrlName, ctrl]) => ({
          name: ctrlName,
          type: ctrl.state.Type,
          value: ctrl.state.Value,
          string: ctrl.state.String,
          position: ctrl.state.Position,
          bool: ctrl.state.Bool,
          direction: ctrl.state.Direction,
          choices: ctrl.state.Choices || null,
          min: ctrl.state.ValueMin !== undefined ? ctrl.state.ValueMin : null,
          max: ctrl.state.ValueMax !== undefined ? ctrl.state.ValueMax : null
        }));
      }
      
      return base;
    });
    
    // Cache full result
    this.cache = { discovery: components, timestamp: Date.now() };
    
    // Apply filter
    let result = components;
    if (component) {
      const regex = new RegExp(component, 'i');
      result = result.filter(c => regex.test(c.name));
    }
    
    return this.success(result);
  }

  async toolGet({ controls }) {
    try {
      await this.ensureConnected();
    } catch (error) {
      return this.error(error.message, 'Check QSYS_HOST environment variable');
    }
    
    const results = controls.map(path => {
      try {
        const [comp, ctrl] = this.parsePath(path);
        const control = this.qrwc.components[comp]?.controls[ctrl];
        
        if (!control) {
          return { control: path, error: this.getHelpfulError(path, comp) };
        }
        
        const { Value, String, Position, Bool, Direction, Choices, ValueMin, ValueMax } = control.state;
        return { 
          control: path, 
          value: Value, 
          string: String, 
          position: Position, 
          bool: Bool,
          direction: Direction,
          choices: Choices || null,
          min: ValueMin !== undefined ? ValueMin : null,
          max: ValueMax !== undefined ? ValueMax : null
        };
      } catch (error) {
        return { control: path, error: error.message };
      }
    });
    
    return this.success(results);
  }

  async toolSet({ controls }) {
    try {
      await this.ensureConnected();
    } catch (error) {
      return this.error(error.message, 'Check QSYS_HOST environment variable');
    }
    
    const updates = controls.map(async ({ path, value, force }) => {
      try {
        const [comp, ctrl] = this.parsePath(path);
        const control = this.qrwc.components[comp]?.controls[ctrl];
        
        if (!control) {
          return { control: path, error: this.getHelpfulError(path, comp) };
        }
        
        // Protection check
        if (!force && PROTECTED_PATTERNS.some(p => p.test(path))) {
          return { control: path, error: 'Protected control. Use force:true to override' };
        }
        
        // Read-only check
        const { Direction } = control.state;
        if (Direction === 'Read' || Direction === 'Read Only') {
          return { control: path, error: 'Control is read-only and cannot be modified', success: false };
        }
        
        // Validation
        const { Type, ValueMin, ValueMax } = control.state;
        
        if (Type === 'Boolean' && typeof value !== 'boolean') {
          throw new Error(`Boolean control requires true/false, got "${value}"`);
        }
        
        if ((Type === 'Float' || Type === 'Integer') && typeof value !== 'number') {
          throw new Error(`Numeric control requires number, got ${typeof value}`);
        }
        
        if (Type === 'Integer' && !Number.isInteger(value)) {
          throw new Error(`Integer control requires whole number, got ${value}`);
        }
        
        if (ValueMin !== undefined && value < ValueMin) {
          throw new Error(`Value ${value} below minimum ${ValueMin}`);
        }
        
        if (ValueMax !== undefined && value > ValueMax) {
          throw new Error(`Value ${value} above maximum ${ValueMax}`);
        }
        
        // Update
        const newState = await control.update(value);
        
        // Verify the value actually changed to what we requested (unless it's a trigger control)
        // For boolean controls, compare the boolean value
        // For numeric controls, compare the numeric value
        if (control.state.Type !== 'Trigger') {
          const requestMatches = (control.state.Type === 'Boolean') 
            ? newState.Bool === value
            : Math.abs(newState.Value - value) < 0.001; // Small tolerance for float comparison
            
          if (!requestMatches) {
            return {
              control: path,
              error: 'Control rejected - value not set as requested',
              suggestion: 'Control may be read-only, locked, or require permissions',
              requested: value,
              actual: newState.Value,
              success: false
            };
          }
        }
        
        return {
          control: path,
          value: newState.Value,
          string: newState.String,
          position: newState.Position,
          success: true  // Changed from confirmed to success for consistency
        };
      } catch (error) {
        return { control: path, error: error.message, success: false };
      }
    });
    
    const results = await Promise.allSettled(updates);
    return this.success({ 
      results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason) 
    });
  }

  async toolRecordControls({ duration = 60, filename, filter } = {}) {
    // Validate duration
    if (duration < 1 || duration > 300) {
      return this.error('Duration must be between 1 and 300 seconds');
    }
    
    try {
      await this.ensureConnected();
    } catch (error) {
      return this.error(error.message, 'Check QSYS_HOST environment variable');
    }
    
    // Stop any existing recording
    if (this.recording) {
      this.stopRecording();
    }
    
    // Setup CSV file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvFile = filename || `control-recording-${timestamp}.csv`;
    const fullPath = path.join('/tmp', csvFile);
    
    // Create CSV with headers
    const headers = 'timestamp,elapsed_ms,component,control,value,string,position,bool,min,max\n';
    fs.writeFileSync(fullPath, headers);
    
    // Setup recording state
    const startTime = Date.now();
    this.recording = {
      startTime,
      duration: duration * 1000,
      file: fullPath,
      filter: filter ? new RegExp(filter) : null,
      count: 0,
      csvRows: [headers],
      bytesWritten: headers.length,
      maxSize: MAX_RECORDING_SIZE,
      stream: fs.createWriteStream(fullPath, { flags: 'a' }),
      autoStopped: false
    };
    
    // Attach global listener for all control updates
    const recordingListener = (component, control, state) => {
      if (!this.recording || this.recording.stopping) return;
      
      const controlPath = `${component.name}.${control.name}`;
      
      // Apply filter if specified
      if (this.recording.filter && !this.recording.filter.test(controlPath)) {
        return;
      }
      
      // Build CSV row
      const now = Date.now();
      const elapsed = now - this.recording.startTime;
      
      const row = [
        now,
        elapsed,
        component.name,
        control.name,
        state.Value ?? '',
        `"${(state.String || '').replace(/"/g, '""')}"`,
        state.Position ?? '',
        state.Bool ?? '',
        state.ValueMin ?? '',
        state.ValueMax ?? ''
      ].join(',') + '\n';
      
      // Check size limit before adding
      if (this.recording.bytesWritten + row.length > this.recording.maxSize) {
        if (!this.recording.stopping) {
          this.recording.stopping = true;
          this.recording.autoStopped = true;
          if (process.env.QSYS_MCP_DEBUG === 'true') {
            console.error(`Recording auto-stopped at 600KB limit after ${((Date.now() - this.recording.startTime) / 1000).toFixed(1)}s`);
          }
          process.nextTick(() => this.stopRecording());
        }
        return;
      }
      
      // Write and store
      this.recording.stream.write(row);
      this.recording.csvRows.push(row);
      this.recording.bytesWritten += row.length;
      this.recording.count++;
    };
    
    // Start recording
    this.qrwc.on('update', recordingListener);
    this.recording.listener = recordingListener;
    
    // Wait for recording to complete
    return new Promise((resolve) => {
      // Normal completion timer
      const timer = setTimeout(() => {
        if (this.recording) {
          const csvData = this.recording.csvRows.join('');
          const summary = this.stopRecording();
          
          resolve(this.success({
            status: 'recording_complete',
            duration: summary.duration,
            eventsRecorded: summary.eventsRecorded,
            fileSize: csvData.length,
            file: summary.file,
            filter: filter || 'none',
            csvData: csvData,
            message: `Recording completed after ${duration} seconds`
          }));
        }
      }, duration * 1000);
      
      // Check for auto-stop due to size limit
      const checkStop = setInterval(() => {
        if (this.recording?.autoStopped) {
          clearTimeout(timer);
          clearInterval(checkStop);
          
          const csvData = this.recording.csvRows.join('');
          const summary = this.stopRecording();
          
          resolve(this.success({
            status: 'recording_complete',
            duration: summary.duration,
            eventsRecorded: summary.eventsRecorded,
            fileSize: csvData.length,
            file: summary.file,
            filter: filter || 'none',
            autoStopped: true,
            csvData: csvData,
            message: `Recording auto-stopped at 600KB after ${summary.duration.toFixed(1)}s`
          }));
        }
      }, 100);
    });
  }

  // Helpers
  parsePath(path) {
    const dot = path.indexOf('.');
    if (dot === -1) throw new Error(`Invalid path: "${path}"`);
    return [path.slice(0, dot), path.slice(dot + 1)];
  }

  getHelpfulError(_, componentName) {
    const component = this.qrwc?.components[componentName];
    
    if (!component) {
      const available = Object.keys(this.qrwc?.components || {}).slice(0, 5);
      return `Component "${componentName}" not found. Available: ${available.join(', ')}`;
    }
    
    const controls = Object.keys(component.controls).slice(0, 5);
    return `Control not found in "${componentName}". Available: ${controls.join(', ')}`;
  }

  success(data) {
    const json = JSON.stringify(data);
    
    // Truncate if response exceeds 1MB
    if (json.length > MAX_STDIO_SIZE) {
      const truncated = Array.isArray(data) 
        ? { truncated: true, count: data.length, data: data.slice(0, 20) }
        : { truncated: true, size: json.length, error: 'Response too large' };
      return { content: [{ type: 'text', text: JSON.stringify(truncated) }] };
    }
    
    return { content: [{ type: 'text', text: json }] };
  }

  error(message, suggestion) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, suggestion }, null, 2) }],
      isError: true
    };
  }

  stopRecording() {
    if (!this.recording) return null;
    
    // Remove listener
    if (this.recording.listener && this.qrwc) {
      this.qrwc.removeListener('update', this.recording.listener);
    }
    
    // Close file stream
    if (this.recording.stream) {
      this.recording.stream.end();
    }
    
    // Calculate summary
    const elapsed = (Date.now() - this.recording.startTime) / 1000;
    const summary = {
      file: this.recording.file,
      duration: elapsed,
      eventsRecorded: this.recording.count,
      eventsPerSecond: Math.round(this.recording.count / elapsed),
      autoStopped: this.recording.autoStopped || false
    };
    
    this.recording = null;
    
    if (process.env.QSYS_MCP_DEBUG === 'true') {
      console.error('Recording stopped:', summary);
    }
    
    return summary;
  }

  setupHandlers() {
    // Tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (process.env.QSYS_MCP_DEBUG === 'true') {
        console.error(`Tool: ${name}`, args);
      }
      
      const tools = {
        qsys_status: () => this.toolStatus(args),
        qsys_discover: () => this.toolDiscover(args),
        qsys_get: () => this.toolGet(args),
        qsys_set: () => this.toolSet(args),
        qsys_record_controls: () => this.toolRecordControls(args)
      };
      
      try {
        const handler = tools[name];
        if (!handler) {
          return this.error(`Unknown tool: ${name}`);
        }
        const result = await handler();
        if (!result || !result.content) {
          return this.error('Tool returned invalid response', `Tool ${name} failed to return proper content`);
        }
        return result;
      } catch (error) {
        return this.error(`Tool execution failed: ${error.message}`, `Check parameters for ${name}`);
      }
    });
    
    // Tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'qsys_discover',
          description: 'Discover available components and their controls. Auto-connects if needed using QSYS_HOST env var.',
          inputSchema: {
            type: 'object',
            properties: {
              component: { type: 'string', description: 'Component name or regex pattern (omit for all)' },
              includeControls: { 
                type: 'boolean', 
                description: 'Include control details for each component', 
                default: false 
              }
            }
          }
        },
        {
          name: 'qsys_get',
          description: 'Get current values from controls. Auto-connects if needed using QSYS_HOST env var.',
          inputSchema: {
            type: 'object',
            properties: {
              controls: {
                type: 'array',
                description: "Control paths in 'Component.control' format",
                items: { type: 'string' },
                minItems: 1,
                maxItems: 100
              }
            },
            required: ['controls']
          }
        },
        {
          name: 'qsys_set',
          description: 'Set control values. Auto-connects if needed using QSYS_HOST env var.',
          inputSchema: {
            type: 'object',
            properties: {
              controls: {
                type: 'array',
                description: 'Controls to update',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string', description: "Control path in 'Component.control' format" },
                    value: { oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }] },
                    force: { 
                      type: 'boolean', 
                      description: 'Override protection for critical controls', 
                      default: false 
                    }
                  },
                  required: ['path', 'value']
                },
                minItems: 1,
                maxItems: 50
              }
            },
            required: ['controls']
          }
        },
        {
          name: 'qsys_status',
          description: 'Get connection status and system information. Shows current connection state without auto-connecting.',
          inputSchema: {
            type: 'object',
            properties: {
              detailed: { type: 'boolean', description: 'Include component inventory', default: false }
            }
          }
        },
        {
          name: 'qsys_record_controls',
          description: 'Record control changes to CSV for time-series analysis (max 600KB). Auto-connects if needed.',
          inputSchema: {
            type: 'object',
            properties: {
              duration: {
                type: 'number',
                description: 'Recording duration in seconds (1-300)',
                minimum: 1,
                maximum: 300,
                default: 60
              },
              filename: {
                type: 'string',
                description: 'Output CSV filename (default: control-recording-{timestamp}.csv)'
              },
              filter: {
                type: 'string',
                description: 'Regex to select specific controls (e.g., ".*meter.*" for meters, ".*gain.*" for gains)'
              }
            }
          }
        }
      ]
    }));
  }
}

// Start server
new QSysMCP3Server();

