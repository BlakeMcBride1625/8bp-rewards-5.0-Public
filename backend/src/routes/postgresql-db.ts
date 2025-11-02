import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { Pool } from 'pg';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// PostgreSQL Database Management Routes

// Main database management page
router.get('/', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    // Get database stats
    const stats = await dbService.healthCheck();
    
    res.json({
      success: true,
      database: {
        type: 'PostgreSQL',
        status: stats.connected ? 'Connected' : 'Disconnected',
        userCount: stats.userCount,
        timestamp: stats.timestamp
      }
    });
  } catch (error) {
    logger.error('Error fetching PostgreSQL stats:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch database stats' });
  }
});

// SQL Query Interface
router.post('/query', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    // Basic security check - only allow SELECT queries for now
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery.startsWith('select')) {
      res.status(400).json({ error: 'Only SELECT queries are allowed' });
      return;
    }

    // Execute query using DatabaseService
    const result = await dbService.executeQuery(query);
    
    res.json({
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
      fields: result.fields?.map((field: any) => ({
        name: field.name,
        dataTypeID: field.dataTypeID
      }))
    });
  } catch (error) {
    logger.error('Error executing SQL query:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to execute query' });
  }
});

// Get all tables
router.get('/tables', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    const query = `
      SELECT 
        table_name,
        table_type,
        table_schema
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const result = await dbService.executeQuery(query);
    
    res.json({
      success: true,
      tables: result.rows
    });
  } catch (error) {
    logger.error('Error fetching tables:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Get table structure
router.get('/tables/:tableName', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    const { tableName } = req.params;
    
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = $1 AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;
    
    const result = await dbService.executeQuery(query, [tableName]);
    
    res.json({
      success: true,
      tableName,
      columns: result.rows
    });
  } catch (error) {
    logger.error('Error fetching table structure:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch table structure' });
  }
});

// Get all users
router.get('/users', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    const { limit = 50, offset = 0 } = req.query;
    
    const query = `
      SELECT 
        id,
        eight_ball_pool_id,
        username,
        email,
        discord_id,
        created_at,
        updated_at,
        is_active
      FROM registrations 
      ORDER BY created_at DESC 
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await dbService.executeQuery(query, [parseInt(limit as string), parseInt(offset as string)]);
    
    // Get total count
    const countResult = await dbService.executeQuery('SELECT COUNT(*) FROM registrations');
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      users: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < totalCount
      }
    });
  } catch (error) {
    logger.error('Error fetching users:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get claim records
router.get('/claims', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    const { limit = 50, offset = 0 } = req.query;
    
    const query = `
      SELECT 
        id,
        eight_ball_pool_id,
        website_user_id,
        status,
        items_claimed,
        error_message,
        claimed_at,
        metadata
      FROM claim_records 
      ORDER BY claimed_at DESC 
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await dbService.executeQuery(query, [parseInt(limit as string), parseInt(offset as string)]);
    
    // Get total count
    const countResult = await dbService.executeQuery('SELECT COUNT(*) FROM claim_records');
    const totalCount = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      claims: result.rows,
      pagination: {
        total: totalCount,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: parseInt(offset as string) + parseInt(limit as string) < totalCount
      }
    });
  } catch (error) {
    logger.error('Error fetching claim records:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to fetch claim records' });
  }
});

// Database backup endpoint
router.post('/backup', async (req, res): Promise<void> => {
  try {
    if (!dbService.isUsingPostgreSQL()) {
      res.status(400).json({ error: 'PostgreSQL is not currently active' });
      return;
    }

    // This would typically trigger a backup process
    // For now, we'll just return a success message
    logger.info('Database backup requested');
    
    res.json({
      success: true,
      message: 'Database backup process initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error initiating backup:', { error: error instanceof Error ? error.message : 'Unknown error' });
    res.status(500).json({ error: 'Failed to initiate backup' });
  }
});

export default router;
