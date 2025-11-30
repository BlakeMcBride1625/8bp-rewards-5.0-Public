import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { authenticateAdmin } from '../middleware/auth';
import WebSocketService from '../services/WebSocketService';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Apply admin authentication to all routes
router.use(authenticateAdmin);

// Get all tickets with filters
router.get('/', async (req, res): Promise<void> => {
  try {
    const { status, type } = req.query;
    const client = await dbService.getClient();

    try {
      let query = `
        SELECT id, ticket_number, ticket_type, discord_id, status, category, subject, 
               created_at, updated_at, closed_at, closed_by, close_reason, metadata
        FROM support_tickets
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (status && status !== 'all') {
        query += ` AND status = $${paramCount}`;
        params.push(status);
        paramCount++;
      }

      if (type && type !== 'all') {
        query += ` AND ticket_type = $${paramCount}`;
        params.push(type);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await client.query(query, params);

      res.json({
        success: true,
        tickets: result.rows.map((row: any) => ({
          id: row.id,
          ticket_number: row.ticket_number,
          ticket_type: row.ticket_type,
          discord_id: row.discord_id,
          status: row.status,
          category: row.category,
          subject: row.subject,
          created_at: row.created_at,
          updated_at: row.updated_at,
          closed_at: row.closed_at,
          closed_by: row.closed_by,
          close_reason: row.close_reason,
          metadata: row.metadata
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch tickets', {
      action: 'get_tickets_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tickets'
    });
  }
});

// Get ticket details
router.get('/:ticketId', async (req, res): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const client = await dbService.getClient();

    try {
      const ticketResult = await client.query(
        `SELECT id, ticket_number, ticket_type, discord_id, status, category, subject, 
                created_at, updated_at, closed_at, closed_by, close_reason, metadata
         FROM support_tickets
         WHERE id = $1`,
        [ticketId]
      );

      if (ticketResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
        return;
      }

      const ticket = ticketResult.rows[0];

      // Get attachments
      const attachmentsResult = await client.query(
        `SELECT id, file_name, file_path, file_size, mime_type, created_at
         FROM ticket_attachments
         WHERE ticket_id = $1
         ORDER BY created_at ASC`,
        [ticketId]
      );

      res.json({
        success: true,
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          ticket_type: ticket.ticket_type,
          discord_id: ticket.discord_id,
          status: ticket.status,
          category: ticket.category,
          subject: ticket.subject,
          created_at: ticket.created_at,
          updated_at: ticket.updated_at,
          closed_at: ticket.closed_at,
          closed_by: ticket.closed_by,
          close_reason: ticket.close_reason,
          metadata: ticket.metadata
        },
        attachments: attachmentsResult.rows.map((row: any) => ({
          id: row.id,
          file_name: row.file_name,
          file_size: row.file_size,
          mime_type: row.mime_type,
          created_at: row.created_at
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch ticket details', {
      action: 'get_ticket_details_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket details'
    });
  }
});

// Get messages for a ticket
router.get('/:ticketId/messages', async (req, res): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const client = await dbService.getClient();

    try {
      const result = await client.query(
        `SELECT id, sender_type, sender_discord_id, message, created_at
         FROM ticket_messages
         WHERE ticket_id = $1
         ORDER BY created_at ASC`,
        [ticketId]
      );

      res.json({
        success: true,
        messages: result.rows.map((row: any) => ({
          id: row.id,
          sender_type: row.sender_type,
          sender_discord_id: row.sender_discord_id,
          message: row.message,
          created_at: row.created_at
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch ticket messages', {
      action: 'get_ticket_messages_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket messages'
    });
  }
});

// Admin send message
router.post('/:ticketId/messages', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const adminDiscordId = user.id;
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({
        success: false,
        error: 'Message is required'
      });
      return;
    }

    const client = await dbService.getClient();
    try {
      // Verify ticket exists and is open
      const ticketCheck = await client.query(
        `SELECT id, status FROM support_tickets WHERE id = $1`,
        [ticketId]
      );

      if (ticketCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
        return;
      }

      if (ticketCheck.rows[0].status === 'closed') {
        res.status(400).json({
          success: false,
          error: 'Cannot send message to closed ticket'
        });
        return;
      }

      // Insert message
      const result = await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_discord_id, sender_type, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, sender_type, sender_discord_id, message, created_at`,
        [ticketId, adminDiscordId, 'admin', message.trim()]
      );

      // Update ticket updated_at
      await client.query(
        `UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticketId]
      );

      // Emit WebSocket event
      const messageData = result.rows[0];
      WebSocketService.emitTicketMessage(ticketId, {
        id: messageData.id,
        sender_type: messageData.sender_type,
        sender_discord_id: messageData.sender_discord_id,
        message: messageData.message,
        created_at: messageData.created_at
      });

      logger.info('Admin ticket message sent', {
        action: 'admin_send_ticket_message',
        ticketId,
        adminDiscordId
      });

      res.json({
        success: true,
        message: {
          id: result.rows[0].id,
          sender_type: result.rows[0].sender_type,
          sender_discord_id: result.rows[0].sender_discord_id,
          message: result.rows[0].message,
          created_at: result.rows[0].created_at
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to send admin message', {
      action: 'admin_send_ticket_message_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// Close ticket
router.post('/:ticketId/close', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const adminDiscordId = user.id;
    const { ticketId } = req.params;
    const { close_reason } = req.body;

    if (!close_reason || !close_reason.trim()) {
      res.status(400).json({
        success: false,
        error: 'Close reason is required'
      });
      return;
    }

    const client = await dbService.getClient();
    try {
      // Verify ticket exists and is open
      const ticketCheck = await client.query(
        `SELECT id, status FROM support_tickets WHERE id = $1`,
        [ticketId]
      );

      if (ticketCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
        return;
      }

      if (ticketCheck.rows[0].status === 'closed') {
        res.status(400).json({
          success: false,
          error: 'Ticket is already closed'
        });
        return;
      }

      // Close ticket
      await client.query(
        `UPDATE support_tickets 
         SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $1, close_reason = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [adminDiscordId, close_reason.trim(), ticketId]
      );

      // Add system message
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message)
         VALUES ($1, $2, $3)`,
        [ticketId, 'system', `Ticket closed by admin. Reason: ${close_reason.trim()}`]
      );

      logger.info('Ticket closed by admin', {
        action: 'admin_close_ticket',
        ticketId,
        adminDiscordId
      });

      res.json({
        success: true,
        message: 'Ticket closed successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to close ticket', {
      action: 'admin_close_ticket_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to close ticket'
    });
  }
});

// Delete ticket
router.delete('/:ticketId', async (req, res): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const client = await dbService.getClient();

    try {
      // Get attachments to delete files
      const attachmentsResult = await client.query(
        `SELECT file_path FROM ticket_attachments WHERE ticket_id = $1`,
        [ticketId]
      );

      // Delete files
      for (const attachment of attachmentsResult.rows) {
        const filePath = attachment.file_path;
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (fileError) {
            logger.warn('Failed to delete attachment file', {
              action: 'delete_attachment_file_error',
              filePath,
              error: fileError instanceof Error ? fileError.message : 'Unknown error'
            });
          }
        }
      }

      // Delete ticket (cascade will delete messages and attachments)
      await client.query(
        `DELETE FROM support_tickets WHERE id = $1`,
        [ticketId]
      );

      logger.info('Ticket deleted by admin', {
        action: 'admin_delete_ticket',
        ticketId
      });

      res.json({
        success: true,
        message: 'Ticket deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to delete ticket', {
      action: 'admin_delete_ticket_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete ticket'
    });
  }
});

// Download attachment
router.get('/:ticketId/attachments/:attachmentId/download', async (req, res): Promise<void> => {
  try {
    const { ticketId, attachmentId } = req.params;
    const client = await dbService.getClient();

    try {
      const result = await client.query(
        `SELECT file_path, file_name, mime_type
         FROM ticket_attachments
         WHERE id = $1 AND ticket_id = $2`,
        [attachmentId, ticketId]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Attachment not found'
        });
        return;
      }

      const attachment = result.rows[0];
      const filePath = attachment.file_path;

      if (!fs.existsSync(filePath)) {
        res.status(404).json({
          success: false,
          error: 'File not found on server'
        });
        return;
      }

      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.file_name}"`);
      res.sendFile(path.resolve(filePath));
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to download attachment', {
      action: 'download_attachment_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId,
      attachmentId: req.params.attachmentId
    });
    res.status(500).json({
      success: false,
      error: 'Failed to download attachment'
    });
  }
});

export default router;

