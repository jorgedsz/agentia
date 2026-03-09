/**
 * n8n Workflow Service
 *
 * Handles integration with self-hosted n8n for creating and managing chatbot workflows.
 * n8n API docs: https://docs.n8n.io/api/
 */

class N8nService {
  constructor() {
    this.baseUrl = null;
    this._apiKey = null;
  }

  setConfig(url, apiKey) {
    this.baseUrl = url?.replace(/\/$/, '');
    this._apiKey = apiKey;
  }

  isConfigured() {
    return !!(this.baseUrl && this._apiKey);
  }

  async makeRequest(endpoint, method = 'GET', body = null, retries = 2) {
    if (!this.isConfigured()) {
      throw new Error('n8n is not configured');
    }

    const options = {
      method,
      headers: {
        'X-N8N-API-KEY': this._apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(`${this.baseUrl}/api/v1${endpoint}`, options);

      if (response.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`n8n rate limited on ${method} ${endpoint}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage;
        try {
          const error = JSON.parse(errorBody);
          errorMessage = error.message || error.error || errorBody;
        } catch {
          errorMessage = errorBody || `n8n API error: ${response.status}`;
        }
        console.error(`n8n API error ${response.status}: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      // DELETE may return empty body
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    }
  }

  /**
   * Build n8n workflow JSON from chatbot configuration
   */
  buildWorkflowTemplate(chatbot) {
    const config = typeof chatbot.config === 'string' ? JSON.parse(chatbot.config || '{}') : (chatbot.config || {});
    const workflowName = `Chatbot: ${chatbot.name} (ID: ${chatbot.id})`;
    const outputType = chatbot.outputType || config.outputType || 'respond_to_webhook';
    const outputUrl = chatbot.outputUrl || config.outputUrl || '';

    const nodes = [];
    const connections = {};

    // 1. Webhook Trigger node
    const webhookNode = {
      id: 'webhook-trigger',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        path: `chatbot-${chatbot.id}`,
        httpMethod: 'POST',
        responseMode: outputType === 'respond_to_webhook' ? 'responseNode' : 'onReceived',
        options: {}
      },
      webhookId: `chatbot-${chatbot.id}`
    };
    nodes.push(webhookNode);

    // 2. AI Agent node
    const aiAgentNode = {
      id: 'ai-agent',
      name: 'AI Chat Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 1.7,
      position: [500, 300],
      parameters: {
        text: '={{ $json.body.message || $json.body.text || "" }}',
        options: {
          systemMessage: config.systemPrompt || 'You are a helpful assistant.'
        }
      }
    };
    nodes.push(aiAgentNode);

    // 3. LLM Model sub-node
    const llmType = this._getLLMNodeType(config.modelProvider);
    const llmNode = {
      id: 'llm-model',
      name: 'LLM Model',
      type: llmType,
      typeVersion: 1,
      position: [500, 500],
      parameters: {
        model: config.modelName || 'gpt-4o',
        options: {}
      }
    };
    nodes.push(llmNode);

    // 4. HTTP Request Tool nodes from config.tools
    const toolNodes = [];
    if (Array.isArray(config.tools) && config.tools.length > 0) {
      config.tools.forEach((tool, idx) => {
        const toolNodeName = `Tool: ${tool.name || `tool_${idx + 1}`}`;

        // Parse body schema - convert JSON Schema format to n8n {placeholder} format
        let bodyObj = null;
        if (tool.body) {
          bodyObj = typeof tool.body === 'string' ? (() => { try { return JSON.parse(tool.body); } catch { return null; } })() : tool.body;
        }

        // Build placeholder body and definitions from JSON Schema properties
        const placeholderBody = {};
        const placeholderDefs = [];
        if (bodyObj && bodyObj.type === 'object' && bodyObj.properties) {
          for (const [propName, propDef] of Object.entries(bodyObj.properties)) {
            placeholderBody[propName] = `{${propName}}`;
            placeholderDefs.push({
              name: propName,
              description: propDef.description || propName,
              type: propDef.type || 'string'
            });
          }
        } else if (bodyObj && !bodyObj.type) {
          for (const [key, val] of Object.entries(bodyObj)) {
            placeholderBody[key] = val;
          }
        }

        const hasPlaceholders = placeholderDefs.length > 0;
        const sendBody = hasPlaceholders || !!(tool.body);

        const toolNode = {
          id: `tool-${idx}`,
          name: toolNodeName,
          type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
          typeVersion: 1,
          position: [300 + (idx * 200), 550],
          parameters: {
            name: tool.name || `tool_${idx + 1}`,
            description: tool.description || '',
            url: tool.url || '',
            method: tool.method || 'POST',
            authentication: 'none',
            sendBody,
            options: {
              timeout: (tool.timeoutSeconds || 20) * 1000
            }
          }
        };

        if (sendBody) {
          toolNode.parameters.specifyBody = 'json';
          toolNode.parameters.jsonBody = hasPlaceholders
            ? JSON.stringify(placeholderBody)
            : (typeof tool.body === 'string' ? tool.body : JSON.stringify(tool.body || {}));
        }

        // Add placeholder definitions so n8n AI knows what to fill
        if (placeholderDefs.length > 0) {
          toolNode.parameters.placeholderDefinitions = {
            values: placeholderDefs
          };
        }

        // Add headers if present
        if (tool.headers && typeof tool.headers === 'object') {
          toolNode.parameters.sendHeaders = true;
          toolNode.parameters.headerParameters = {
            parameters: Object.entries(tool.headers).map(([name, value]) => ({ name, value }))
          };
        }

        nodes.push(toolNode);
        toolNodes.push(toolNode);
      });
    }

    // 5. Output node based on outputType
    if (outputType === 'respond_to_webhook') {
      const respondNode = {
        id: 'respond-webhook',
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1.1,
        position: [750, 300],
        parameters: {
          respondWith: 'json',
          responseBody: `={{ JSON.stringify({ response: $json.output, chatbotId: ${chatbot.id} }) }}`
        }
      };
      nodes.push(respondNode);
    } else if (outputType === 'external_webhook' && outputUrl) {
      const httpNode = {
        id: 'http-output',
        name: 'Send to External Webhook',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [750, 300],
        parameters: {
          url: outputUrl,
          method: 'POST',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={{ JSON.stringify({ response: $json.output, chatbotId: ${chatbot.id} }) }}`
        }
      };
      nodes.push(httpNode);
    } else if (outputType === 'http_request' && outputUrl) {
      const httpNode = {
        id: 'http-request',
        name: 'HTTP Request',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [750, 300],
        parameters: {
          url: outputUrl,
          method: 'POST',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={{ JSON.stringify({ response: $json.output, chatbotId: ${chatbot.id}, metadata: $json }) }}`
        }
      };
      nodes.push(httpNode);
    }

    // Build connections
    const outputNodeName = nodes[nodes.length - 1].name;

    connections['Webhook Trigger'] = {
      main: [[{ node: 'AI Chat Agent', type: 'main', index: 0 }]]
    };

    connections['AI Chat Agent'] = {
      main: [[{ node: outputNodeName, type: 'main', index: 0 }]]
    };

    // LLM connected as ai_languageModel to AI Agent
    connections['LLM Model'] = {
      ai_languageModel: [[{ node: 'AI Chat Agent', type: 'ai_languageModel', index: 0 }]]
    };

    // Tool nodes connected as ai_tool to AI Agent (all use index 0)
    toolNodes.forEach((toolNode) => {
      connections[toolNode.name] = {
        ai_tool: [[{ node: 'AI Chat Agent', type: 'ai_tool', index: 0 }]]
      };
    });

    return {
      name: workflowName,
      nodes,
      connections,
      settings: {
        executionOrder: 'v1'
      },
      staticData: null
    };
  }

  _getLLMNodeType(provider) {
    const providerMap = {
      'openai': '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      'anthropic': '@n8n/n8n-nodes-langchain.lmChatAnthropic',
      'google': '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
      'groq': '@n8n/n8n-nodes-langchain.lmChatGroq',
      'mistral': '@n8n/n8n-nodes-langchain.lmChatMistralCloud'
    };
    return providerMap[provider] || providerMap['openai'];
  }

  async createWorkflow(chatbot) {
    const workflowData = this.buildWorkflowTemplate(chatbot);
    console.log('Creating n8n workflow:', workflowData.name);
    const result = await this.makeRequest('/workflows', 'POST', workflowData);
    console.log('Created n8n workflow ID:', result.id);
    return result;
  }

  async updateWorkflow(workflowId, chatbot) {
    const workflowData = this.buildWorkflowTemplate(chatbot);
    console.log('Updating n8n workflow:', workflowId);

    // n8n requires deactivating before updating, then reactivating
    try {
      await this.deactivateWorkflow(workflowId);
    } catch (err) {
      console.log('Deactivate before update (may already be inactive):', err.message);
    }

    const result = await this.makeRequest(`/workflows/${workflowId}`, 'PUT', workflowData);
    console.log('Updated n8n workflow:', workflowId);
    return result;
  }

  async activateWorkflow(workflowId) {
    console.log('Activating n8n workflow:', workflowId);
    return this.makeRequest(`/workflows/${workflowId}/activate`, 'POST');
  }

  async deactivateWorkflow(workflowId) {
    console.log('Deactivating n8n workflow:', workflowId);
    return this.makeRequest(`/workflows/${workflowId}/deactivate`, 'POST');
  }

  async deleteWorkflow(workflowId) {
    console.log('Deleting n8n workflow:', workflowId);
    return this.makeRequest(`/workflows/${workflowId}`, 'DELETE');
  }

  async getWorkflow(workflowId) {
    return this.makeRequest(`/workflows/${workflowId}`);
  }

  async testConnection() {
    return this.makeRequest('/workflows?limit=1');
  }
}

module.exports = new N8nService();
