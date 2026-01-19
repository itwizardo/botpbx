import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { WebUserRepository, WebUser, WebUserPublic } from '../db/repositories/webUserRepository';
import { SessionRepository, WebSession } from '../db/repositories/sessionRepository';
import { dbLogger } from '../utils/logger';

export interface TokenPayload {
  userId: number;
  username: string;
  role: WebUser['role'];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult {
  user: WebUserPublic;
  tokens: AuthTokens;
}

export class AuthService {
  private jwtSecret: string;
  private accessExpiresIn: number;
  private refreshExpiresIn: number;

  constructor(
    private userRepo: WebUserRepository,
    private sessionRepo: SessionRepository
  ) {
    this.jwtSecret = process.env.JWT_SECRET || 'default-dev-secret-change-me';
    this.accessExpiresIn = this.parseExpiration(process.env.JWT_ACCESS_EXPIRES || '15m');
    this.refreshExpiresIn = this.parseExpiration(process.env.JWT_REFRESH_EXPIRES || '7d');

    if (this.jwtSecret === 'default-dev-secret-change-me' || this.jwtSecret.includes('change')) {
      dbLogger.warn('JWT_SECRET is not set or using default value - please set a secure secret in production');
    }
  }

  private parseExpiration(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const num = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return num;
      case 'm': return num * 60;
      case 'h': return num * 3600;
      case 'd': return num * 86400;
      default: return 900;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private createJwt(payload: TokenPayload): string {
    const header = {
      alg: 'HS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const jwtPayload = {
      ...payload,
      iat: now,
      exp: now + this.accessExpiresIn,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(jwtPayload)).toString('base64url');

    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }

  verifyJwt(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [headerB64, payloadB64, signature] = parts;

      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (signature !== expectedSignature) return null;

      // Decode payload
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) return null;

      return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
      };
    } catch {
      return null;
    }
  }

  async createUser(data: {
    username: string;
    password: string;
    role?: WebUser['role'];
    displayName?: string;
  }): Promise<WebUserPublic> {
    const existingUser = await this.userRepo.findByUsername(data.username);
    if (existingUser) {
      throw new Error('Username already exists');
    }

    const passwordHash = await this.hashPassword(data.password);

    const user = await this.userRepo.create({
      username: data.username,
      passwordHash,
      role: data.role,
      displayName: data.displayName,
    });

    dbLogger.info(`User created: ${user.username} with role ${user.role}`);

    const { passwordHash: _, ...publicUser } = user;
    return publicUser;
  }

  async login(username: string, password: string): Promise<LoginResult | null> {
    const user = await this.userRepo.findByUsername(username);

    if (!user || !user.enabled) {
      dbLogger.warn(`Login failed: user not found or disabled - ${username}`);
      return null;
    }

    const validPassword = await this.verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      dbLogger.warn(`Login failed: invalid password for ${username}`);
      return null;
    }

    // Update last login
    await this.userRepo.updateLastLogin(user.id);

    // Generate tokens
    const tokens = await this.createTokens(user);

    const { passwordHash: _, ...publicUser } = user;

    dbLogger.info(`User logged in: ${username}`);

    return {
      user: publicUser,
      tokens,
    };
  }

  private async createTokens(user: WebUser): Promise<AuthTokens> {
    const payload: TokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.createJwt(payload);
    const refreshToken = this.generateToken();

    // Store refresh token (hashed)
    const expiresAt = Math.floor(Date.now() / 1000) + this.refreshExpiresIn;
    await this.sessionRepo.create({
      userId: user.id,
      refreshTokenHash: this.hashToken(refreshToken),
      expiresAt,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpiresIn,
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens | null> {
    const tokenHash = this.hashToken(refreshToken);

    // Find all valid sessions and check the hash
    const now = Math.floor(Date.now() / 1000);

    // We need to find the session by iterating (since we hash the token)
    // In production, you might want a different approach

    // For simplicity, let's look at all sessions
    // This is not efficient but works for small scale
    // TODO: Add index on refresh_token_hash and query directly

    const user = await this.findUserByRefreshToken(refreshToken);
    if (!user) {
      dbLogger.warn('Refresh failed: invalid refresh token');
      return null;
    }

    // Delete old session and create new tokens
    await this.sessionRepo.deleteByUserId(user.id);

    return this.createTokens(user);
  }

  private async findUserByRefreshToken(refreshToken: string): Promise<WebUser | null> {
    const tokenHash = this.hashToken(refreshToken);
    const now = Math.floor(Date.now() / 1000);

    // Get all users and check their sessions
    const users = await this.userRepo.findAll();

    for (const publicUser of users) {
      const fullUser = await this.userRepo.findById(publicUser.id);
      if (!fullUser || !fullUser.enabled) continue;

      const sessions = await this.sessionRepo.findValidByUserId(fullUser.id);
      for (const session of sessions) {
        if (session.refreshTokenHash === tokenHash && session.expiresAt > now) {
          return fullUser;
        }
      }
    }

    return null;
  }

  async logout(userId: number): Promise<void> {
    await this.sessionRepo.deleteByUserId(userId);
    dbLogger.debug(`User ${userId} logged out - sessions cleared`);
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
    const user = await this.userRepo.findById(userId);
    if (!user) return false;

    const valid = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return false;

    const newHash = await this.hashPassword(newPassword);
    // Update password and clear mustChangePassword flag
    await this.userRepo.update(userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });

    // Invalidate all sessions
    await this.sessionRepo.deleteByUserId(userId);

    dbLogger.info(`Password changed for user ${user.username}`);
    return true;
  }

  async resetPassword(userId: number, newPassword: string): Promise<boolean> {
    const user = await this.userRepo.findById(userId);
    if (!user) return false;

    const newHash = await this.hashPassword(newPassword);
    await this.userRepo.update(userId, { passwordHash: newHash });

    // Invalidate all sessions
    await this.sessionRepo.deleteByUserId(userId);

    dbLogger.info(`Password reset for user ${user.username}`);
    return true;
  }

  async cleanupExpiredSessions(): Promise<number> {
    return this.sessionRepo.deleteExpired();
  }

  async ensureDefaultAdmin(): Promise<void> {
    const adminCount = await this.userRepo.countByRole('admin');

    if (adminCount === 0) {
      dbLogger.info('No admin users found, creating default admin');

      // Hash the default password
      const passwordHash = await this.hashPassword('admin');

      // Create admin with mustChangePassword flag set to true
      await this.userRepo.create({
        username: 'admin',
        passwordHash,
        role: 'admin',
        displayName: 'Administrator',
        mustChangePassword: true,
      });

      dbLogger.warn('Default admin created with password "admin" - user will be prompted to change on first login');
    }
  }
}
