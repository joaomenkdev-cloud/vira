import type {
  AcceptedResponse,
  Account,
  AccountResponse,
  BecomeOrganizerRequest,
  ChangeEmailRequest,
  ChangePasswordRequest,
  LoginRequest,
  OrganizerProfileResponse,
  PublicUser,
  RegisterRequest,
  ResetPasswordRequest,
  SessionListResponse,
  SessionSummary,
  UpdateProfileRequest,
  UserResponse,
} from "@vira/shared";

import { api } from "./browser";

/*
 * The authentication and account routes the web uses (docs/API.md). The routes that
 * open a session never retry through a refresh: a 401 there is a wrong password, not
 * an expired token.
 */

export async function login(body: LoginRequest): Promise<PublicUser> {
  const { user } = await api.request<UserResponse>("/auth/login", {
    method: "POST",
    body,
    refresh: false,
  });
  api.sessionChanged();
  return user;
}

export function register(body: RegisterRequest): Promise<AcceptedResponse> {
  return api.request("/auth/register", { method: "POST", body, refresh: false });
}

export async function verifyEmail(token: string): Promise<PublicUser> {
  const { user } = await api.request<UserResponse>("/auth/email/verify", {
    method: "POST",
    body: { token },
    refresh: false,
  });
  api.sessionChanged();
  return user;
}

export function forgotPassword(email: string): Promise<AcceptedResponse> {
  return api.request("/auth/password/forgot", {
    method: "POST",
    body: { email },
    refresh: false,
  });
}

export async function resetPassword(body: ResetPasswordRequest): Promise<void> {
  await api.request("/auth/password/reset", { method: "POST", body, refresh: false });
  // Every session was revoked, the one of this browser included.
  api.sessionChanged();
}

export async function confirmEmailChange(token: string): Promise<void> {
  await api.request("/auth/email/change/confirm", {
    method: "POST",
    body: { token },
    refresh: false,
  });
}

export async function getAccount(): Promise<Account> {
  const { user } = await api.request<AccountResponse>("/me");
  return user;
}

export async function updateProfile(body: UpdateProfileRequest): Promise<Account> {
  const { user } = await api.request<AccountResponse>("/me", {
    method: "PATCH",
    body,
    csrf: true,
  });
  return user;
}

export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await api.request("/me/password", { method: "POST", body, csrf: true });
}

export function changeEmail(body: ChangeEmailRequest): Promise<AcceptedResponse> {
  return api.request("/me/email", { method: "POST", body, csrf: true });
}

/**
 * The new role is only in the next access token, so the session is refreshed at once
 * (docs/API.md, "Conta (N6)").
 */
export async function becomeOrganizer(
  body: BecomeOrganizerRequest,
): Promise<OrganizerProfileResponse> {
  const profile = await api.request<OrganizerProfileResponse>("/me/organizer", {
    method: "POST",
    body,
    csrf: true,
  });
  await api.refreshSession();
  return profile;
}

export async function listSessions(): Promise<readonly SessionSummary[]> {
  const { data } = await api.request<SessionListResponse>("/auth/sessions");
  return data;
}

export async function revokeSession(id: string): Promise<void> {
  await api.request(`/auth/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    csrf: true,
  });
}

export async function logout(): Promise<void> {
  await api.request("/auth/logout", { method: "POST", csrf: true });
  api.sessionChanged();
}

export async function logoutAll(): Promise<void> {
  await api.request("/auth/logout-all", { method: "POST", csrf: true });
  api.sessionChanged();
}
