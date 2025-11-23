import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// PostgreSQL connection pool
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || '8bp_rewards',
      user: process.env.POSTGRES_USER || '8bp_user',
      password: process.env.POSTGRES_PASSWORD,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

export interface RegistrationData {
  id?: string;
  eightBallPoolId: string;
  username: string;
  email?: string;
  discordId?: string;
  account_level?: number;
  account_rank?: string;
  verified_at?: Date;
  registrationIp?: string;
  deviceId?: string;
  deviceType?: string;
  userAgent?: string;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  isActive?: boolean;
  metadata?: any;
}

export class PostgresRegistration {
  public id?: string;
  public eightBallPoolId: string;
  public username: string;
  public email?: string;
  public discordId?: string;
  public account_level?: number;
  public account_rank?: string;
  public verified_at?: Date;
  public registrationIp?: string;
  public deviceId?: string;
  public deviceType?: string;
  public userAgent?: string;
  public lastLoginAt?: Date;
  public createdAt?: Date;
  public updatedAt?: Date;
  public isActive?: boolean;
  public metadata?: any;

  constructor(data: RegistrationData) {
    this.id = data.id;
    this.eightBallPoolId = data.eightBallPoolId;
    this.username = data.username;
    this.email = data.email;
    this.discordId = data.discordId;
    this.account_level = data.account_level;
    this.account_rank = data.account_rank;
    this.verified_at = data.verified_at;
    this.registrationIp = data.registrationIp;
    this.deviceId = data.deviceId;
    this.deviceType = data.deviceType;
    this.userAgent = data.userAgent;
    this.lastLoginAt = data.lastLoginAt;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.isActive = data.isActive ?? true;
    this.metadata = data.metadata || {};
  }

  static async find(query: any = {}): Promise<PostgresRegistration[]> {
    const pool = getPool();
    let sql = 'SELECT * FROM registrations WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (query.eightBallPoolId) {
      sql += ` AND eight_ball_pool_id = $${++paramCount}`;
      values.push(query.eightBallPoolId);
    }

    if (query.username) {
      sql += ` AND username = $${++paramCount}`;
      values.push(query.username);
    }

    if (query.discordId) {
      sql += ` AND discord_id = $${++paramCount}`;
      values.push(query.discordId);
    }

    if (query.isActive !== undefined) {
      sql += ` AND is_active = $${++paramCount}`;
      values.push(query.isActive);
    }

    sql += ' ORDER BY created_at DESC';

    const result = await pool.query(sql, values);
    return result.rows.map(row => new PostgresRegistration({
      id: row.id,
      eightBallPoolId: row.eight_ball_pool_id,
      username: row.username,
      email: row.email,
      discordId: row.discord_id,
      account_level: row.account_level,
      account_rank: row.account_rank,
      verified_at: row.verified_at,
      registrationIp: row.registration_ip,
      deviceId: row.device_id,
      deviceType: row.device_type,
      userAgent: row.user_agent,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: row.is_active,
      metadata: row.metadata
    }));
  }

  static async findOne(query: any): Promise<PostgresRegistration | null> {
    const registrations = await this.find(query);
    return registrations.length > 0 ? registrations[0] : null;
  }

  static async findById(id: string): Promise<PostgresRegistration | null> {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM registrations WHERE id = $1', [id]);
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return new PostgresRegistration({
      id: row.id,
      eightBallPoolId: row.eight_ball_pool_id,
      username: row.username,
      email: row.email,
      discordId: row.discord_id,
      account_level: row.account_level,
      account_rank: row.account_rank,
      verified_at: row.verified_at,
      registrationIp: row.registration_ip,
      deviceId: row.device_id,
      deviceType: row.device_type,
      userAgent: row.user_agent,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: row.is_active,
      metadata: row.metadata
    });
  }

  async save(): Promise<PostgresRegistration> {
    const pool = getPool();
    
    if (this.id) {
      // Update existing - this preserves all existing values from the object
      // Since the object was loaded from DB with all fields, only updated fields change
      const sql = `
        UPDATE registrations 
        SET username = $2, email = $3, discord_id = $4, account_level = $5, account_rank = $6, 
            verified_at = $7, registration_ip = $8, device_id = $9, device_type = $10, 
            user_agent = $11, last_login_at = $12, updated_at = CURRENT_TIMESTAMP, 
            is_active = $13, metadata = $14
        WHERE id = $1
        RETURNING *
      `;
      const values = [
        this.id, this.username, this.email, this.discordId, this.account_level, 
        this.account_rank, this.verified_at, this.registrationIp, this.deviceId, 
        this.deviceType, this.userAgent, this.lastLoginAt, this.isActive, 
        this.metadata ? JSON.stringify(this.metadata) : null
      ];
      
      const result = await pool.query(sql, values);
      const row = result.rows[0];
      
      this.updatedAt = row.updated_at;
      return this;
    } else {
      // Create new
      const sql = `
        INSERT INTO registrations (id, eight_ball_pool_id, username, email, discord_id, account_level, 
                                 account_rank, verified_at, registration_ip, device_id, device_type, 
                                 user_agent, last_login_at, created_at, updated_at, is_active, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $14, $15)
        RETURNING *
      `;
      const values = [
        uuidv4(), this.eightBallPoolId, this.username, this.email, this.discordId,
        this.account_level, this.account_rank, this.verified_at, this.registrationIp,
        this.deviceId, this.deviceType, this.userAgent, this.lastLoginAt, 
        this.isActive, JSON.stringify(this.metadata)
      ];
      
      const result = await pool.query(sql, values);
      const row = result.rows[0];
      
      this.id = row.id;
      this.createdAt = row.created_at;
      this.updatedAt = row.updated_at;
      this.registrationIp = row.registration_ip;
      this.deviceId = row.device_id;
      this.deviceType = row.device_type;
      this.userAgent = row.user_agent;
      this.lastLoginAt = row.last_login_at;
      return this;
    }
  }

  async delete(): Promise<void> {
    if (!this.id) return;
    
    const pool = getPool();
    await pool.query('DELETE FROM registrations WHERE id = $1', [this.id]);
  }

  toObject(): any {
    return {
      id: this.id,
      eightBallPoolId: this.eightBallPoolId,
      username: this.username,
      email: this.email,
      discordId: this.discordId,
      account_level: this.account_level,
      account_rank: this.account_rank,
      verified_at: this.verified_at,
      registrationIp: this.registrationIp,
      deviceId: this.deviceId,
      deviceType: this.deviceType,
      userAgent: this.userAgent,
      lastLoginAt: this.lastLoginAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      metadata: this.metadata
    };
  }
}

