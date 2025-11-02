import { Document } from 'mongoose';

export interface IRegistration extends Document {
  eightBallPoolId: string;
  username: string;
  email?: string;
  discordId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export default class Registration extends Document implements IRegistration {
  eightBallPoolId: string;
  username: string;
  email?: string;
  discordId?: string;
  createdAt: Date;
  updatedAt: Date;

  static find(query?: any): Promise<Registration[]>;
  static findOne(query: any): Promise<Registration | null>;
  static findById(id: string): Promise<Registration | null>;
  static create(data: any): Promise<Registration>;
  static findByIdAndUpdate(id: string, data: any, options?: any): Promise<Registration | null>;
  static findByIdAndDelete(id: string): Promise<Registration | null>;
}
