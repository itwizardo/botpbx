import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiContext } from '../server';

interface CreateTeamBody {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  queueId?: string;
}

interface UpdateTeamBody {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  queueId?: string | null;
}

interface AddMemberBody {
  userId: number;
  role?: string;
}

// Transform backend TeamMember to frontend-expected shape:
// Frontend expects: id=userId (number), role=userRole, teamRole=membership role
function toFrontendMember(m: { userId: number; role: string; userRole?: string; joinedAt: string; username?: string; displayName?: string | null; email?: string | null; phone?: string | null; avatarUrl?: string | null; enabled?: boolean; lastLoginAt?: number | null; department?: string | null }) {
  return {
    id: m.userId,
    username: m.username || '',
    displayName: m.displayName || null,
    email: m.email || null,
    phone: m.phone || null,
    department: m.department || null,
    avatarUrl: m.avatarUrl || null,
    role: m.userRole || 'viewer',
    enabled: m.enabled ?? true,
    lastLoginAt: m.lastLoginAt || null,
    teamRole: m.role,
    joinedAt: m.joinedAt,
  };
}

export function registerTeamRoutes(server: FastifyInstance, ctx: ApiContext): void {
  // Get all teams with members
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const teams = await ctx.teamRepo.findAllWithMembers();
      const stats = await ctx.teamRepo.getStats();
      const unassignedUsers = await ctx.teamRepo.getUnassignedUsers();

      return {
        teams: teams.map(t => ({
          ...t,
          members: t.members.map(toFrontendMember),
        })),
        unassignedUsers: unassignedUsers.map(toFrontendMember),
        stats,
      };
    } catch (error) {
      request.log.error(error, 'Failed to get teams');
      return reply.status(500).send({ success: false, error: 'Failed to get teams' });
    }
  });

  // Get team stats only
  server.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await ctx.teamRepo.getStats();
      return { success: true, data: stats };
    } catch (error) {
      request.log.error(error, 'Failed to get team stats');
      return reply.status(500).send({ success: false, error: 'Failed to get stats' });
    }
  });

  // Get single team
  server.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const team = await ctx.teamRepo.findById(id);

      if (!team) {
        return reply.status(404).send({ success: false, error: 'Team not found' });
      }

      const members = await ctx.teamRepo.getMembers(id);
      return { success: true, data: { ...team, members } };
    } catch (error) {
      request.log.error(error, 'Failed to get team');
      return reply.status(500).send({ success: false, error: 'Failed to get team' });
    }
  });

  // Create team
  server.post('/', async (request: FastifyRequest<{ Body: CreateTeamBody }>, reply: FastifyReply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Admin access required' });
      }

      const { name, description, color, icon, queueId } = request.body;

      if (!name || name.trim().length === 0) {
        return reply.status(400).send({ success: false, error: 'Team name is required' });
      }

      const team = await ctx.teamRepo.create({
        name: name.trim(),
        description,
        color,
        icon,
        queueId,
      });

      return { success: true, data: team };
    } catch (error) {
      request.log.error(error, 'Failed to create team');
      return reply.status(500).send({ success: false, error: 'Failed to create team' });
    }
  });

  // Update team
  server.put('/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateTeamBody }>, reply: FastifyReply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Admin access required' });
      }

      const { id } = request.params;
      const updates = request.body;

      const team = await ctx.teamRepo.findById(id);
      if (!team) {
        return reply.status(404).send({ success: false, error: 'Team not found' });
      }

      await ctx.teamRepo.update(id, updates);
      const updatedTeam = await ctx.teamRepo.findById(id);

      return { success: true, data: updatedTeam };
    } catch (error) {
      request.log.error(error, 'Failed to update team');
      return reply.status(500).send({ success: false, error: 'Failed to update team' });
    }
  });

  // Delete team
  server.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Admin access required' });
      }

      const { id } = request.params;
      const team = await ctx.teamRepo.findById(id);

      if (!team) {
        return reply.status(404).send({ success: false, error: 'Team not found' });
      }

      await ctx.teamRepo.delete(id);
      return { success: true, message: 'Team deleted' };
    } catch (error) {
      request.log.error(error, 'Failed to delete team');
      return reply.status(500).send({ success: false, error: 'Failed to delete team' });
    }
  });

  // Get team members
  server.get('/:id/members', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;
      const team = await ctx.teamRepo.findById(id);

      if (!team) {
        return reply.status(404).send({ success: false, error: 'Team not found' });
      }

      const members = await ctx.teamRepo.getMembers(id);
      return { success: true, data: members };
    } catch (error) {
      request.log.error(error, 'Failed to get team members');
      return reply.status(500).send({ success: false, error: 'Failed to get members' });
    }
  });

  // Add member to team
  server.post('/:id/members', async (request: FastifyRequest<{ Params: { id: string }; Body: AddMemberBody }>, reply: FastifyReply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Admin access required' });
      }

      const { id } = request.params;
      const { userId, role = 'member' } = request.body;

      if (!userId) {
        return reply.status(400).send({ success: false, error: 'userId is required' });
      }

      const team = await ctx.teamRepo.findById(id);
      if (!team) {
        return reply.status(404).send({ success: false, error: 'Team not found' });
      }

      const member = await ctx.teamRepo.addMember(id, userId, role);
      return { success: true, data: member };
    } catch (error) {
      request.log.error(error, 'Failed to add member');
      return reply.status(500).send({ success: false, error: 'Failed to add member' });
    }
  });

  // Remove member from team
  server.delete('/:id/members/:userId', async (request: FastifyRequest<{ Params: { id: string; userId: string } }>, reply: FastifyReply) => {
    try {
      if (request.user?.role !== 'admin') {
        return reply.status(403).send({ success: false, error: 'Admin access required' });
      }

      const { id, userId } = request.params;
      const userIdNum = parseInt(userId, 10);

      if (isNaN(userIdNum)) {
        return reply.status(400).send({ success: false, error: 'Invalid userId' });
      }

      const removed = await ctx.teamRepo.removeMember(id, userIdNum);

      if (!removed) {
        return reply.status(404).send({ success: false, error: 'Member not found in team' });
      }

      return { success: true, message: 'Member removed from team' };
    } catch (error) {
      request.log.error(error, 'Failed to remove member');
      return reply.status(500).send({ success: false, error: 'Failed to remove member' });
    }
  });

  // Get user's teams
  server.get('/user/:userId', async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const { userId } = request.params;
      const userIdNum = parseInt(userId, 10);

      if (isNaN(userIdNum)) {
        return reply.status(400).send({ success: false, error: 'Invalid userId' });
      }

      const teams = await ctx.teamRepo.getUserTeams(userIdNum);
      return { success: true, data: teams };
    } catch (error) {
      request.log.error(error, 'Failed to get user teams');
      return reply.status(500).send({ success: false, error: 'Failed to get user teams' });
    }
  });
}
