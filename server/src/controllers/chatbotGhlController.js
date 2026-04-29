const { findGhlConnection, ghlRequest } = require('./ghlController');

/**
 * POST /api/chatbot-ghl/create-note?userId=X
 * Body: { contactId, body }
 * Creates a note on a GHL contact.
 */
async function createNote(req, res) {
  try {
    const { userId } = req.query;
    const { body } = req.body || {};
    const contactId = req.query.contactId || req.body?.contactId;

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!contactId) {
      return res.json({ success: false, message: 'Missing required parameter: contactId' });
    }
    if (!body) {
      return res.json({ success: false, message: 'Missing required parameter: body (note content)' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    await ghlRequest(`/contacts/${contactId}/notes`, conn.token, {
      method: 'POST',
      body: JSON.stringify({ body })
    });

    return res.json({ success: true, message: `Note created on contact ${contactId}.` });
  } catch (error) {
    console.error('[Chatbot GHL] createNote error:', error);
    return res.json({ success: false, message: `Error creating note: ${error.message}` });
  }
}

/**
 * POST /api/chatbot-ghl/create-opportunity?userId=X
 * Body: { contactId, pipelineId, stageId, name, status? }
 * Creates a new opportunity in a GHL pipeline.
 */
async function createOpportunity(req, res) {
  try {
    const { userId } = req.query;
    const { pipelineId, stageId, name, status } = req.body || {};
    const contactId = req.query.contactId || req.body?.contactId;

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!contactId || !pipelineId || !stageId || !name) {
      return res.json({ success: false, message: 'Missing required parameters: contactId, pipelineId, stageId, and name are all required.' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    const result = await ghlRequest('/opportunities/', conn.token, {
      method: 'POST',
      body: JSON.stringify({
        locationId: conn.locationId,
        pipelineId,
        pipelineStageId: stageId,
        contactId,
        name,
        status: status || 'open'
      })
    });

    const oppId = result.opportunity?.id || result.id || '';
    return res.json({ success: true, message: `Opportunity "${name}" created successfully.${oppId ? ` ID: ${oppId}` : ''}` });
  } catch (error) {
    console.error('[Chatbot GHL] createOpportunity error:', error);
    return res.json({ success: false, message: `Error creating opportunity: ${error.message}` });
  }
}

/**
 * POST /api/chatbot-ghl/update-opportunity?userId=X
 * Body: { opportunityId, stageId?, status?, assignedTo?, name? }
 * Updates an existing GHL opportunity.
 */
async function updateOpportunity(req, res) {
  try {
    const { userId } = req.query;
    const { opportunityId, stageId, status, assignedTo, name } = req.body || {};

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!opportunityId) {
      return res.json({ success: false, message: 'Missing required parameter: opportunityId' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    const updates = {};
    if (stageId) updates.pipelineStageId = stageId;
    if (status) updates.status = status;
    if (assignedTo) updates.assignedTo = assignedTo;
    if (name) updates.name = name;

    if (Object.keys(updates).length === 0) {
      return res.json({ success: false, message: 'No fields to update. Provide at least one of: stageId, status, assignedTo, name.' });
    }

    await ghlRequest(`/opportunities/${opportunityId}`, conn.token, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });

    return res.json({ success: true, message: `Opportunity ${opportunityId} updated successfully.` });
  } catch (error) {
    console.error('[Chatbot GHL] updateOpportunity error:', error);
    return res.json({ success: false, message: `Error updating opportunity: ${error.message}` });
  }
}

/**
 * Resolve a list of {id, value} custom field writes from a config spec + AI body.
 *
 * `spec` shape (passed through query param as URL-encoded JSON):
 *   [{ id, mode: 'static'|'ai', value?, bodyKey? }, ...]
 *
 * Static entries take their value directly from the spec. AI entries take their
 * value from `body[bodyKey]` (which the AI is told to fill via the tool schema).
 * Empty / undefined values are dropped.
 */
function resolveCustomFields(specRaw, aiBody) {
  if (!specRaw) return [];
  let spec;
  try {
    spec = typeof specRaw === 'string' ? JSON.parse(specRaw) : specRaw;
  } catch {
    return [];
  }
  if (!Array.isArray(spec)) return [];
  return spec.flatMap((entry) => {
    if (!entry?.id) return [];
    let value;
    if (entry.mode === 'ai') {
      if (!entry.bodyKey) return [];
      value = aiBody?.[entry.bodyKey];
    } else {
      value = entry.value;
    }
    if (value === undefined || value === null || value === '') return [];
    return [{ id: entry.id, value }];
  });
}

/**
 * POST /api/chatbot-ghl/upsert-opportunity?userId=X
 *   Optional query: contactCf=<json>, oppCf=<json>  (custom field specs)
 * Body: { contactId, pipelineId, stageId, name, status?, note?,
 *         <ai bodyKey>: <value>, ... }
 * Searches for an existing opportunity for this contact in the pipeline.
 * If found → updates its stage/status. If not → creates a new one.
 * After upsert, optionally writes contact + opportunity custom fields and a note.
 */
async function upsertOpportunity(req, res) {
  try {
    const { userId } = req.query;
    const aiBody = req.body || {};
    const { pipelineId, stageId, name, status, note } = aiBody;
    const contactId = req.query.contactId || aiBody.contactId;

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!contactId || !pipelineId || !stageId || !name) {
      return res.json({ success: false, message: 'Missing required parameters: contactId, pipelineId, stageId, and name are all required.' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    const contactFields = resolveCustomFields(req.query.contactCf, aiBody);
    const oppFields = resolveCustomFields(req.query.oppCf, aiBody);

    // Search for existing opportunities for this contact
    let existing = null;
    try {
      const searchResult = await ghlRequest(
        `/opportunities/search?location_id=${conn.locationId}&contact_id=${contactId}&pipeline_id=${pipelineId}`,
        conn.token
      );
      const opps = searchResult.opportunities || [];
      if (opps.length > 0) {
        existing = opps[0];
      }
    } catch (_) {
      // Search failed — fall through to create
    }

    let oppMessage;
    let oppId;
    if (existing) {
      // Update the existing opportunity (custom fields included in same request)
      const updates = { pipelineStageId: stageId };
      if (status) updates.status = status;
      if (name) updates.name = name;
      if (oppFields.length) updates.customFields = oppFields;

      await ghlRequest(`/opportunities/${existing.id}`, conn.token, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });

      oppId = existing.id;
      oppMessage = `Opportunity "${existing.name || name}" updated (moved to new stage). ID: ${existing.id}`;
    } else {
      // Create a new opportunity (custom fields included in create payload when supported)
      const createBody = {
        locationId: conn.locationId,
        pipelineId,
        pipelineStageId: stageId,
        contactId,
        name,
        status: status || 'open'
      };
      if (oppFields.length) createBody.customFields = oppFields;

      const result = await ghlRequest('/opportunities/', conn.token, {
        method: 'POST',
        body: JSON.stringify(createBody)
      });

      oppId = result.opportunity?.id || result.id || '';
      oppMessage = `Opportunity "${name}" created successfully.${oppId ? ` ID: ${oppId}` : ''}`;
    }

    const messages = [oppMessage];

    // Write contact custom fields if any.
    if (contactFields.length) {
      try {
        await ghlRequest(`/contacts/${contactId}`, conn.token, {
          method: 'PUT',
          body: JSON.stringify({ customFields: contactFields })
        });
        messages.push(`Updated ${contactFields.length} contact custom field${contactFields.length > 1 ? 's' : ''}.`);
      } catch (cfErr) {
        messages.push(`Contact custom field update failed: ${cfErr.message}`);
      }
    }

    if (oppFields.length) {
      messages.push(`Sent ${oppFields.length} opportunity custom field${oppFields.length > 1 ? 's' : ''}.`);
    }

    // Create a note on the contact if provided
    if (note) {
      try {
        await ghlRequest(`/contacts/${contactId}/notes`, conn.token, {
          method: 'POST',
          body: JSON.stringify({ body: note })
        });
        messages.push('Note added to contact.');
      } catch (noteErr) {
        messages.push(`Note failed: ${noteErr.message}`);
      }
    }

    return res.json({ success: true, message: messages.join(' ') });
  } catch (error) {
    console.error('[Chatbot GHL] upsertOpportunity error:', error);
    return res.json({ success: false, message: `Error managing opportunity: ${error.message}` });
  }
}

/**
 * POST /api/chatbot-ghl/add-tags?userId=X
 * Body: { contactId, tags }  (tags = array of strings)
 * Adds tags to a GHL contact (merges with existing).
 */
async function addTags(req, res) {
  try {
    const { userId } = req.query;
    const { tags } = req.body || {};
    const contactId = req.query.contactId || req.body?.contactId;

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!contactId) {
      return res.json({ success: false, message: 'Missing required parameter: contactId' });
    }
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return res.json({ success: false, message: 'Missing required parameter: tags (array of strings)' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    // Get current contact to read existing tags
    const contactData = await ghlRequest(`/contacts/${contactId}`, conn.token);
    const existingTags = contactData.contact?.tags || contactData.tags || [];

    // Merge new tags with existing (deduplicate)
    const merged = [...new Set([...existingTags, ...tags])];

    await ghlRequest(`/contacts/${contactId}`, conn.token, {
      method: 'PUT',
      body: JSON.stringify({ tags: merged })
    });

    const newlyAdded = tags.filter(t => !existingTags.includes(t));
    return res.json({ success: true, message: `Tags updated. Added: ${newlyAdded.length > 0 ? newlyAdded.join(', ') : '(all already existed)'}. Total tags: ${merged.length}.` });
  } catch (error) {
    console.error('[Chatbot GHL] addTags error:', error);
    return res.json({ success: false, message: `Error adding tags: ${error.message}` });
  }
}

/**
 * POST /api/chatbot-ghl/add-to-workflow?userId=X
 * Body: { contactId, workflowId }
 * Adds a contact to a GHL workflow.
 */
async function addToWorkflow(req, res) {
  try {
    const { userId } = req.query;
    const { workflowId } = req.body || {};
    const contactId = req.query.contactId || req.body?.contactId;

    if (!userId) {
      return res.json({ success: false, message: 'Missing required query param: userId' });
    }
    if (!contactId) {
      return res.json({ success: false, message: 'Missing required parameter: contactId' });
    }
    if (!workflowId) {
      return res.json({ success: false, message: 'Missing required parameter: workflowId' });
    }

    const conn = await findGhlConnection(parseInt(userId), req.prisma);
    if (!conn) {
      return res.json({ success: false, message: 'GoHighLevel is not connected for this user.' });
    }

    await ghlRequest(`/contacts/${contactId}/workflow/${workflowId}`, conn.token, {
      method: 'POST'
    });

    return res.json({ success: true, message: `Contact ${contactId} added to workflow ${workflowId}.` });
  } catch (error) {
    console.error('[Chatbot GHL] addToWorkflow error:', error);
    return res.json({ success: false, message: `Error adding to workflow: ${error.message}` });
  }
}

module.exports = {
  createNote,
  createOpportunity,
  updateOpportunity,
  upsertOpportunity,
  addTags,
  addToWorkflow
};
