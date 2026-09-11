const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001/api').replace(/\/$/, '');

export interface ApiUser {
  id: string;
  email: string | null;
  username: string;
  phoneNumber: string | null;
  photoUrl: string | null;
  isAnonymous: boolean;
}

interface TokenResponse {
  accessToken: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

function setAccessToken(token: string | null) {
  accessToken = token;
}

async function parseError(res: Response): Promise<never> {
  let message = `Request failed with status ${res.status}`;
  try {
    const body = await res.json();
    if (body?.message) {
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    }
  } catch {
    // Response had no JSON body; fall back to the generic message above.
  }
  throw new ApiError(res.status, message);
}

async function requestTokens(path: string, body?: unknown): Promise<string> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    credentials: 'include',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) await parseError(res);
  const data: TokenResponse = await res.json();
  setAccessToken(data.accessToken);
  return data.accessToken;
}

export function login(email: string, password: string): Promise<string> {
  return requestTokens('/auth/login', { email, password });
}

export function register(email: string, password: string, username: string): Promise<string> {
  return requestTokens('/auth/register', { email, password, username });
}

export function guestLogin(): Promise<string> {
  return requestTokens('/auth/guest');
}

// Redeems the httpOnly refresh-token cookie for a new access token. Used to
// silently restore a session on load, and to recover from an expired access token.
export async function refreshSession(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const data: TokenResponse = await res.json();
    setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
  } finally {
    setAccessToken(null);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });

  if (res.status === 401 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) return apiFetch<T>(path, init, false);
  }

  if (!res.ok) await parseError(res);
  return res.json();
}

export function fetchCurrentUser(): Promise<ApiUser> {
  return apiFetch<ApiUser>('/users/me');
}

export function requestPasswordReset(email: string): Promise<{ success: boolean }> {
  return apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export function resetPassword(token: string, newPassword: string): Promise<{ success: boolean }> {
  return apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
}