export interface ClaimRecordData {
  id?: string;
  eightBallPoolId: string;
  websiteUserId?: string;
  status: 'success' | 'failed';
  itemsClaimed?: string[];
  error?: string;
  claimedAt?: Date;
  metadata?: any;
}

export class PostgresClaimRecord {
  public id?: string;
  public eightBallPoolId: string;
  public websiteUserId?: string;
  public status: 'success' | 'failed';
  public itemsClaimed?: string[];
  public error?: string;
  public claimedAt?: Date;
  public metadata?: any;

  constructor(data: ClaimRecordData) {
    this.id = data.id;
    this.eightBallPoolId = data.eightBallPoolId;
    this.websiteUserId = data.websiteUserId;
    this.status = data.status;
    this.itemsClaimed = data.itemsClaimed || [];
    this.error = data.error;
    this.claimedAt = data.claimedAt;
    this.metadata = data.metadata || {};
  }

  static async find(query: any = {}): Promise<PostgresClaimRecord[]> {
    const pool = getPool();
    let sql = 'SELECT * FROM claim_records WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (query.id) {
      sql += ` AND id = $${++paramCount}`;
      values.push(query.id);
    }

    if (query.eightBallPoolId) {
      sql += ` AND eight_ball_pool_id = $${++paramCount}`;
      values.push(query.eightBallPoolId);
    }

    if (query.status) {
      sql += ` AND status = $${++paramCount}`;
      values.push(query.status);
    }

    if (query.websiteUserId) {
      sql += ` AND website_user_id = $${++paramCount}`;
      values.push(query.websiteUserId);
    }

    // Handle date range queries (MongoDB-style $gte, $lte)
    if (query.claimedAt) {
      if (query.claimedAt.$gte) {
        sql += ` AND claimed_at >= $${++paramCount}`;
        values.push(query.claimedAt.$gte);
      }
      if (query.claimedAt.$lte) {
        sql += ` AND claimed_at <= $${++paramCount}`;
        values.push(query.claimedAt.$lte);
      }
      if (query.claimedAt.$gt) {
        sql += ` AND claimed_at > $${++paramCount}`;
        values.push(query.claimedAt.$gt);
      }
      if (query.claimedAt.$lt) {
        sql += ` AND claimed_at < $${++paramCount}`;
        values.push(query.claimedAt.$lt);
      }
    }

    sql += ' ORDER BY claimed_at DESC';

