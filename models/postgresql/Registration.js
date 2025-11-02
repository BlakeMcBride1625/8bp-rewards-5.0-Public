"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimRecord = exports.Registration = void 0;
exports.getPool = getPool;
const pg_1 = require("pg");
const uuid_1 = require("uuid");
let pool = null;
function getPool() {
    if (!pool) {
        pool = new pg_1.Pool({
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
class Registration {
    constructor(data) {
        this.id = data.id;
        this.eightBallPoolId = data.eightBallPoolId;
        this.username = data.username;
        this.email = data.email;
        this.discordId = data.discordId;
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        this.isActive = data.isActive ?? true;
        this.metadata = data.metadata || {};
    }
    static async find(query = {}) {
        const pool = getPool();
        let sql = 'SELECT * FROM registrations WHERE 1=1';
        const values = [];
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
        return result.rows.map(row => new Registration({
            id: row.id,
            eightBallPoolId: row.eight_ball_pool_id,
            username: row.username,
            email: row.email,
            discordId: row.discord_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: row.is_active,
            metadata: row.metadata
        }));
    }
    static async findOne(query) {
        const registrations = await this.find(query);
        return registrations.length > 0 ? registrations[0] : null;
    }
    static async findById(id) {
        const pool = getPool();
        const result = await pool.query('SELECT * FROM registrations WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return new Registration({
            id: row.id,
            eightBallPoolId: row.eight_ball_pool_id,
            username: row.username,
            email: row.email,
            discordId: row.discord_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            isActive: row.is_active,
            metadata: row.metadata
        });
    }
    async save() {
        const pool = getPool();
        if (this.id) {
            const sql = `
        UPDATE registrations 
        SET username = $2, email = $3, discord_id = $4, updated_at = CURRENT_TIMESTAMP, 
            is_active = $5, metadata = $6
        WHERE id = $1
        RETURNING *
      `;
            const values = [
                this.id, this.username, this.email, this.discordId,
                this.isActive, JSON.stringify(this.metadata)
            ];
            const result = await pool.query(sql, values);
            const row = result.rows[0];
            this.updatedAt = row.updated_at;
            return this;
        }
        else {
            const sql = `
        INSERT INTO registrations (id, eight_ball_pool_id, username, email, discord_id, created_at, updated_at, is_active, metadata)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $6, $7)
        RETURNING *
      `;
            const values = [
                uuid_1.v4(), this.eightBallPoolId, this.username, this.email,
                this.discordId, this.isActive, JSON.stringify(this.metadata)
            ];
            const result = await pool.query(sql, values);
            const row = result.rows[0];
            this.id = row.id;
            this.createdAt = row.created_at;
            this.updatedAt = row.updated_at;
            return this;
        }
    }
    async delete() {
        if (!this.id)
            return;
        const pool = getPool();
        await pool.query('DELETE FROM registrations WHERE id = $1', [this.id]);
    }
    toObject() {
        return {
            id: this.id,
            eightBallPoolId: this.eightBallPoolId,
            username: this.username,
            email: this.email,
            discordId: this.discordId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            isActive: this.isActive,
            metadata: this.metadata
        };
    }
}
exports.Registration = Registration;
class ClaimRecord {
    constructor(data) {
        this.id = data.id;
        this.eightBallPoolId = data.eightBallPoolId;
        this.websiteUserId = data.websiteUserId;
        this.status = data.status;
        this.itemsClaimed = data.itemsClaimed || [];
        this.error = data.error;
        this.claimedAt = data.claimedAt;
        this.metadata = data.metadata || {};
    }
    static async find(query = {}) {
        const pool = getPool();
        let sql = 'SELECT * FROM claim_records WHERE 1=1';
        const values = [];
        let paramCount = 0;
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
        sql += ' ORDER BY claimed_at DESC';
        const result = await pool.query(sql, values);
        return result.rows.map(row => new ClaimRecord({
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
    static async findOne(query) {
        const claims = await this.find(query);
        return claims.length > 0 ? claims[0] : null;
    }
    async save() {
        const pool = getPool();
        if (this.id) {
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
        }
        else {
            const sql = `
        INSERT INTO claim_records (id, eight_ball_pool_id, website_user_id, status, items_claimed, error_message, claimed_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
            const values = [
                uuid_1.v4(), this.eightBallPoolId, this.websiteUserId, this.status,
                this.itemsClaimed, this.error, this.claimedAt || new Date(), JSON.stringify(this.metadata)
            ];
            const result = await pool.query(sql, values);
            const row = result.rows[0];
            this.id = row.id;
            this.claimedAt = row.claimed_at;
            return this;
        }
    }
    async delete() {
        if (!this.id)
            return;
        const pool = getPool();
        await pool.query('DELETE FROM claim_records WHERE id = $1', [this.id]);
    }
    toObject() {
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
    static async getClaimStats(days = 7) {
        const pool = getPool();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const sql = `
      SELECT 
        status,
        COUNT(*) as count,
        SUM(array_length(items_claimed, 1)) as total_items
      FROM claim_records 
      WHERE claimed_at >= $1
      GROUP BY status
    `;
        const result = await pool.query(sql, [startDate]);
        return result.rows;
    }
    static async getUserClaimTotals(eightBallPoolId, days = 7) {
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
}
exports.ClaimRecord = ClaimRecord;
exports.default = { Registration, ClaimRecord };
//# sourceMappingURL=Registration.js.map