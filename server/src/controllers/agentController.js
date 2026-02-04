const vapiService = require('../services/vapiService');

const parseConfig = (config) => {
  if (!config) return null;
  try {
    return JSON.parse(config);
  } catch {
    return null;
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await req.prisma.agent.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    // Parse config JSON strings
    const agentsWithParsedConfig = agents.map(agent => ({
      ...agent,
      config: parseConfig(agent.config)
    }));

    res.json({ agents: agentsWithParsedConfig });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

const getAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent: { ...agent, config: parseConfig(agent.config) } });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
};

const createAgent = async (req, res) => {
  try {
    const { name, config } = req.body;
    console.log('Create agent request - name:', name, 'config:', JSON.stringify(config, null, 2));

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    let vapiId = null;

    // Try to create VAPI agent if service is configured
    if (process.env.VAPI_API_KEY) {
      try {
        const vapiAgent = await vapiService.createAgent({
          name,
          ...config
        });
        vapiId = vapiAgent.id;
      } catch (vapiError) {
        console.error('VAPI agent creation failed:', vapiError);
        // Continue without VAPI - agent will be created locally only
      }
    }

    const agent = await req.prisma.agent.create({
      data: {
        name,
        vapiId,
        config: config ? JSON.stringify(config) : null,
        userId: req.user.id
      }
    });

    res.status(201).json({
      message: 'Agent created successfully',
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
};

const updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, config } = req.body;
    console.log('=== UPDATE AGENT REQUEST ===');
    console.log('Agent ID:', id);
    console.log('Name:', name);
    console.log('Full req.body:', JSON.stringify(req.body, null, 2));
    console.log('Config received:', JSON.stringify(config, null, 2));

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update VAPI agent if exists
    if (existingAgent.vapiId && process.env.VAPI_API_KEY) {
      try {
        const vapiPayload = { name, ...config };
        console.log('=== CALLING VAPI ===');
        console.log('VAPI ID:', existingAgent.vapiId);
        console.log('Payload to VAPI:', JSON.stringify(vapiPayload, null, 2));
        const vapiResult = await vapiService.updateAgent(existingAgent.vapiId, vapiPayload);
        console.log('=== VAPI SUCCESS ===');
        console.log('VAPI returned voice:', JSON.stringify(vapiResult.voice, null, 2));
        console.log('VAPI returned model:', JSON.stringify(vapiResult.model, null, 2));
      } catch (vapiError) {
        console.error('=== VAPI FAILED ===');
        console.error('Error:', vapiError.message);
        console.error('Full error:', vapiError);
      }
    } else {
      console.log('=== VAPI SKIPPED ===');
      console.log('vapiId:', existingAgent.vapiId);
      console.log('apiKey exists:', !!process.env.VAPI_API_KEY);
    }

    const agent = await req.prisma.agent.update({
      where: { id: parseInt(id) },
      data: { name, config: config ? JSON.stringify(config) : null }
    });

    res.json({
      message: 'Agent updated successfully',
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete VAPI agent if exists
    if (existingAgent.vapiId && process.env.VAPI_API_KEY) {
      try {
        await vapiService.deleteAgent(existingAgent.vapiId);
      } catch (vapiError) {
        console.error('VAPI agent deletion failed:', vapiError);
      }
    }

    await req.prisma.agent.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

module.exports = {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent
};
