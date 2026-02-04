require('dotenv').config();
const vapiService = require('./src/services/vapiService');

async function test() {
  try {
    const agentId = '1a011335-0cd8-446e-bfe3-c75321c940d6';

    console.log('Testing update with name change...');

    const result = await vapiService.updateAgent(agentId, {
      name: 'test 03/02 - UPDATED',
      systemPrompt: 'This is a test update',
      voiceProvider: '11labs',
      voiceId: 'dlGxemPxFMTY7iXagmOj',
      elevenLabsModel: 'eleven_multilingual_v2',
      stability: 0.8,
      similarityBoost: 0.9,
      speed: 1.0
    });

    console.log('Update successful!');
    console.log('Name:', result.name);
    console.log('Voice:', JSON.stringify(result.voice, null, 2));
    console.log('Model:', JSON.stringify(result.model, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
    console.error('Full error:', e);
  }
}
test();
