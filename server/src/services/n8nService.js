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
   * @param {Object} chatbot
   * @param {Array} n8nCredentials - credentials list from n8n API
   */
  buildWorkflowTemplate(chatbot, n8nCredentials = []) {
    const config = typeof chatbot.config === 'string' ? JSON.parse(chatbot.config || '{}') : (chatbot.config || {});
    const workflowName = `Chatbot: ${chatbot.name} (ID: ${chatbot.id})`;
    const outputUrl = chatbot.outputUrl || config.outputUrl || '';

    const nodes = [];
    const connections = {};

    // 1. Production Webhook Trigger
    const webhookNode = {
      id: 'webhook-trigger',
      name: 'Webhook Trigger',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 300],
      parameters: {
        path: `chatbot-${chatbot.id}`,
        httpMethod: 'POST',
        responseMode: 'responseNode',
        options: {}
      },
      webhookId: `chatbot-${chatbot.id}`
    };
    nodes.push(webhookNode);

    // 2. Test Webhook Trigger (always responds with result)
    const testWebhookNode = {
      id: 'test-webhook',
      name: 'Test Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [250, 500],
      parameters: {
        path: `chatbot-${chatbot.id}-test`,
        httpMethod: 'POST',
        responseMode: 'responseNode',
        options: {}
      },
      webhookId: `chatbot-${chatbot.id}-test`
    };
    nodes.push(testWebhookNode);

    // 3. Resolve Variables Code node (replaces {{placeholders}} in the system prompt)
    const systemPromptText = (config.systemPrompt || 'You are a helpful assistant.').replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const resolveVarsNode = {
      id: 'resolve-variables',
      name: 'Resolve Variables',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [400, 300],
      parameters: {
        jsCode: `const systemPromptTemplate = \`${systemPromptText}\`;\nconst variables = $json.body?.variables || {};\nlet resolved = systemPromptTemplate;\nfor (const [key, value] of Object.entries(variables)) {\n  resolved = resolved.replaceAll('{{' + key + '}}', value);\n}\nreturn [{ json: { resolvedSystemPrompt: resolved, message: $json.body?.message || $json.body?.text || "", sessionId: $json.body?.sessionId || "default" } }];`
      }
    };
    nodes.push(resolveVarsNode);

    // 4. AI Agent node
    const aiAgentNode = {
      id: 'ai-agent',
      name: 'AI Chat Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 1.7,
      position: [650, 300],
      parameters: {
        promptType: 'define',
        text: '={{ $json.message }}',
        options: {
          systemMessage: '={{ $json.resolvedSystemPrompt }}'
        }
      }
    };
    nodes.push(aiAgentNode);

    // 3. LLM Model sub-node
    const llmType = this._getLLMNodeType(config.modelProvider);
    const llmCredType = this._getLLMCredentialType(config.modelProvider);
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

    // Attach credentials if available in n8n
    const matchingCred = n8nCredentials.find(c => c.type === llmCredType);
    if (matchingCred) {
      llmNode.credentials = {
        [llmCredType]: {
          id: String(matchingCred.id),
          name: matchingCred.name
        }
      };
    }

    nodes.push(llmNode);

    // 4. HTTP Request Tool sub-nodes for AI Agent
    const toolNodes = [];
    if (Array.isArray(config.tools) && config.tools.length > 0) {
      config.tools.forEach((tool, idx) => {
        const toolNodeName = `Tool: ${tool.name || `tool_${idx + 1}`}`;

        // Parse body schema - convert JSON Schema to {placeholder} format
        let bodyObj = null;
        if (tool.body) {
          bodyObj = typeof tool.body === 'string' ? (() => { try { return JSON.parse(tool.body); } catch { return null; } })() : tool.body;
        }

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
        }

        const hasBody = placeholderDefs.length > 0 || !!(tool.body);

        const toolNode = {
          id: `tool-${idx}`,
          name: toolNodeName,
          type: '@n8n/n8n-nodes-langchain.toolHttpRequest',
          typeVersion: 1.1,
          position: [300 + (idx * 200), 550],
          parameters: {
            toolDescription: tool.description || '',
            url: tool.url || '',
            method: tool.method || 'POST',
            authentication: 'none',
            sendBody: hasBody,
            optimizeResponse: true,
            responseType: 'text'
          }
        };

        if (hasBody) {
          toolNode.parameters.specifyBody = 'json';
          toolNode.parameters.jsonBody = placeholderDefs.length > 0
            ? JSON.stringify(placeholderBody)
            : (typeof tool.body === 'string' ? tool.body : JSON.stringify(tool.body || {}));
        }

        if (placeholderDefs.length > 0) {
          toolNode.parameters.placeholderDefinitions = {
            values: placeholderDefs
          };
        }

        if (tool.headers && typeof tool.headers === 'object') {
          toolNode.parameters.sendHeaders = true;
          toolNode.parameters.specifyHeaders = 'json';
          toolNode.parameters.jsonHeaders = JSON.stringify(tool.headers);
        }

        nodes.push(toolNode);
        toolNodes.push(toolNode);
      });
    }

    // 6. Memory Buffer Window sub-node for conversation context
    const memoryNode = {
      id: 'memory-buffer',
      name: 'Memory Buffer',
      type: '@n8n/n8n-nodes-langchain.memoryBufferWindow',
      typeVersion: 1.3,
      position: [650, 700],
      parameters: {
        sessionKey: 'sessionId',
        contextWindowLength: 10,
        sessionIdType: 'customKey',
        sessionId: '={{ $json.sessionId || "default" }}'
      }
    };
    nodes.push(memoryNode);

    // 7. Single Respond to Webhook node (used by both production and test triggers)
    const respondNode = {
      id: 'respond-webhook',
      name: 'Respond to Webhook',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: [900, 300],
      parameters: {
        respondWith: 'json',
        responseBody: `={{ JSON.stringify({ response: $json.output, chatbotId: ${chatbot.id} }) }}`
      }
    };
    nodes.push(respondNode);

    // 8. Optionally forward to external webhook (chained after respond node)
    if (outputUrl) {
      const httpNode = {
        id: 'http-output',
        name: 'Send to External Webhook',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [1150, 300],
        parameters: {
          url: outputUrl,
          method: 'POST',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={{ JSON.stringify({ message: $json.output, sessionId: $('Resolve Variables').first().json.sessionId || "default", chatbotId: ${chatbot.id} }) }}`
        }
      };
      nodes.push(httpNode);
    }

    // Build connections
    // Both webhooks feed into Resolve Variables
    connections['Webhook Trigger'] = {
      main: [[{ node: 'Resolve Variables', type: 'main', index: 0 }]]
    };
    connections['Test Webhook'] = {
      main: [[{ node: 'Resolve Variables', type: 'main', index: 0 }]]
    };

    // Resolve Variables -> AI Agent
    connections['Resolve Variables'] = {
      main: [[{ node: 'AI Chat Agent', type: 'main', index: 0 }]]
    };

    // AI Agent -> Respond to Webhook
    connections['AI Chat Agent'] = {
      main: [[{ node: 'Respond to Webhook', type: 'main', index: 0 }]]
    };

    // If external webhook configured, chain it after the respond node
    if (outputUrl) {
      connections['Respond to Webhook'] = {
        main: [[{ node: 'Send to External Webhook', type: 'main', index: 0 }]]
      };
    }

    // LLM connected as ai_languageModel to AI Agent
    connections['LLM Model'] = {
      ai_languageModel: [[{ node: 'AI Chat Agent', type: 'ai_languageModel', index: 0 }]]
    };

    // Tool sub-nodes connected to AI Agent via ai_tool
    toolNodes.forEach((toolNode) => {
      connections[toolNode.name] = {
        ai_tool: [[{ node: 'AI Chat Agent', type: 'ai_tool', index: 0 }]]
      };
    });

    // Memory sub-node connected to AI Agent via ai_memory
    connections['Memory Buffer'] = {
      ai_memory: [[{ node: 'AI Chat Agent', type: 'ai_memory', index: 0 }]]
    };

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

  // Map provider to n8n credential type name
  _getLLMCredentialType(provider) {
    const credMap = {
      'openai': 'openAiApi',
      'anthropic': 'anthropicApi',
      'google': 'googleGeminiApi',
      'groq': 'groqApi',
      'mistral': 'mistralCloudApi'
    };
    return credMap[provider] || credMap['openai'];
  }

  async getCredentials() {
    return this.makeRequest('/credentials');
  }

  async createWorkflow(chatbot) {
    let creds = [];
    try {
      const credsResponse = await this.getCredentials();
      creds = Array.isArray(credsResponse) ? credsResponse : (credsResponse.data || []);
    } catch { creds = []; }

    const workflowData = this.buildWorkflowTemplate(chatbot, creds);
    console.log('Creating n8n workflow:', workflowData.name);
    const result = await this.makeRequest('/workflows', 'POST', workflowData);
    console.log('Created n8n workflow ID:', result.id);
    return result;
  }

  async updateWorkflow(workflowId, chatbot) {
    let creds = [];
    try {
      const credsResponse = await this.getCredentials();
      creds = Array.isArray(credsResponse) ? credsResponse : (credsResponse.data || []);
    } catch { creds = []; }

    const workflowData = this.buildWorkflowTemplate(chatbot, creds);
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
