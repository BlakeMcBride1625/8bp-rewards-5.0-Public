/**
 * Authentication and authorization type definitions
 */

import { Request } from 'express';
import { DiscordUser } from './common';

/**
 * Authenticated Express request with user data
 */
export interface AuthenticatedRequest extends Request {
  user?: DiscordUser;
}

/**
 * Admin request with user data
 */
export interface AdminRequest extends Request {
  user?: DiscordUser; // Admin routes may have authenticated user
}

/**
 * Session data extensions
 */
export interface SessionData {
  passport?: {
    user?: DiscordUser;
  };
  mfaVerified?: boolean;
  mfaVerifiedAt?: Date;
  mfaCodes?: {
    discord: string;
    telegram: string;
    email: string;
    generatedAt: number;
  };
}

