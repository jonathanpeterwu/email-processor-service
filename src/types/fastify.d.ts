import { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
      provider: string;
    };
  }
}

// Authenticated request helper type
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    userId: string;
    email: string;
    provider: string;
  };
}