    const result = await pool.query(sql, values);
    return result.rows.map(row => new PostgresClaimRecord({
      id: row.id,
      eightBallPoolId: row.eight_ball_pool_id,
      websiteUserId: row.website_user_id,
      status: row.status,
      itemsClaimed: row.items_claimed,
      error: row.error_message,
      claimedAt: row.claimed_at,
      metadata: row.metadata
    }));
  }

  static async findOne(query: any): Promise<PostgresClaimRecord | null> {
    const claims = await this.find(query);
    return claims.length > 0 ? claims[0] : null;
  }

  async save(): Promise<PostgresClaimRecord> {
    const pool = getPool();
    
    if (this.id) {
      // Update existing
      const sql = `
        UPDATE claim_records 
        SET eight_ball_pool_id = $2, website_user_id = $3, status = $4, 
            items_claimed = $5, error_message = $6, claimed_at = $7, metadata = $8
        WHERE id = $1
        RETURNING *
      `;
      const values = [
        this.id, this.eightBallPoolId, this.websiteUserId, this.status,
        this.itemsClaimed, this.error, this.claimedAt, JSON.stringify(this.metadata)
      ];
      
      const result = await pool.query(sql, values);
      const row = result.rows[0];
      
      this.claimedAt = row.claimed_at;
      return this;
    } else {
      // Create new
      const sql = `
        INSERT INTO claim_records (id, eight_ball_pool_id, website_user_id, status, items_claimed, error_message, claimed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      const values = [
        uuidv4(), this.eightBallPoolId, this.websiteUserId, this.status,
        this.itemsClaimed, this.error, this.claimedAt || new Date(), JSON.stringify(this.metadata)
      ];
      
      const result = await pool.query(sql, values);
      const row = result.rows[0];
      
      this.id = row.id;
      this.claimedAt = row.claimed_at;
      return this;
    }
  }

  async delete(): Promise<void> {
    if (!this.id) return;
    
    const pool = getPool();
    await pool.query('DELETE FROM claim_records WHERE id = $1', [this.id]);
  }

  toObject(): any {
    return {
      id: this.id,
      eightBallPoolId: this.eightBallPoolId,
      websiteUserId: this.websiteUserId,
      status: this.status,
      itemsClaimed: this.itemsClaimed,
      error: this.error,
      claimedAt: this.claimedAt,
      metadata: this.metadata
    };
  }

  // Static methods for analytics
  static async getClaimStats(days?: number): Promise<any[]> {
    const pool = getPool();
    
    let sql: string;
    let params: any[];
    
    if (days && days > 0) {
      // Get stats for specific number of days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      sql = `
        SELECT 
          status as _id,
          COUNT(*) as count,
          SUM(array_length(items_claimed, 1)) as totalitems
        FROM claim_records 
        WHERE claimed_at >= $1
        GROUP BY status
      `;
      params = [startDate];
    } else {
      // Get all-time stats
      sql = `
        SELECT 
          status as _id,
          COUNT(*) as count,
          SUM(array_length(items_claimed, 1)) as totalitems
        FROM claim_records 
        GROUP BY status
      `;
      params = [];
    }
    
    const result = await pool.query(sql, params);
    return result.rows.map(row => ({
      _id: row._id,
      count: parseInt(row.count),
      totalitems: parseInt(row.totalitems) || 0
    }));
  }

  static async getUserClaimTotals(eightBallPoolId: string, days: number = 7): Promise<any[]> {
    const pool = getPool();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const sql = `
      SELECT 
        eight_ball_pool_id,
        COUNT(*) as total_claims,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_claims,
        SUM(array_length(items_claimed, 1)) as total_items_claimed
      FROM claim_records 
      WHERE eight_ball_pool_id = $1 AND claimed_at >= $2
      GROUP BY eight_ball_pool_id
    `;
    
    const result = await pool.query(sql, [eightBallPoolId, startDate]);
    return result.rows;
  }

  static async deleteMany(filter: any): Promise<number> {
    const pool = getPool();
    
    let sql = 'DELETE FROM claim_records';
    const params: any[] = [];
    let paramCount = 0;
    
    if (filter && Object.keys(filter).length > 0) {
      const conditions: string[] = [];
      
      if (filter.status) {
        paramCount++;
        conditions.push(`status = $${paramCount}`);
        params.push(filter.status);
      }
      
      if (filter.eightBallPoolId) {
        paramCount++;
        conditions.push(`eight_ball_pool_id = $${paramCount}`);
        params.push(filter.eightBallPoolId);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const result = await pool.query(sql, params);
    return result.rowCount || 0;
  }
}

// Export default for compatibility
export default { PostgresRegistration, PostgresClaimRecord };
