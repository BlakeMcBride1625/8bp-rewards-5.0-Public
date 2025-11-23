import { Pool } from 'pg';
import mongoose from 'mongoose';
import { PostgresRegistration, PostgresClaimRecord } from '../models/postgresql/Registration';
import Registration from '../models/Registration';
import { ClaimRecord } from '../backend/src/models/ClaimRecord';

export class DatabaseService {
  private static instance: DatabaseService;
  private postgresPool: Pool | null = null;
  private isPostgresMode: boolean = false;

  private constructor() {
    this.isPostgresMode = process.env.DATABASE_TYPE === 'postgresql';
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  public async connect(): Promise<void> {
    if (this.isPostgresMode) {
      await this.connectPostgreSQL();
    } else {
      await this.connectMongoDB();
    }
  }

  private async connectPostgreSQL(): Promise<void> {
    try {
      this.postgresPool = new Pool({
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

      // Test connection
      const client = await this.postgresPool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      console.error('❌ PostgreSQL connection error:', error);
      throw error;
    }
  }

  private async connectMongoDB(): Promise<void> {
    try {
      await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/8bp-rewards');
      console.log('✅ Connected to MongoDB database');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.isPostgresMode && this.postgresPool) {
      await this.postgresPool.end();
      console.log('🔌 Disconnected from PostgreSQL');
    } else {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from MongoDB');
    }
  }

  // Registration methods
  public async findRegistration(query: any): Promise<any> {
    if (this.isPostgresMode) {
      return await PostgresRegistration.findOne(query);
    } else {
      return await Registration.findOne(query);
    }
  }

  public async findRegistrations(query: any = {}): Promise<any[]> {
    if (this.isPostgresMode) {
      return await PostgresRegistration.find(query);
    } else {
      return await Registration.find(query);
    }
  }

  public async createRegistration(data: any): Promise<any> {
    if (this.isPostgresMode) {
      const registration = new PostgresRegistration(data);
      return await registration.save();
    } else {
      const registration = new Registration(data);
      return await registration.save();
    }
  }

  public async updateRegistration(id: string, data: any): Promise<any> {
    if (this.isPostgresMode) {
      const registration = await PostgresRegistration.findById(id);
      if (!registration) return null;
      
      Object.assign(registration, data);
      return await registration.save();
    } else {
      return await Registration.findByIdAndUpdate(id, data, { new: true });
    }
  }

  public async deleteRegistration(id: string): Promise<void> {
    if (this.isPostgresMode) {
      const registration = await PostgresRegistration.findById(id);
      if (registration) {
        await registration.delete();
      }
    } else {
      await Registration.findByIdAndDelete(id);
    }
  }

  // Claim Record methods
  public async findClaimRecord(query: any): Promise<any> {
    if (this.isPostgresMode) {
      return await PostgresClaimRecord.findOne(query);
    } else {
      return await ClaimRecord.findOne(query);
    }
  }

  public async findClaimRecords(query: any = {}): Promise<any[]> {
    if (this.isPostgresMode) {
      return await PostgresClaimRecord.find(query);
    } else {
      return await ClaimRecord.find(query);
    }
  }

  public async createClaimRecord(data: any): Promise<any> {
    if (this.isPostgresMode) {
      const claimRecord = new PostgresClaimRecord(data);
      return await claimRecord.save();
    } else {
      const claimRecord = new ClaimRecord(data);
      return await claimRecord.save();
    }
  }

  public async updateClaimRecord(id: string, data: any): Promise<any> {
    if (this.isPostgresMode) {
      const claimRecord = await PostgresClaimRecord.findOne({ id });
      if (!claimRecord) return null;
      
      Object.assign(claimRecord, data);
      return await claimRecord.save();
    } else {
      return await ClaimRecord.findByIdAndUpdate(id, data, { new: true });
    }
  }

  public async deleteClaimRecord(id: string): Promise<void> {
    if (this.isPostgresMode) {
      const claimRecord = await PostgresClaimRecord.findOne({ id });
      if (claimRecord) {
        await claimRecord.delete();
      }
    } else {
      await ClaimRecord.findByIdAndDelete(id);
    }
  }

  // Analytics methods
  public async getClaimStats(days: number = 7): Promise<any[]> {
    if (this.isPostgresMode) {
      return await PostgresClaimRecord.getClaimStats(days);
    } else {
      return await ClaimRecord.getClaimStats(days);
    }
  }

  public async getUserClaimTotals(eightBallPoolId: string, days: number = 7): Promise<any[]> {
    if (this.isPostgresMode) {
      return await PostgresClaimRecord.getUserClaimTotals(eightBallPoolId, days);
    } else {
      return await ClaimRecord.getUserClaimTotals(eightBallPoolId, days);
    }
  }

  // Utility methods
  public isUsingPostgreSQL(): boolean {
    return this.isPostgresMode;
  }

  public isUsingMongoDB(): boolean {
    return !this.isPostgresMode;
  }

  public getDatabaseType(): string {
    return this.isPostgresMode ? 'postgresql' : 'mongodb';
  }
}

export default DatabaseService;
