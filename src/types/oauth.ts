// OAuth API response types
export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface GoogleUserInfo {
  id?: string | null;
  email?: string | null;
  verified_email?: boolean | null;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
}

export interface YahooTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export interface YahooUserInfo {
  email: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}