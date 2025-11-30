import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';

const router = express.Router();
const dbService = DatabaseService.getInstance();

/**
 * Generate next ticket number for a given ticket type
 * Email: 8RET-EN-00001, 8RET-EN-00002, etc.
 * Website: 8RWT-WN-00001, 8RWT-WN-00002, etc.
 */
export async function generateTicketNumber(type: 'email' | 'website'): Promise<string> {
  const client = await dbService.getClient();
  
  try {
    // Use transaction to ensure atomic increment
    await client.query('BEGIN');
    
    // Get current number and increment
    const result = await client.query(
      `UPDATE ticket_sequences 
       SET last_number = last_number + 1 
       WHERE type = $1 
       RETURNING last_number`,
      [type]
    );
    
    if (result.rows.length === 0) {
      // Initialize if doesn't exist
      await client.query(
        'INSERT INTO ticket_sequences (type, last_number) VALUES ($1, 1)',
        [type]
      );
      await client.query('COMMIT');
      return formatTicketNumber(type, 1);
    }
    
    const newNumber = result.rows[0].last_number;
    await client.query('COMMIT');
    
    return formatTicketNumber(type, newNumber);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to generate ticket number', {
      action: 'generate_ticket_number_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      type
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Format ticket number with proper prefix and zero-padding
 */
function formatTicketNumber(type: 'email' | 'website', number: number): string {
  const prefix = type === 'email' ? '8RET-EN' : '8RWT-WN';
  return `${prefix}-${String(number).padStart(5, '0')}`;
}

export default router;



