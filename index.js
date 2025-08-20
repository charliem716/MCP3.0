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
const RESPONSE_DIR = path.join(os.tmpdir(), 'qsys-mcp-responses');
const MAX_STDIO_SIZE = 100 * 1024; // 100KB threshold
const FILE_CLEANUP_AGE = 15 * 60 * 1000; // Clean files older than 15 minutes

class QSysMCP3Server {
  constructor() {
    this.qrwc = null;
    this.state = { connection: 'disconnected', host: null, reconnectAttempt: 0, connectedAt: null, filter: null };
    this.cache = { discovery: null, timestamp: 0 };
    this.config = this.loadConfig();
    this.monitors = new Map();
    
    this.server = new Server(
      { name: 'qsys-mcp3', version: '3.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
    
    // Ensure response directory exists
    try {
      fs.mkdirSync(RESPONSE_DIR, { recursive: true });
      this.cleanupOldResponses(); // Clean on startup
    } catch (error) {
      console.error('Warning: Could not create response directory:', error);
    }
    
    // Periodic cleanup every 5 minutes
    setInterval(() => {
      this.cleanupOldResponses();
    }, 5 * 60 * 1000);
    
    // Connect to stdio transport
    this.server.connect(new StdioServerTransport()).then(() => {
      // Auto-connect if configured
      if (this.config.host && this.config.autoConnect !== false) {
        this.connect(this.config).catch(error => {
          if (process.env.QSYS_MCP_DEBUG === 'true') {
            console.error('Auto-connect failed:', error.message);
          }
          // Don't crash, just continue without connection
        });
      }
    });
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

  async connect({ host, port = 443, secure = true, pollingInterval = 350, filter }) {
    const startTime = Date.now();
    
    // Validate host parameter
    if (!host) {
      throw new Error('Host parameter is required');
    }
    
    if (this.qrwc) {
      try {
        this.qrwc.close();
      } catch (e) {
        // Ignore close errors
      }
      this.qrwc = null;
    }
    
    // Reset reconnection state on manual connect
    this.state = { connection: 'connecting', host, reconnectAttempt: 0, filter, connectedAt: null };
    this.cache = { discovery: null, timestamp: 0 };
    
    try {
      const socket = new WebSocket(
        `${secure ? 'wss' : 'ws'}://${host}:${port}/qrc-public-api/v0`,
        { rejectUnauthorized: false }
      );
      
      await new Promise((resolve, reject) => {
        socket.once('open', resolve);
        socket.once('error', reject);
      });
      
      // Create filter function with error handling
      let componentFilter = undefined;
      if (filter) {
        try {
          const filterRegex = new RegExp(filter, 'i');
          componentFilter = (c) => {
            try {
              return filterRegex.test(c.Name);
            } catch {
              return false;
            }
          };
        } catch (error) {
          throw new Error(`Invalid filter pattern: ${error.message}`);
        }
      }
      
      const options = { 
        socket, 
        pollingInterval: Math.max(34, pollingInterval),
        componentFilter
      };
      
      this.qrwc = await Qrwc.createQrwc(options);
      
      const componentsLoaded = Object.keys(this.qrwc.components).length;
      
      // If no components match the filter, close and return error
      if (filter && componentsLoaded === 0) {
        // Give SDK time to clean up before closing
        await new Promise(r => setTimeout(r, 100));
        try {
          this.qrwc.close();
        } catch {}
        this.qrwc = null;
        this.state.connection = 'disconnected';
        throw new Error(`No components match filter pattern: "${filter}"`);
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
        fs.writeFileSync(LAST_CONNECTION_FILE, JSON.stringify({ host, port, secure, pollingInterval, filter }, null, 2));
      } catch {}
      
      const connectionTime = Date.now() - startTime;
      return { connected: true, host, port, secure, pollingInterval: Math.max(34, pollingInterval), componentsLoaded, filterApplied: !!filter, connectionTime };
    } catch (error) {
      this.state.connection = 'disconnected';
      this.state.host = null;
      throw error;
    }
  }

  handleDisconnect() {
    // Don't restart if already reconnecting
    if (this.state.connection === 'reconnecting') return;
    
    const previousFilter = this.state.filter;
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
            host: this.state.host,
            filter: previousFilter
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
  async toolConnect(params = {}) {
    // If currently connecting, wait for it to complete
    if (this.state.connection === 'connecting') {
      const timeout = 10000; // 10 seconds
      const start = Date.now();
      
      while (this.state.connection === 'connecting' && Date.now() - start < timeout) {
        await new Promise(r => setTimeout(r, 100));
      }
      
      // Return result of the connection attempt
      if (this.state.connection === 'connected') {
        return this.success({ 
          connected: true, 
          host: this.state.host,
          port: this.config.port,
          secure: this.config.secure,
          pollingInterval: this.config.pollingInterval,
          componentsLoaded: Object.keys(this.qrwc?.components || {}).length,
          filterApplied: !!this.state.filter
        });
      }
      // If still not connected after timeout, fall through to try new connection
    }
    
    // If already connected, check if filter needs to change or host is different
    if (this.state.connection === 'connected' && this.qrwc) {
      // If host is different, need to reconnect
      if (params.host && params.host !== this.state.host) {
        try {
          const mergedParams = {
            port: this.config.port,
            secure: this.config.secure,
            pollingInterval: this.config.pollingInterval,
            ...params
          };
          return this.success(await this.connect(mergedParams));
        } catch (error) {
          return this.error(error.message, 'Check host IP and ensure Q-SYS Core is accessible');
        }
      }
      // If filter is different, need to reconnect
      if (params.filter !== this.state.filter) {
        // Disconnect and reconnect with new filter
        try {
          const mergedParams = {
            port: this.config.port,
            secure: this.config.secure,
            pollingInterval: this.config.pollingInterval,
            host: this.state.host,
            ...params
          };
          return this.success(await this.connect(mergedParams));
        } catch (error) {
          return this.error(error.message, 'Check filter pattern and host connectivity');
        }
      }
      // Otherwise return existing connection
      return this.success({
        connected: true,
        host: this.state.host,
        port: this.config.port,
        secure: this.config.secure,
        pollingInterval: this.config.pollingInterval,
        componentsLoaded: Object.keys(this.qrwc.components).length,
        filterApplied: !!this.state.filter
      });
    }
    
    // If no host provided, try to use saved config or return helpful error
    if (!params.host) {
      if (this.config.host) {
        params.host = this.config.host;
      } else {
        return this.error(
          'No host specified',
          'Provide host IP address (e.g., { host: "192.168.1.100" })'
        );
      }
    }
    
    try {
      // Merge params with config defaults, params take precedence
      const mergedParams = {
        port: this.config.port,
        secure: this.config.secure,
        pollingInterval: this.config.pollingInterval,
        ...params
      };
      return this.success(await this.connect(mergedParams));
    } catch (error) {
      return this.error(error.message, 'Check host IP and ensure Q-SYS Core is accessible');
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
        status.uptime = Date.now() - this.state.connectedAt.getTime();
      }
      
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
    
    return this.success(status);
  }

  async toolDiscover({ component, includeControls = false } = {}) {
    if (!this.qrwc) return this.error('Not connected to Q-SYS Core', 'Use qsys_connect first');
    
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
    if (!this.qrwc) return this.error('Not connected to Q-SYS Core', 'Use qsys_connect first');
    
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
          choices: Choices,
          min: ValueMin,
          max: ValueMax
        };
      } catch (error) {
        return { control: path, error: error.message };
      }
    });
    
    return this.success(results);
  }

