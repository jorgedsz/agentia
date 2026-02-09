const axios = require('axios');
const { decrypt } = require('../utils/encryption');

/**
 * Fire-and-forget Slack webhook notification for ticket events.
 * Reads the encrypted webhook URL from PlatformSettings, decrypts it, and POSTs the payload.
 * Errors are logged but never thrown.
 */
const sendSlackNotification = async (prisma, payload) => {
  try {
    const settings = await prisma.platformSettings.findFirst();
    if (!settings?.slackWebhookUrl) return;

    const webhookUrl = decrypt(settings.slackWebhookUrl);
    if (!webhookUrl) return;

    axios.post(webhookUrl, payload).catch(err => {
      console.error('Slack webhook delivery failed:', err.message);
    });
  } catch (error) {
    console.error('Slack notification error:', error.message);
  }
};

const listTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const user = req.user;
    const where = {};

    // Filter by status if provided
    if (status && status !== 'all') {
      where.status = status;
    }

    // OWNER sees all tickets; AGENCY sees own + clients'; CLIENT sees own
    if (user.role === 'OWNER') {
      // no additional filter
    } else if (user.role === 'AGENCY') {
      const clientIds = await req.prisma.user.findMany({
        where: { agencyId: user.id },
        select: { id: true }
      });
      where.userId = { in: [user.id, ...clientIds.map(c => c.id)] };
    } else {
      where.userId = user.id;
    }

    const tickets = await req.prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { replies: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tickets);
  } catch (error) {
    console.error('Error listing tickets:', error);
    res.status(500).json({ error: 'Failed to list tickets' });
  }
};

const getTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const ticket = await req.prisma.supportTicket.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Verify access
    if (user.role !== 'OWNER') {
      if (user.role === 'AGENCY') {
        const clientIds = await req.prisma.user.findMany({
          where: { agencyId: user.id },
          select: { id: true }
        });
        const allowedIds = [user.id, ...clientIds.map(c => c.id)];
        if (!allowedIds.includes(ticket.userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (ticket.userId !== user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(ticket);
  } catch (error) {
    console.error('Error getting ticket:', error);
    res.status(500).json({ error: 'Failed to get ticket' });
  }
};

const createTicket = async (req, res) => {
  try {
    const { title, description, priority, category } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const ticket = await req.prisma.supportTicket.create({
      data: {
        title,
        description,
        priority: priority || 'medium',
        category: category || 'general',
        userId: req.user.id
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { replies: true } }
      }
    });

    sendSlackNotification(req.prisma, {
      text: `🎫 New ticket #${ticket.id}: *${ticket.title}*`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎫 *New Support Ticket #${ticket.id}*\n*Title:* ${ticket.title}\n*Priority:* ${ticket.priority}\n*Category:* ${ticket.category}\n*Created by:* ${ticket.user.name || ticket.user.email}`
          }
        }
      ]
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
};

const updateTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, category } = req.body;

    const ticket = await req.prisma.supportTicket.findUnique({
      where: { id: parseInt(id) }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Only ticket owner can edit
    if (ticket.userId !== req.user.id) {
      return res.status(403).json({ error: 'Only the ticket creator can edit this ticket' });
    }

    const updated = await req.prisma.supportTicket.update({
      where: { id: parseInt(id) },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(priority && { priority }),
        ...(category && { category })
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        _count: { select: { replies: true } }
      }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = req.user;

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const ticket = await req.prisma.supportTicket.findUnique({
      where: { id: parseInt(id) }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // OWNER can update any. Others can only close their own.
    if (user.role !== 'OWNER') {
      if (ticket.userId !== user.id || status !== 'closed') {
        return res.status(403).json({ error: 'You can only close your own tickets' });
      }
    }

    const updated = await req.prisma.supportTicket.update({
      where: { id: parseInt(id) },
      data: { status }
    });

    sendSlackNotification(req.prisma, {
      text: `🔄 Ticket #${id} status changed to ${status}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔄 *Ticket #${id} Status Updated*\n*Title:* ${ticket.title}\n*New Status:* ${status}\n*Updated by:* ${user.name || user.email}`
          }
        }
      ]
    });

    res.json(updated);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
};

const addReply = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const user = req.user;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const ticket = await req.prisma.supportTicket.findUnique({
      where: { id: parseInt(id) }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Verify access (same logic as getTicket)
    if (user.role !== 'OWNER') {
      if (user.role === 'AGENCY') {
        const clientIds = await req.prisma.user.findMany({
          where: { agencyId: user.id },
          select: { id: true }
        });
        const allowedIds = [user.id, ...clientIds.map(c => c.id)];
        if (!allowedIds.includes(ticket.userId)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      } else if (ticket.userId !== user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const isStaff = user.role === 'OWNER';

    const reply = await req.prisma.ticketReply.create({
      data: {
        message,
        isStaff,
        userId: user.id,
        ticketId: parseInt(id)
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    });

    // Auto-set status to "in_progress" if OWNER replies to "open" ticket
    if (isStaff && ticket.status === 'open') {
      await req.prisma.supportTicket.update({
        where: { id: parseInt(id) },
        data: { status: 'in_progress' }
      });
    }

    const truncatedMsg = message.length > 200 ? message.slice(0, 200) + '...' : message;
    sendSlackNotification(req.prisma, {
      text: `💬 New reply on ticket #${id}: ${ticket.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💬 *New Reply on Ticket #${id}*\n*Title:* ${ticket.title}\n*From:* ${user.name || user.email} (${isStaff ? 'Staff' : 'User'})\n*Message:* ${truncatedMsg}`
          }
        }
      ]
    });

    res.status(201).json(reply);
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
};

const deleteTicket = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can delete tickets' });
    }

    await req.prisma.supportTicket.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Ticket deleted' });
  } catch (error) {
    console.error('Error deleting ticket:', error);
    res.status(500).json({ error: 'Failed to delete ticket' });
  }
};

module.exports = {
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  updateStatus,
  addReply,
  deleteTicket
};
