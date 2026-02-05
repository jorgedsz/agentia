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

  async makeRequest(endpoint, method = 'GET', body = null) {
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

    const response = await fetch(`${this.baseUrl}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `VAPI API error: ${response.status}`);
    }

    return response.json();
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
  async createAgent(config) {
    console.log('Creating agent with config:', JSON.stringify(config, null, 2));

    const modelConfig = {
      provider: config.modelProvider || 'openai',
      model: config.modelName || 'gpt-4',
      systemPrompt: config.systemPrompt || 'You are a helpful AI assistant.'
    };

    // Add tools if provided
    if (config.tools && Array.isArray(config.tools) && config.tools.length > 0) {
      modelConfig.tools = config.tools;
    }

    const agentConfig = {
      name: config.name,
      firstMessage: config.firstMessage || `Hello! I'm ${config.name}. How can I help you today?`,
      model: modelConfig,
      voice: this.buildVoiceConfig(config)
    };

    // Add background sound at assistant level if specified
    // VAPI only accepts: 'off', 'office', or a valid URL
    const validBackgroundSounds = ['off', 'office'];
    if (config.backgroundSoundUrl) {
      agentConfig.backgroundDenoiserEnabled = false;
      agentConfig.backgroundSound = config.backgroundSoundUrl;
    } else if (config.backgroundSound && validBackgroundSounds.includes(config.backgroundSound)) {
      agentConfig.backgroundSound = config.backgroundSound;
    }

    // Add server/webhook configuration
    if (config.serverUrl) {
      agentConfig.serverUrl = config.serverUrl;
      if (config.serverUrlSecret) {
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

    console.log('VAPI Create payload:', JSON.stringify(agentConfig, null, 2));
    return this.makeRequest('/assistant', 'POST', agentConfig);
  }

  buildAnalysisPlan(config) {
    const analysisPlan = {};

    // Summary plan
    if (config.summaryEnabled !== false) {
      analysisPlan.summaryPlan = { enabled: true };
      if (config.summaryPrompt) {
        analysisPlan.summaryPlan.messages = [{
          role: 'system',
          content: config.summaryPrompt
        }];
      }
    } else {
      analysisPlan.summaryPlan = { enabled: false };
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
      recordingEnabled: config.recordingEnabled !== false,
      videoRecordingEnabled: false,
      transcriptPlan: {
        enabled: config.transcriptEnabled !== false
      }
    };
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
      if (config.speed !== undefined) voiceConfig.speed = Math.min(Math.max(config.speed, 0.5), 1.2);
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
    console.log('Received config:', JSON.stringify(config, null, 2));

    const updateData = {};

    if (config.name) updateData.name = config.name;
    if (config.firstMessage) updateData.firstMessage = config.firstMessage;
    if (config.systemPrompt || config.modelProvider || config.modelName || config.tools) {
      updateData.model = {
        provider: config.modelProvider || 'openai',
        model: config.modelName || 'gpt-4',
        systemPrompt: config.systemPrompt || ''
      };

      // Add tools if provided (only if non-empty array)
      if (config.tools && Array.isArray(config.tools) && config.tools.length > 0) {
        updateData.model.tools = config.tools;
        console.log('=== TOOLS BEING SENT ===');
        console.log(JSON.stringify(config.tools, null, 2));
      } else {
        // Explicitly remove tools if empty or not provided
        updateData.model.tools = [];
      }
    }
    // Always update voice config
    updateData.voice = this.buildVoiceConfig(config);

    // Add background sound at assistant level if specified
    // VAPI only accepts: 'off', 'office', or a valid URL
    const validBackgroundSounds = ['off', 'office'];
    if (config.backgroundSoundUrl) {
      updateData.backgroundDenoiserEnabled = false;
      updateData.backgroundSound = config.backgroundSoundUrl;
    } else if (config.backgroundSound && validBackgroundSounds.includes(config.backgroundSound)) {
      updateData.backgroundSound = config.backgroundSound;
    }

    // Add server/webhook configuration
    if (config.serverUrl) {
      updateData.serverUrl = config.serverUrl;
      if (config.serverUrlSecret) {
        updateData.serverUrlSecret = config.serverUrlSecret;
      }
      if (config.serverMessages && Array.isArray(config.serverMessages)) {
        updateData.serverMessages = config.serverMessages;
      }
    } else {
      // Clear server URL if not provided
      updateData.serverUrl = null;
    }

    // Add analysis plan
    updateData.analysisPlan = this.buildAnalysisPlan(config);

    // Add artifact plan
    updateData.artifactPlan = this.buildArtifactPlan(config);

    console.log('=== FINAL VAPI PAYLOAD ===');
    console.log(JSON.stringify(updateData, null, 2));
    return this.makeRequest(`/assistant/${agentId}`, 'PATCH', updateData);
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
