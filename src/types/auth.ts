export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface AuthProvider {
  id: string;
  name: string;
  type: 'gmail' | 'yahoo';
}

export interface User {
  id: string;
  email: string;
  name?: string;
  providers: AuthProvider[];
}

export interface AuthSession {
  userId: string;
  provider: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface OAuthCallbackQuery {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export interface OAuthState {
  provider: 'gmail' | 'yahoo';
  redirectUrl?: string;
  userId?: string;
  timestamp: number;
}