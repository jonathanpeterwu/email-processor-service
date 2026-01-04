import { FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  provider?: string;
}

export function isAuthenticatedRequest(request: FastifyRequest): request is FastifyRequest & { user: AuthenticatedUser } {
  return !!request.user && 
         typeof request.user === 'object' && 
         'userId' in request.user && 
         'email' in request.user;
}

export function getAuthenticatedUser(request: FastifyRequest): AuthenticatedUser {
  if (!isAuthenticatedRequest(request)) {
    throw new Error('Request is not authenticated');
  }
  return request.user;
}