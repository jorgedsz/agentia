/**
 * In-memory message buffer for chatbot webhook debouncing.
 *
 * Key: `chatbotId:sessionId` (sessionId = contactId or conversationId from webhook)
 * When messages arrive rapidly, they are buffered and merged before forwarding to n8n.
 */

const MAX_BUFFER_MESSAGES = 20;
const MAX_BUFFER_AGE_MS = 60000; // 60s hard cap

// Map<bufferKey, { messages: string[], timer, ageTimer, context }>
const buffers = new Map();

/**
 * Add a message to the buffer. Resets the debounce timer.
 * If the buffer reaches MAX_BUFFER_MESSAGES, flushes immediately.
 *
 * @param {string} bufferKey - `chatbotId:sessionId`
 * @param {string} messageText - The message content
 * @param {number} bufferSeconds - Debounce delay in seconds
 * @param {object} context - Arbitrary context passed to onFlush (chatbot, body, etc.)
 * @param {function} onFlush - Called with (bufferKey, mergedMessage, context) when flushed
 * @returns {{ queued: boolean, bufferSize: number }}
 */
function addMessage(bufferKey, messageText, bufferSeconds, context, onFlush) {
  let entry = buffers.get(bufferKey);

  if (!entry) {
    entry = { messages: [], timer: null, ageTimer: null, context };
    buffers.set(bufferKey, entry);

    // Hard age cap — flush even if messages keep arriving
    entry.ageTimer = setTimeout(() => {
      flush(bufferKey, onFlush);
    }, MAX_BUFFER_AGE_MS);
  }

  entry.messages.push(messageText);
  // Always update context to latest (carries freshest body/headers)
  entry.context = context;

  // Reset debounce timer
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    flush(bufferKey, onFlush);
  }, bufferSeconds * 1000);

  const currentSize = entry.messages.length;

  // Immediate flush if cap hit
  if (currentSize >= MAX_BUFFER_MESSAGES) {
    flush(bufferKey, onFlush);
    return { queued: true, bufferSize: currentSize, flushed: true };
  }

  return { queued: true, bufferSize: currentSize };
}

/**
 * Flush a buffer: merge messages, call onFlush, clean up.
 */
function flush(bufferKey, onFlush) {
  const entry = buffers.get(bufferKey);
  if (!entry) return;

  // Clear timers
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.ageTimer) clearTimeout(entry.ageTimer);

  const mergedMessage = entry.messages.join('\n');
  const context = entry.context;

  // Remove from map before calling callback (prevents re-entry issues)
  buffers.delete(bufferKey);

  try {
    onFlush(bufferKey, mergedMessage, context);
  } catch (err) {
    console.error(`[MessageBuffer] flush error for ${bufferKey}:`, err);
  }
}

/**
 * Flush all pending buffers (for graceful shutdown).
 */
function clearAll(onFlush) {
  const keys = [...buffers.keys()];
  for (const key of keys) {
    flush(key, onFlush);
  }
}

/**
 * Get current buffer stats (for debugging).
 */
function getStats() {
  const stats = {};
  for (const [key, entry] of buffers) {
    stats[key] = { messageCount: entry.messages.length };
  }
  return stats;
}

module.exports = { addMessage, flush, clearAll, getStats };
