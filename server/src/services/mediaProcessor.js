const OpenAI = require('openai');
const axios = require('axios');

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60000 });
}

/**
 * Transcribe an audio/voice note URL using OpenAI Whisper.
 * Downloads the audio as a buffer and sends it to the API.
 * @param {string} mediaUrl - Public URL of the audio file
 * @returns {Promise<string>} - Transcription text or fallback message
 */
async function transcribeAudio(mediaUrl) {
  try {
    console.log('[MediaProcessor] Downloading audio from:', mediaUrl);
    const response = await axios.get(mediaUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'audio/ogg';
    const ext = contentType.includes('mp3') ? 'mp3'
      : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a'
      : contentType.includes('wav') ? 'wav'
      : contentType.includes('webm') ? 'webm'
      : 'ogg';

    const file = new File([buffer], `voice.${ext}`, { type: contentType });

    console.log(`[MediaProcessor] Sending audio to Whisper (${buffer.length} bytes, ${ext})`);
    const openai = getClient();
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    console.log('[MediaProcessor] Transcription complete:', transcription.text.substring(0, 100));
    return transcription.text;
  } catch (error) {
    console.error('[MediaProcessor] Audio transcription failed:', error.message);
    return '[Voice note could not be transcribed]';
  }
}

/**
 * Analyze an image URL using GPT-4o-mini vision.
 * Sends the URL directly to the vision API; falls back to base64 if URL fails.
 * @param {string} mediaUrl - Public URL of the image
 * @returns {Promise<string>} - Image description or fallback message
 */
async function analyzeImage(mediaUrl) {
  try {
    console.log('[MediaProcessor] Analyzing image:', mediaUrl);
    const openai = getClient();

    let imageContent = { type: 'image_url', image_url: { url: mediaUrl } };

    // Try URL-based first; if that fails, download and base64-encode
    try {
      const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image concisely. What does it show? If there is text in the image, transcribe it. Respond in the same language as any text visible in the image, defaulting to Spanish if no text is visible.' },
            imageContent,
          ],
        }],
        max_tokens: 500,
      });

      const description = result.choices[0].message.content;
      console.log('[MediaProcessor] Image analysis complete:', description.substring(0, 100));
      return description;
    } catch (urlError) {
      console.warn('[MediaProcessor] URL-based vision failed, trying base64 fallback:', urlError.message);

      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      const base64 = Buffer.from(response.data).toString('base64');
      const mimeType = response.headers['content-type'] || 'image/jpeg';

      imageContent = {
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64}` },
      };

      const result = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image concisely. What does it show? If there is text in the image, transcribe it. Respond in the same language as any text visible in the image, defaulting to Spanish if no text is visible.' },
            imageContent,
          ],
        }],
        max_tokens: 500,
      });

      const description = result.choices[0].message.content;
      console.log('[MediaProcessor] Image analysis (base64) complete:', description.substring(0, 100));
      return description;
    }
  } catch (error) {
    console.error('[MediaProcessor] Image analysis failed:', error.message);
    return '[Image could not be analyzed]';
  }
}

module.exports = { transcribeAudio, analyzeImage };
