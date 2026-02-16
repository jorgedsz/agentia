/**
 * VAPI AI Service
 *
 * This service handles integration with VAPI AI for creating and managing AI agents.
 * To use this service, set your VAPI_API_KEY in the .env file.
 *
 * VAPI Documentation: https://docs.vapi.ai/
 */

class VapiService {
  constructor() {
    this.baseUrl = 'https://api.vapi.ai';
  }

  setApiKey(key) {
    this._apiKeyOverride = key;
  }

  getApiKey() {
    return this._apiKeyOverride || process.env.VAPI_API_KEY;
  }

  isConfigured() {
    return !!this.getApiKey();
  }

  // Get our server's public URL for VAPI webhook events
  getOurServerUrl() {
    let baseUrl = null;
    if (process.env.APP_URL) {
      baseUrl = process.env.APP_URL;
    } else if (process.env.GHL_REDIRECT_URI) {
      try {
        const url = new URL(process.env.GHL_REDIRECT_URI);
        baseUrl = url.origin;
      } catch {}
    } else if (process.env.RAILWAY_PUBLIC_DOMAIN) {
      baseUrl = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    }
    return baseUrl ? `${baseUrl}/api/vapi/events` : null;
  }

  async makeRequest(endpoint, method = 'GET', body = null, retries = 3) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('VAPI API key not configured');
    }

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);

      // Retry on rate limit (429) with exponential backoff
      if (response.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.log(`VAPI rate limited on ${method} ${endpoint}, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorMessage;
        try {
          const error = JSON.parse(errorBody);
          errorMessage = Array.isArray(error.message) ? error.message.join('; ') : (error.message || error.error || errorBody);
        } catch {
          errorMessage = errorBody || `VAPI API error: ${response.status}`;
        }
        console.error(`VAPI API error ${response.status}: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      return response.json();
    }
  }

  /**
   * Create a new VAPI AI agent
   * @param {Object} config - Agent configuration
   * @param {string} config.name - Agent name
   * @param {string} config.firstMessage - Initial greeting message
   * @param {string} config.systemPrompt - System instructions for the agent
   * @param {string} config.modelProvider - LLM provider (e.g., 'openai', 'anthropic')
   * @param {string} config.modelName - Model name (e.g., 'gpt-4', 'claude-3-5-sonnet-20241022')
   * @param {string} config.voiceProvider - Voice provider (e.g., 'vapi', '11labs')
   * @param {string} config.voiceId - Voice ID
   */
  /**
   * Create or update VAPI tools via /tool endpoint.
   * Returns array of VAPI tool IDs.
   */
  /**
   * Convert any tool format to VAPI /tool endpoint format.
   * apiRequest type uses FLAT format: url, method, name, headers, body at top level.
   * function type uses WRAPPED format: function + server objects.
   */
  formatToolForVapi(tool) {
    // endCall, transferCall, dtmf — pass through as-is
    if (tool.type !== 'apiRequest' && tool.type !== 'function') return tool;

    // Extract fields from any format (flat or wrapped)
    const name = tool.name || tool.function?.name;
    const description = tool.description || tool.function?.description || '';
    const url = tool.url || tool.server?.url;
    const method = tool.method || 'POST';
    const timeout = tool.timeoutSeconds || tool.server?.timeoutSeconds || 20;
    const body = this._wrapParameters(tool.body || tool.function?.parameters);

    // Build headers in VAPI schema format { type:'object', properties: { Key: { type:'string', value:'val' } } }
    let headers = tool.headers;
    if (!headers || !headers.properties) {
      // Convert plain key-value headers from server.headers to schema format
      if (tool.server?.headers && typeof tool.server.headers === 'object') {
        const props = {};
        Object.entries(tool.server.headers).forEach(([k, v]) => {
          props[k] = { type: 'string', value: String(v) };
        });
        headers = { type: 'object', properties: props };
      }
    }

    // apiRequest uses FLAT format for VAPI /tool endpoint
    const vapiTool = {
      type: 'apiRequest',
      method,
      url,
      name,
      description,
      body,
      timeoutSeconds: timeout
    };

    if (headers?.properties && Object.keys(headers.properties).length > 0) {
      vapiTool.headers = headers;
    }

    if (tool.messages) {
      vapiTool.messages = tool.messages;
    }

    return vapiTool;
  }

  /**
   * Ensure parameters are in proper JSON Schema format: { type: 'object', properties: {...} }
   * Handles simplified formats like { "estado": "string" } or { "estado": {...}, "municipio": {...} }
   */
  _wrapParameters(params) {
    if (!params || typeof params !== 'object') {
      return { type: 'object', properties: {} };
    }
    // Already valid JSON Schema format
    if (params.type === 'object' && params.properties && typeof params.properties === 'object') {
      // Normalize property values inside properties too
      const normalized = {};
      for (const [key, val] of Object.entries(params.properties)) {
        normalized[key] = typeof val === 'string' ? { type: val } : val;
      }
      return { type: 'object', properties: normalized, ...(params.required ? { required: params.required } : {}) };
    }
    // Properties passed directly without wrapper (e.g. { estado: "string", municipio: "string" })
    const { type, properties, required, ...rest } = params;
    const hasDirectProps = Object.keys(rest).length > 0;
    if (hasDirectProps) {
      const normalized = {};
      for (const [key, val] of Object.entries(rest)) {
        normalized[key] = typeof val === 'string' ? { type: val } : val;
      }
      return { type: 'object', properties: normalized, ...(required ? { required } : {}) };
    }
    return { type: 'object', properties: properties || {} };
  }

  async syncTools(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) return { toolIds: [], errors: [] };

    const errors = [];

    // Create all tools in parallel for speed
    const results = await Promise.allSettled(
      tools.map(tool => {
        const vapiTool = this.formatToolForVapi(tool);
        const toolName = tool.name || tool.function?.name || tool.type;
        console.log('=== Sending tool to VAPI /tool ===', toolName, JSON.stringify(vapiTool));
        return this.makeRequest('/tool', 'POST', vapiTool)
          .then(created => {
            console.log('Created VAPI tool:', created.id, '-', toolName);
            return created.id;
          });
      })
    );

    const toolIds = [];
    results.forEach((r, i) => {
      const toolName = tools[i].name || tools[i].function?.name || tools[i].type;
      if (r.status === 'fulfilled') {
        toolIds.push(r.value);
      } else {
        const errorMsg = r.reason?.message || 'Unknown error';
        const vapiTool = this.formatToolForVapi(tools[i]);
        const debugInfo = `server.url=${vapiTool.server?.url}, input.url=${tools[i].url}, input.server.url=${tools[i].server?.url}, input.type=${tools[i].type}, keys=${Object.keys(tools[i]).join(',')}`;
        console.error('Failed to create VAPI tool:', toolName, errorMsg, debugInfo);
        errors.push(`${toolName}: ${errorMsg} [DEBUG: ${debugInfo}]`);
      }
    });
    return { toolIds, errors };
  }

  /**
   * Delete old VAPI tools by IDs
   */
  async deleteTools(toolIds) {
    // Delete all old tools in parallel
    await Promise.allSettled(
      toolIds.map(id => this.makeRequest(`/tool/${id}`, 'DELETE').catch(() => {}))
    );
  }

  async createAgent(config) {
    console.log('Creating VAPI agent:', config.name, '| Tools:', config.tools?.length || 0);

    // First create tools separately via /tool endpoint
    const { toolIds, errors: toolErrors } = await this.syncTools(config.tools);
    console.log('Created tool IDs:', toolIds);
    if (toolErrors.length > 0) console.error('Tool creation errors:', toolErrors);

    const modelConfig = {
      provider: config.modelProvider || 'openai',
      model: config.modelName || 'gpt-4',
      systemPrompt: config.systemPrompt || 'You are a helpful AI assistant.'
    };

    // Reference tools by ID
    if (toolIds.length > 0) {
      modelConfig.toolIds = toolIds;
    }

    const agentConfig = {
      name: config.name,
      firstMessage: config.firstMessage || `Hello! I'm ${config.name}. How can I help you today?`,
      model: modelConfig,
      voice: this.buildVoiceConfig(config),
      transcriber: this.buildTranscriberConfig(config)
    };

    // Background sound
    const validBackgroundSounds = ['off', 'office'];
    if (config.backgroundSoundUrl) {
      agentConfig.backgroundDenoiserEnabled = false;
      agentConfig.backgroundSound = config.backgroundSoundUrl;
    } else if (config.backgroundSound && validBackgroundSounds.includes(config.backgroundSound)) {
      agentConfig.backgroundSound = config.backgroundSound;
    }

    // Always route VAPI events to our server (we forward to user's webhook)
    const ourServerUrl = this.getOurServerUrl();
    if (ourServerUrl) {
      agentConfig.server = { url: ourServerUrl, timeoutSeconds: 20 };
      agentConfig.serverUrl = ourServerUrl;
      agentConfig.serverMessages = ['end-of-call-report'];
    } else if (config.serverUrl) {
      // Fallback: if we can't determine our URL, use user's directly
      agentConfig.server = { url: config.serverUrl, timeoutSeconds: 20 };
      agentConfig.serverUrl = config.serverUrl;
      if (config.serverUrlSecret) {
        agentConfig.server.secret = config.serverUrlSecret;
        agentConfig.serverUrlSecret = config.serverUrlSecret;
      }
      if (config.serverMessages && Array.isArray(config.serverMessages)) {
        agentConfig.serverMessages = config.serverMessages;
      }
    }

    // Add analysis plan
    agentConfig.analysisPlan = this.buildAnalysisPlan(config);

    // Add artifact plan
    agentConfig.artifactPlan = this.buildArtifactPlan(config);

    // Stop Speaking Plan
    if (config.stopSpeakingEnabled) {
      agentConfig.stopSpeakingPlan = {
        numWords: config.stopSpeakingNumWords ?? 2,
        voiceSeconds: config.stopSpeakingVoiceSeconds ?? 0.2,
        backoffSeconds: config.stopSpeakingBackoffSeconds ?? 1
      };
    }

    // Start Speaking Plan
    if (config.startSpeakingEnabled) {
      agentConfig.startSpeakingPlan = {
        waitSeconds: config.startSpeakingWaitSeconds ?? 0.4
      };
      if (config.startSpeakingSmartEndpointing) {
        agentConfig.startSpeakingPlan.smartEndpointingPlan = {
          provider: config.startSpeakingSmartProvider || 'livekit'
        };
      } else {
        agentConfig.startSpeakingPlan.transcriptionEndpointingPlan = {
          onPunctuationSeconds: config.startSpeakingOnPunctuationSeconds ?? 0.1,
          onNoPunctuationSeconds: config.startSpeakingOnNoPunctuationSeconds ?? 1.5,
          onNumberSeconds: config.startSpeakingOnNumberSeconds ?? 0.5
        };
      }
    }

    // Voicemail Detection
    if (config.voicemailDetectionEnabled) {
      agentConfig.voicemailDetection = {
        provider: 'vapi',
        enabled: true
      };
    }

    // Call timeouts
    if (config.maxDurationSeconds) {
      agentConfig.maxDurationSeconds = config.maxDurationSeconds;
    }
    if (config.silenceTimeoutSeconds) {
      agentConfig.silenceTimeoutSeconds = config.silenceTimeoutSeconds;
    }

    console.log('VAPI Create payload keys:', Object.keys(agentConfig).join(', '));
    console.log('Tool IDs:', toolIds);
    return this.makeRequest('/assistant', 'POST', agentConfig);
  }

  buildAnalysisPlan(config) {
    const analysisPlan = {};

    // Summary plan - always enabled
    analysisPlan.summaryPlan = { enabled: true };
    if (config.summaryPrompt) {
      analysisPlan.summaryPlan.messages = [{
        role: 'system',
        content: config.summaryPrompt
      }];
    }

    // Success evaluation plan
    if (config.successEvaluationEnabled) {
      analysisPlan.successEvaluationPlan = { enabled: true };
      if (config.successEvaluationRubric) {
        analysisPlan.successEvaluationPlan.rubric = 'CustomRubric';
        analysisPlan.successEvaluationPlan.successEvaluationRubric = config.successEvaluationRubric;
      }
      if (config.successEvaluationPrompt) {
        analysisPlan.successEvaluationPlan.messages = [{
          role: 'system',
          content: config.successEvaluationPrompt
        }];
      }
    }

    // Structured data plan
    if (config.structuredDataEnabled) {
      analysisPlan.structuredDataPlan = { enabled: true };
      if (config.structuredDataSchema) {
        try {
          analysisPlan.structuredDataPlan.schema = JSON.parse(config.structuredDataSchema);
        } catch (e) {
          console.error('Invalid structured data schema JSON:', e.message);
        }
      }
      if (config.structuredDataPrompt) {
        analysisPlan.structuredDataPlan.messages = [{
          role: 'system',
          content: config.structuredDataPrompt
        }];
      }
    }

    return analysisPlan;
  }

  buildArtifactPlan(config) {
    return {
      recordingEnabled: true,
      videoRecordingEnabled: false,
      transcriptPlan: {
        enabled: true
      }
    };
  }

  buildTranscriberConfig(config) {
    const provider = config.transcriberProvider || 'deepgram';
    const language = config.transcriberLanguage || 'multi';

    const transcriberConfig = {
      provider,
      language
    };

    // Add provider-specific settings
    if (provider === 'deepgram') {
      transcriberConfig.model = 'nova-2'; // Default model for Deepgram
    }

    console.log('Transcriber config being sent to VAPI:', JSON.stringify(transcriberConfig, null, 2));
    return transcriberConfig;
  }

  buildVoiceConfig(config) {
    const provider = config.voiceProvider || 'vapi';

    // Handle ElevenLabs voices
    if (provider === '11labs') {
      const voiceConfig = {
        provider: '11labs',
        voiceId: config.voiceId || '21m00Tcm4TlvDq8ikWAM'
      };
      // Add 11labs specific settings
      if (config.elevenLabsModel) voiceConfig.model = config.elevenLabsModel;
      if (config.stability !== undefined) voiceConfig.stability = Math.min(Math.max(config.stability, 0), 1);
      if (config.similarityBoost !== undefined) voiceConfig.similarityBoost = Math.min(Math.max(config.similarityBoost, 0), 1);
      if (config.speed !== undefined) voiceConfig.speed = Math.min(Math.max(config.speed, 0.7), 1.2);
      if (config.style !== undefined) voiceConfig.style = Math.min(Math.max(config.style, 0), 1);
      if (config.useSpeakerBoost !== undefined) voiceConfig.useSpeakerBoost = config.useSpeakerBoost;

      console.log('Voice config being sent to VAPI:', JSON.stringify(voiceConfig, null, 2));
      return voiceConfig;
    }

    // Handle VAPI built-in voices (simple names like Lily, Elliot, etc.)
    const voiceConfig = {
      provider: 'vapi',
      voiceId: config.voiceId || 'Lily'
    };

    console.log('Voice config being sent to VAPI:', JSON.stringify(voiceConfig, null, 2));
    return voiceConfig;
  }

  /**
   * Get a VAPI agent by ID
   * @param {string} agentId - VAPI agent ID
   */
  async getAgent(agentId) {
    return this.makeRequest(`/assistant/${agentId}`);
  }

  /**
   * Update a VAPI agent
   * @param {string} agentId - VAPI agent ID
   * @param {Object} config - Updated configuration
   */
  async updateAgent(agentId, config) {
    console.log('=== vapiService.updateAgent ===');
    console.log('Agent VAPI ID:', agentId);
    console.log('Tools:', config.tools?.length || 0, 'Prompt length:', config.systemPrompt?.length || 0);

    // First, get existing assistant to find old tool IDs to clean up
    let oldToolIds = [];
    try {
      const existing = await this.getAgent(agentId);
      oldToolIds = existing.model?.toolIds || [];
    } catch (err) {
      console.log('Could not fetch existing assistant:', err.message);
    }

    // Create new tools via /tool endpoint
    const { toolIds: newToolIds, errors: toolErrors } = await this.syncTools(config.tools);
    console.log('Old tool IDs:', oldToolIds);
    console.log('New tool IDs:', newToolIds);
    if (toolErrors.length > 0) console.error('Tool creation errors:', toolErrors);

    // Build update payload with toolIds instead of inline tools
    const updateData = {
      name: config.name || undefined,
      firstMessage: config.firstMessage || undefined,
      model: {
        provider: config.modelProvider || 'openai',
        model: config.modelName || 'gpt-4',
        systemPrompt: config.systemPrompt || '',
        toolIds: newToolIds
      },
      voice: this.buildVoiceConfig(config),
      transcriber: this.buildTranscriberConfig(config),
      analysisPlan: this.buildAnalysisPlan(config),
      artifactPlan: this.buildArtifactPlan(config)
    };

    // Stop Speaking Plan
    if (config.stopSpeakingEnabled) {
      updateData.stopSpeakingPlan = {
        numWords: config.stopSpeakingNumWords ?? 2,
        voiceSeconds: config.stopSpeakingVoiceSeconds ?? 0.2,
        backoffSeconds: config.stopSpeakingBackoffSeconds ?? 1
      };
    } else {
      updateData.stopSpeakingPlan = null;
    }

    // Start Speaking Plan
    if (config.startSpeakingEnabled) {
      updateData.startSpeakingPlan = {
        waitSeconds: config.startSpeakingWaitSeconds ?? 0.4
      };
      if (config.startSpeakingSmartEndpointing) {
        updateData.startSpeakingPlan.smartEndpointingPlan = {
          provider: config.startSpeakingSmartProvider || 'livekit'
        };
      } else {
        updateData.startSpeakingPlan.transcriptionEndpointingPlan = {
          onPunctuationSeconds: config.startSpeakingOnPunctuationSeconds ?? 0.1,
          onNoPunctuationSeconds: config.startSpeakingOnNoPunctuationSeconds ?? 1.5,
          onNumberSeconds: config.startSpeakingOnNumberSeconds ?? 0.5
        };
      }
    } else {
      updateData.startSpeakingPlan = null;
    }

    // Voicemail Detection
    if (config.voicemailDetectionEnabled) {
      updateData.voicemailDetection = {
        provider: 'vapi',
        enabled: true
      };
    } else {
      updateData.voicemailDetection = null;
    }

    // Call timeouts
    if (config.maxDurationSeconds) {
      updateData.maxDurationSeconds = config.maxDurationSeconds;
    }
    if (config.silenceTimeoutSeconds) {
      updateData.silenceTimeoutSeconds = config.silenceTimeoutSeconds;
    }

    // Background sound
    const validBackgroundSounds = ['off', 'office'];
    if (config.backgroundSoundUrl) {
      updateData.backgroundDenoiserEnabled = false;
      updateData.backgroundSound = config.backgroundSoundUrl;
    } else if (config.backgroundSound && validBackgroundSounds.includes(config.backgroundSound)) {
      updateData.backgroundSound = config.backgroundSound;
    }

    // Always route VAPI events to our server (we forward to user's webhook)
    const ourServerUrl = this.getOurServerUrl();
    if (ourServerUrl) {
      updateData.server = { url: ourServerUrl, timeoutSeconds: 20 };
      updateData.serverUrl = ourServerUrl;
      updateData.serverMessages = ['end-of-call-report'];
    } else if (config.serverUrl) {
      // Fallback: if we can't determine our URL, use user's directly
      updateData.server = { url: config.serverUrl, timeoutSeconds: 20 };
      updateData.serverUrl = config.serverUrl;
      if (config.serverUrlSecret) {
        updateData.server.secret = config.serverUrlSecret;
        updateData.serverUrlSecret = config.serverUrlSecret;
      }
      if (config.serverMessages && Array.isArray(config.serverMessages)) {
        updateData.serverMessages = config.serverMessages;
      }
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) delete updateData[key];
    });

    console.log('=== VAPI PATCH payload ===');
    console.log('Keys:', Object.keys(updateData).join(', '));
    console.log('Model toolIds:', newToolIds);

    const result = await this.makeRequest(`/assistant/${agentId}`, 'PATCH', updateData);

    // Clean up old tools in background (don't block response)
    const toDelete = oldToolIds.filter(id => !newToolIds.includes(id));
    if (toDelete.length > 0) {
      console.log('Deleting old tools (background):', toDelete);
      this.deleteTools(toDelete).catch(err => console.error('Background tool cleanup error:', err.message));
    }

    // Attach tool errors to result for controller to surface
    result._toolErrors = toolErrors;
    return result;
  }

  /**
   * Delete a VAPI agent
   * @param {string} agentId - VAPI agent ID
   */
  async deleteAgent(agentId) {
    return this.makeRequest(`/assistant/${agentId}`, 'DELETE');
  }

  /**
   * List all VAPI agents
   */
  async listAgents() {
    return this.makeRequest('/assistant');
  }

  /**
   * Import a Twilio phone number to VAPI
   * @param {Object} phoneConfig - Phone number configuration
   * @param {string} phoneConfig.number - Phone number in E.164 format
   * @param {string} phoneConfig.twilioAccountSid - Twilio Account SID
   * @param {string} phoneConfig.twilioAuthToken - Twilio Auth Token
   * @param {string} [phoneConfig.name] - Optional friendly name
   * @returns {Promise<Object>} - VAPI phone number object with id
   */
  async importTwilioNumber(phoneConfig) {
    const payload = {
      provider: 'twilio',
      number: phoneConfig.number,
      twilioAccountSid: phoneConfig.twilioAccountSid,
      twilioAuthToken: phoneConfig.twilioAuthToken
    };

    if (phoneConfig.name) {
      payload.name = phoneConfig.name;
    }

    return this.makeRequest('/phone-number', 'POST', payload);
  }

  /**
   * Get a VAPI phone number by ID
   * @param {string} phoneNumberId - VAPI phone number ID
   * @returns {Promise<Object>} - Phone number details
   */
  async getPhoneNumber(phoneNumberId) {
    return this.makeRequest(`/phone-number/${phoneNumberId}`);
  }

  /**
   * Assign a phone number to an assistant (agent)
   * @param {string} phoneNumberId - VAPI phone number ID
   * @param {string} assistantId - VAPI assistant ID
   * @returns {Promise<Object>} - Updated phone number object
   */
  async assignPhoneToAssistant(phoneNumberId, assistantId) {
    return this.makeRequest(`/phone-number/${phoneNumberId}`, 'PATCH', {
      assistantId: assistantId
    });
  }

  /**
   * Unassign a phone number from any assistant
   * @param {string} phoneNumberId - VAPI phone number ID
   * @returns {Promise<Object>} - Updated phone number object
   */
  async unassignPhoneFromAssistant(phoneNumberId) {
    return this.makeRequest(`/phone-number/${phoneNumberId}`, 'PATCH', {
      assistantId: null
    });
  }

  /**
   * Delete a phone number from VAPI
   * @param {string} phoneNumberId - VAPI phone number ID
   * @returns {Promise<Object>} - Deletion result
   */
  async deletePhoneNumber(phoneNumberId) {
    return this.makeRequest(`/phone-number/${phoneNumberId}`, 'DELETE');
  }

  /**
   * List all phone numbers in VAPI
   * @returns {Promise<Array>} - Array of phone number objects
   */
  async listPhoneNumbers() {
    return this.makeRequest('/phone-number');
  }

  /**
   * Find a phone number in VAPI by its E.164 number
   * @param {string} phoneNumber - Phone number in E.164 format
   * @returns {Promise<Object|null>} - Phone number object if found, null otherwise
   */
  async findPhoneNumberByNumber(phoneNumber) {
    try {
      const phoneNumbers = await this.listPhoneNumbers();
      return phoneNumbers.find(p => p.number === phoneNumber) || null;
    } catch (err) {
      console.error('Error finding phone number:', err.message);
      return null;
    }
  }

  /**
   * Create an outbound call
   * @param {Object} callConfig - Call configuration
   * @param {string} callConfig.assistantId - VAPI assistant ID
   * @param {string} callConfig.phoneNumberId - VAPI phone number ID to call from
   * @param {Object} callConfig.customer - Customer details
   * @param {string} callConfig.customer.number - Customer phone number in E.164 format
   * @returns {Promise<Object>} - Call object with id and status
   */
  async createCall(callConfig) {
    const payload = {
      assistantId: callConfig.assistantId,
      phoneNumberId: callConfig.phoneNumberId,
      customer: {
        number: callConfig.customer.number
      }
    };

    if (callConfig.customer.name) {
      payload.customer.name = callConfig.customer.name;
    }

    if (callConfig.assistantOverrides) {
      payload.assistantOverrides = callConfig.assistantOverrides;
    }

    console.log('VAPI Call payload:', JSON.stringify(payload, null, 2));
    return this.makeRequest('/call', 'POST', payload);
  }

  /**
   * Get call details
   * @param {string} callId - VAPI call ID
   * @returns {Promise<Object>} - Call details
   */
  async getCall(callId) {
    return this.makeRequest(`/call/${callId}`);
  }

  /**
   * List recent calls
   * @param {number} limit - Max number of calls to return
   * @returns {Promise<Array>} - Array of call objects
   */
  async listCalls(limit = 100) {
    return this.makeRequest(`/call?limit=${limit}`);
  }

  /**
   * Get account info including balance/credits
   * @returns {Promise<Object>} - Account info with balance
   */
  async getAccountInfo() {
    try {
      // VAPI doesn't have a direct balance endpoint, but we can try to get org info
      // This may need adjustment based on actual VAPI API
      return this.makeRequest('/org');
    } catch (err) {
      // Fallback: try metrics or another endpoint
      return null;
    }
  }
}

module.exports = new VapiService();
