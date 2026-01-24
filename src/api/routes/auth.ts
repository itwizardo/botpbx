import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';
import { apiLogger } from '../../utils/logger';

export function registerAuthRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Login
  server.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = request.body as { username: string; password: string };

    if (!username || !password) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Username and password required' });
    }

    const result = await ctx.authService.login(username, password);

    if (!result) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    return {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
      mustChangePassword: result.user.mustChangePassword,
    };
  });

  // Refresh token
  server.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Refresh token required' });
    }

    const tokens = await ctx.authService.refresh(refreshToken);

    if (!tokens) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid refresh token' });
    }

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  });

  // Logout (requires auth)
  server.post('/logout', {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const payload = ctx.authService.verifyJwt(token);
      if (!payload) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      request.user = payload;
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    ctx.authService.logout(request.user.userId);
    return { success: true };
  });

  // Get current user (requires auth)
  server.get('/me', {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const payload = ctx.authService.verifyJwt(token);
      if (!payload) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      request.user = payload;
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = await ctx.userRepo.findById(request.user.userId);
    if (!user) {
      return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    }

    // Get user's effective permissions
    const effectivePermissions = await ctx.permissionRepo.getEffectivePermissions(
      request.user.userId,
      user.role
    );

    const { passwordHash, ...publicUser } = user;
    return {
      user: publicUser,
      permissions: Array.from(effectivePermissions),
    };
  });

  // Get user permissions (requires auth)
  server.get('/permissions', {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const payload = ctx.authService.verifyJwt(token);
      if (!payload) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      request.user = payload;
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const effectivePermissions = await ctx.permissionRepo.getEffectivePermissions(
      request.user.userId,
      request.user.role
    );

    return {
      permissions: Array.from(effectivePermissions),
    };
  });

  // Change password (requires auth)
  server.post('/change-password', {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const payload = ctx.authService.verifyJwt(token);
      if (!payload) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      request.user = payload;
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = request.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Current password and new password required',
      });
    }

    if (newPassword.length < 6) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'New password must be at least 6 characters',
      });
    }

    const success = await ctx.authService.changePassword(
      request.user.userId,
      currentPassword,
      newPassword
    );

    if (!success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Current password is incorrect',
      });
    }

    return { success: true, message: 'Password changed successfully' };
  });

  // Update profile (requires auth)
  server.put('/me/profile', {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const payload = ctx.authService.verifyJwt(token);
      if (!payload) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      request.user = payload;
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { displayName, avatarUrl } = request.body as {
      displayName?: string;
      avatarUrl?: string;
    };

    await ctx.userRepo.update(request.user.userId, {
      displayName,
      avatarUrl
    });

    const updatedUser = await ctx.userRepo.findById(request.user.userId);
    if (!updatedUser) {
      return reply.status(404).send({ error: 'Not Found' });
    }

    const { passwordHash, ...publicUser } = updatedUser;
    return { user: publicUser };
  });
}
