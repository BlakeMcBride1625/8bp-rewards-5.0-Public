import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { logger } from '../services/LoggerService';
import { validateContactForm } from '../middleware/auth';
import { DatabaseService } from '../services/DatabaseService';
import { generateTicketNumber } from './tickets';
import DiscordNotificationService from '../services/DiscordNotificationService';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Ensure upload directories exist
const uploadsDir = path.join(process.cwd(), 'uploads', 'tickets', 'email');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename and add timestamp
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    cb(null, `${timestamp}-${sanitized}`);
  }
});

const fileFilter = (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allowed file types: images, PDFs, text files, ZIP/RAR
  const allowedMimes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'application/x-rar-compressed', 'application/vnd.rar'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: images, PDFs, text files, ZIP/RAR archives.`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Create email transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Send contact form email with file upload support
// Note: multer must come before validateContactForm to parse multipart/form-data
router.post('/', upload.array('attachments', 5), validateContactForm, async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const files = req.files as Express.Multer.File[] || [];
    
    // Generate ticket number
    const ticketNumber = await generateTicketNumber('email');
    
    // Create ticket in database
    const client = await dbService.getClient();
    let ticketId: string;
    
    try {
      const ticketResult = await client.query(
        `INSERT INTO support_tickets (ticket_number, ticket_type, status, subject, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          ticketNumber,
          'email',
          'open',
          subject || 'Contact Form Submission',
          JSON.stringify({ name, email })
        ]
      );
      
      ticketId = ticketResult.rows[0].id;
      
      // Create initial message
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message)
         VALUES ($1, $2, $3)`,
        [
          ticketId,
          'system',
          `Contact form submission from ${name} (${email})\n\n${message}`
        ]
      );
      
      // Save file attachments
      if (files.length > 0) {
        for (const file of files) {
          await client.query(
            `INSERT INTO ticket_attachments (ticket_id, file_name, file_path, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              ticketId,
              file.originalname,
              file.path,
              file.size,
              file.mimetype
            ]
          );
        }
      }
    } finally {
      client.release();
    }

    const transporter = createTransporter();

    // Build attachments list for email
    const attachmentsList = files.length > 0 
      ? files.map(f => `<li>${f.originalname} (${(f.size / 1024).toFixed(2)} KB)</li>`).join('')
      : '<li>No attachments</li>';
    
    // Email content
    const mailOptions = {
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      subject: `8BP Rewards - ${subject || 'Contact Form'} [${ticketNumber}]`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px;">
            8 Ball Pool Rewards - Contact Form Submission
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">Ticket Information</h3>
            <p><strong>Ticket Number:</strong> ${ticketNumber}</p>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject || 'No subject provided'}</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 20px; border: 1px solid #dee2e6; border-radius: 5px;">
            <h3 style="color: #495057; margin-top: 0;">Message</h3>
            <p style="line-height: 1.6; color: #333;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          
          ${files.length > 0 ? `
          <div style="background-color: #fff3cd; padding: 15px; border: 1px solid #ffc107; border-radius: 5px; margin: 20px 0;">
            <h3 style="color: #856404; margin-top: 0;">Attachments (${files.length})</h3>
            <ul style="color: #856404; margin: 0; padding-left: 20px;">
              ${attachmentsList}
            </ul>
            <p style="color: #856404; font-size: 12px; margin-top: 10px;">
              Files are stored on the server. Access via admin dashboard.
            </p>
          </div>
          ` : ''}
          
          <div style="margin-top: 20px; padding: 15px; background-color: #e9ecef; border-radius: 5px; font-size: 12px; color: #6c757d;">
            <p>This email was sent from the 8 Ball Pool Rewards contact form.</p>
            <p>Ticket Number: ${ticketNumber}</p>
            <p>Reply directly to this email to respond to ${name}.</p>
          </div>
        </div>
      `,
      text: `
        8 Ball Pool Rewards - Contact Form Submission
        
        Ticket Number: ${ticketNumber}
        Name: ${name}
        Email: ${email}
        Subject: ${subject || 'No subject provided'}
        Submitted: ${new Date().toLocaleString()}
        
        Message:
        ${message}
        
        ${files.length > 0 ? `\nAttachments (${files.length}):\n${files.map(f => `- ${f.originalname} (${(f.size / 1024).toFixed(2)} KB)`).join('\n')}\n` : ''}
        
        ---
        This email was sent from the 8 Ball Pool Rewards contact form.
        Ticket Number: ${ticketNumber}
        Reply directly to this email to respond to ${name}.
      `
    };

    // Send email to admin
    const info = await transporter.sendMail(mailOptions);
    
    logger.info('Contact form email sent to admin', {
      action: 'contact_form_admin_email',
      name,
      email,
      ticketNumber,
      ticketId,
      attachmentsCount: files.length,
      messageId: info.messageId
    });

    // Send confirmation email to user
    const confirmationMailOptions = {
      from: process.env.MAIL_FROM,
      to: email,
      subject: `8BP Rewards - We Received Your Message (Ticket: ${ticketNumber})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 30px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);">
                Thank You for Contacting Us!
              </h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 30px 20px; background-color: #1e293b;">
              <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Hi <strong style="color: #f97316;">${name}</strong>,
              </p>
              
              <p style="color: #cbd5e1; font-size: 15px; line-height: 1.7; margin: 0 0 25px 0;">
                We've received your message and created a support ticket for you. Our team will get back to you as soon as possible, typically within <strong style="color: #f97316;">24-48 hours</strong>.
              </p>
              
              <!-- Ticket Number Card -->
              <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 2px solid #f97316; border-radius: 10px; padding: 20px; margin: 25px 0; box-shadow: 0 4px 12px rgba(249, 115, 22, 0.15);">
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                  <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                    <span style="color: #ffffff; font-size: 20px; font-weight: bold;">#</span>
                  </div>
                  <div>
                    <p style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 4px 0; font-weight: 600;">Ticket Number</p>
                    <p style="color: #f97316; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Courier New', monospace;">${ticketNumber}</p>
                  </div>
                </div>
              </div>
              
              <!-- Subject Card -->
              <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 18px; margin: 20px 0;">
                <h3 style="color: #f97316; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; font-weight: 600;">Subject</h3>
                <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0; font-weight: 500;">${subject || 'No subject'}</p>
              </div>
              
              <!-- Message Card -->
              <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 18px; margin: 20px 0;">
                <h3 style="color: #f97316; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; font-weight: 600;">Your Message</h3>
                <p style="color: #cbd5e1; font-size: 15px; line-height: 1.7; margin: 0; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
              </div>
              
              ${files.length > 0 ? `
              <div style="background-color: #0f172a; border: 1px solid #334155; border-radius: 10px; padding: 18px; margin: 20px 0;">
                <h3 style="color: #f97316; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; font-weight: 600;">Attachments (${files.length})</h3>
                <ul style="color: #cbd5e1; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                  ${files.map(f => `<li style="color: #cbd5e1;">${f.originalname} (${(f.size / 1024).toFixed(2)} KB)</li>`).join('')}
                </ul>
              </div>
              ` : ''}
              
              <div style="background: linear-gradient(135deg, rgba(249, 115, 22, 0.1) 0%, rgba(234, 88, 12, 0.1) 100%); border-left: 4px solid #f97316; border-radius: 8px; padding: 15px; margin: 25px 0;">
                <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0;">
                  💬 <strong style="color: #f97316;">Need urgent help?</strong> You can also reach us via Discord or visit our website for more information.
                </p>
              </div>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #0f172a; border-top: 1px solid #334155; padding: 20px; text-align: center;">
              <p style="color: #64748b; font-size: 13px; margin: 0 0 10px 0;">
                <strong style="color: #f97316;">8 Ball Pool Rewards System</strong>
              </p>
              <p style="margin: 0;">
                <a href="${process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards'}" style="color: #f97316; text-decoration: none; font-size: 14px; font-weight: 500;">
                  ${process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards'}
                </a>
              </p>
              <p style="color: #475569; font-size: 11px; margin: 15px 0 0 0; line-height: 1.5;">
                Please reference your ticket number <strong style="color: #f97316;">${ticketNumber}</strong> for all future correspondence.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Thank You for Contacting Us!
        
        Hi ${name},
        
        We've received your message and will get back to you as soon as possible.
        Our team typically responds within 24-48 hours.
        
        Ticket Number: ${ticketNumber}
        
        Subject:
        ${subject || 'No subject provided'}
        
        Your Message:
        ${message}
        
        ---
        8 Ball Pool Rewards System
        Website: ${process.env.PUBLIC_URL || 'https://8ballpool.website/8bp-rewards'}
      `
    };

    await transporter.sendMail(confirmationMailOptions);
    
    logger.logEmailSent(email, mailOptions.subject, true);
    logger.info('Contact form confirmation sent to user', {
      action: 'contact_form_confirmation',
      name,
      email
    });

    // Send Discord notification
    try {
      const discordService = new DiscordNotificationService();
      await discordService.sendTicketNotification(
        ticketNumber,
        'email',
        subject || 'Contact Form Submission',
        undefined, // category
        name,
        email,
        undefined, // discordId (email tickets don't have Discord ID)
        files.length > 0
      );
    } catch (discordError) {
      logger.error('Failed to send Discord ticket notification', {
        action: 'discord_ticket_notification_error',
        error: discordError instanceof Error ? discordError.message : 'Unknown error',
        ticketNumber
      });
      // Don't fail the request if Discord notification fails
    }

    res.json({
      message: 'Thank you for your message! We will get back to you soon.',
      success: true,
      ticketNumber
    });

  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach((file: Express.Multer.File) => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    logger.logEmailSent(req.body?.email || 'unknown', 'Contact Form', false);
    logger.error('Contact form submission failed', {
      action: 'contact_form_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      name: req.body?.name,
      email: req.body?.email,
      ip: req.ip
    });

    const errorMessage = error instanceof Error && error.message.includes('Invalid file type')
      ? error.message
      : 'Failed to send message. Please try again later.';

    res.status(500).json({
      error: errorMessage,
      success: false
    });
  }
});

// Test email configuration (admin only)
router.post('/test', async (req, res) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_TO,
      subject: '8BP Rewards - Email Configuration Test',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">✅ Email Configuration Test Successful</h2>
          <p>This is a test email to verify that the email configuration is working correctly.</p>
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
        </div>
      `,
      text: `
        Email Configuration Test Successful
        
        This is a test email to verify that the email configuration is working correctly.
        
        Timestamp: ${new Date().toLocaleString()}
        Environment: ${process.env.NODE_ENV || 'development'}
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    logger.info('Email configuration test successful', {
      action: 'email_test_success',
      messageId: info.messageId
    });

    res.json({
      message: 'Email configuration test successful',
      success: true,
      messageId: info.messageId
    });

  } catch (error) {
    logger.error('Email configuration test failed', {
      action: 'email_test_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Email configuration test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      success: false
    });
  }
});

export default router;






