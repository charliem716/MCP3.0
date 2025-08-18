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

class QSysMCP3Server {
  constructor() {
    this.qrwc = null;
    this.state = { connection: 'disconnected', host: null, reconnectAttempt: 0, connectedAt: null };
    this.cache = { discovery: null, timestamp: 0 };
    this.config = this.loadConfig();
    
    this.server = new Server(
      { name: 'qsys-mcp3', version: '3.0.0' },
      { capabilities: { tools: {} } }
    );
    
    this.setupHandlers();
    this.server.connect(new StdioServerTransport());
    
    // Auto-connect if configured
    if (this.config.host && this.config.autoConnect !== false) {
      setTimeout(() => this.connect(this.config), 100);
    }
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
    ['HOST', 'PORT', 'AUTO_CONNECT', 'POLLING_INTERVAL'].forEach(key => {
      const env = process.env[`QSYS_${key}`];
      if (env) config[key.toLowerCase().replace('_', '')] = 
        key === 'PORT' || key === 'POLLING_INTERVAL' ? parseInt(env) :
        key === 'AUTO_CONNECT' ? env === 'true' : env;
    });
    
    return config;
  }

  async connect({ host, port = 443, secure = true, pollingInterval = 350 }) {
    // Clean up existing connection
    if (this.qrwc) {
      this.qrwc.close();
      this.qrwc = null;
    }
    
    this.state = { ...this.state, connection: 'connecting', host };
    this.cache = { discovery: null, timestamp: 0 };
    
    const url = `${secure ? 'wss' : 'ws'}://${host}:${port}/qrc-public-api/v0`;
    const socket = new WebSocket(url, { rejectUnauthorized: false });
    
    try {
      this.qrwc = await Promise.race([
        Qrwc.createQrwc({ socket, pollingInterval: Math.max(34, pollingInterval), timeout: 5000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 5000))
      ]);
      
      this.state = { 
        connection: 'connected', 
        host, 
        reconnectAttempt: 0, 
        connectedAt: new Date() 
      };
      
      this.qrwc.on('disconnected', () => this.handleDisconnect());
      
      // Save successful connection
      try {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
        fs.writeFileSync(LAST_CONNECTION_FILE, JSON.stringify({ host, port, secure, pollingInterval }, null, 2));
      } catch {}
      
      return { connected: true, host, port, secure, pollingInterval };
    } catch (error) {
      this.state.connection = 'disconnected';
      throw error;
    }
  }

  handleDisconnect() {
    this.state.connection = 'disconnected';
    this.qrwc = null;
    this.cache = { discovery: null, timestamp: 0 };
    
    if (this.state.reconnectAttempt < RECONNECT_DELAYS.length && this.state.host) {
      const delay = RECONNECT_DELAYS[this.state.reconnectAttempt++];
      this.state.connection = 'reconnecting';
      
      setTimeout(async () => {
        try {
          await this.connect({ ...this.config, host: this.state.host });
        } catch {
          this.handleDisconnect();
        }
      }, delay);
    }
  }

  // Tool implementations
  async toolConnect(params) {
    try {
      return this.success(await this.connect(params));
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

  async toolDiscover({ component, includeControls = true } = {}) {
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
          bool: ctrl.state.Bool
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
        
        const { Value, String, Position, Bool } = control.state;
        return { control: path, value: Value, string: String, position: Position, bool: Bool };
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

  // Helpers
  parsePath(path) {
    const parts = path.split('.');
    if (parts.length !== 2) {
      throw new Error(`Invalid path format: "${path}". Use "Component.control"`);
    }
    return parts;
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
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  error(message, suggestion) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, suggestion }, null, 2) }],
      isError: true
    };
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
        qsys_set: () => this.toolSet(args)
      };
      
      return tools[name]?.() || this.error(`Unknown tool: ${name}`);
    });
    
    // Tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'qsys_connect',
          description: 'Connect to Q-SYS Core processor',
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
                default: true 
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
        }
      ]
    }));
  }
}

// Start server
new QSysMCP3Server();