  async toolSet({ controls }) {
    if (!this.qrwc) return this.error('Not connected to Q-SYS Core', 'Use qsys_connect first');
    
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
              confirmed: false
            };
          }
        }
        
        return {
          control: path,
          value: newState.Value,
          string: newState.String,
          position: newState.Position,
          confirmed: true
        };
      } catch (error) {
        return { control: path, error: error.message, confirmed: false };
      }
    });
    
    const results = await Promise.allSettled(updates);
    return this.success(results.map(r => r.status === 'fulfilled' ? r.value : r.reason));
  }

  async toolMonitor({ action, id, controls }) {
    if (action === 'start') {
      if (!this.qrwc) return this.error('Not connected to Q-SYS Core', 'Use qsys_connect first');
      
      const updates = [];
      const listeners = [];
      
      for (const path of controls) {
        const [comp, ctrl] = this.parsePath(path);
        const control = this.qrwc.components[comp]?.controls[ctrl];
        if (!control) continue;
        
        const fn = (state) => {
          updates.push({ path, ...state, time: Date.now() });
          if (updates.length > 100) updates.shift();
        };
        control.on('update', fn);
        listeners.push({ control, fn });
      }
      
      this.monitors.set(id, { updates, listeners });
      return this.success({ started: true, id, monitoring: listeners.length });
    }
    
    if (action === 'read') {
      const mon = this.monitors.get(id);
      if (!mon) return this.error('Monitor not found', `Use action:'start' first with id:'${id}'`);
      const events = mon.updates.splice(0);
      return this.success({ events, count: events.length });
    }
    
    if (action === 'stop') {
      const mon = this.monitors.get(id);
      if (!mon) return this.error('Monitor not found');
      mon.listeners.forEach(({ control, fn }) => control.off('update', fn));
      this.monitors.delete(id);
      return this.success({ stopped: true, id });
    }
    
    return this.error('Invalid action', 'Use start, read, or stop');
  }

  // Helpers
  parsePath(path) {
    const dot = path.indexOf('.');
    if (dot === -1) throw new Error(`Invalid path: "${path}"`);
    return [path.slice(0, dot), path.slice(dot + 1)];
  }

  getHelpfulError(path, componentName) {
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
    
    // Check if response exceeds safe stdio size
    if (json.length > MAX_STDIO_SIZE) {
      return this.largeResponse(json, data);
    }
    
    // Normal response for small data
    return { content: [{ type: 'text', text: json }] };
  }
  
  largeResponse(json, originalData) {
    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const filename = `response-${timestamp}-${Math.random().toString(36).substr(2, 9)}.json`;
      const filepath = path.join(RESPONSE_DIR, filename);
      
      // Write to file atomically (write to temp, then rename)
      const tempPath = filepath + '.tmp';
      fs.writeFileSync(tempPath, json);
      fs.renameSync(tempPath, filepath);
      
      // Return file reference with metadata
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            largeResponse: true,
            file: filepath,
            size: json.length,
            sizeHuman: this.formatBytes(json.length),
            created: new Date().toISOString(),
            expiresIn: '15 minutes',
            summary: this.generateSummary(originalData)
          })
        }]
      };
    } catch (error) {
      // Fallback: Return truncated data with error
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Could not write large response to file',
            details: error.message,
            truncated: true,
            data: Array.isArray(originalData) 
              ? originalData.slice(0, 20) 
              : { error: 'Response too large' }
          })
        }]
      };
    }
  }

  error(message, suggestion) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, suggestion }, null, 2) }],
      isError: true
    };
  }
  
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' bytes';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  
  generateSummary(data) {
    if (Array.isArray(data)) {
      return {
        type: 'array',
        length: data.length,
        sample: data.slice(0, 3)
      };
    }
    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      return {
        type: 'object',
        keys: keys.slice(0, 5),
        totalKeys: keys.length
      };
    }
    return { type: typeof data };
  }
  
  cleanupOldResponses() {
    try {
      const now = Date.now();
      const files = fs.readdirSync(RESPONSE_DIR);
      
      files.forEach(file => {
        if (file.startsWith('response-') && file.endsWith('.json')) {
          const filepath = path.join(RESPONSE_DIR, file);
          const stats = fs.statSync(filepath);
          
          // Delete if older than cleanup age
          if (now - stats.mtimeMs > FILE_CLEANUP_AGE) {
            fs.unlinkSync(filepath);
            if (process.env.QSYS_MCP_DEBUG === 'true') {
              console.error(`Cleaned up old response file: ${file}`);
            }
          }
        }
      });
    } catch (error) {
      // Non-critical, just log if debug
      if (process.env.QSYS_MCP_DEBUG === 'true') {
        console.error('Cleanup error:', error);
      }
    }
  }

  setupHandlers() {
    // Tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (process.env.QSYS_MCP_DEBUG === 'true') {
        console.error(`Tool: ${name}`, args);
      }
      
      const tools = {
        qsys_connect: () => this.toolConnect(args),
        qsys_status: () => this.toolStatus(args),
        qsys_discover: () => this.toolDiscover(args),
        qsys_get: () => this.toolGet(args),
        qsys_set: () => this.toolSet(args),
        qsys_monitor: () => this.toolMonitor(args)
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
          name: 'qsys_connect',
          description: 'Connect to Q-SYS Core or return existing connection. Reconnects if host/filter changes.',
          inputSchema: {
            type: 'object',
            properties: {
              host: { type: 'string', description: 'IP address or hostname of Q-SYS Core' },
              port: { type: 'number', description: 'WebSocket port (default: 443)', default: 443 },
              secure: { type: 'boolean', description: 'Use secure WebSocket (wss://)', default: true },
              pollingInterval: { 
                type: 'number', 
                description: 'Control polling interval in ms (min: 34, default: 350)',
                minimum: 34, 
                default: 350 
              },
              filter: {
                type: 'string',
                description: 'Regex to filter components (e.g. "^Audio" for audio only)'
              }
            },
            required: ['host']
          }
        },
        {
          name: 'qsys_discover',
          description: 'Discover available components and their controls',
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
          description: 'Get current values from controls',
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
          description: 'Set control values',
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
          description: 'Get connection status and system information',
          inputSchema: {
            type: 'object',
            properties: {
              detailed: { type: 'boolean', description: 'Include component inventory', default: false }
            }
          }
        },
        {
          name: 'qsys_monitor',
          description: 'Monitor control changes in real-time',
          inputSchema: {
            type: 'object',
            properties: {
              action: { 
                type: 'string', 
                enum: ['start', 'read', 'stop'],
                description: 'Monitor action: start monitoring, read events, or stop'
              },
              id: { 
                type: 'string', 
                description: 'Unique monitor identifier'
              },
              controls: { 
                type: 'array',
                description: 'Control paths to monitor (only for start action)',
                items: { type: 'string' }
              }
            },
            required: ['action', 'id']
          }
        }
      ]
    }));
  }
}

// Start server
const server = new QSysMCP3Server();

// Cleanup on exit
process.on('exit', () => {
  try {
    // Clean all response files on exit
    const files = fs.readdirSync(RESPONSE_DIR);
    files.forEach(file => {
      if (file.startsWith('response-')) {
        fs.unlinkSync(path.join(RESPONSE_DIR, file));
      }
    });
  } catch {}
});