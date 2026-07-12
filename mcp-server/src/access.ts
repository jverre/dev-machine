export function authenticatedEmail(request: Request): string | undefined {
  return request.headers.get("cf-access-authenticated-user-email") ?? undefined;
}

export function isAdminRequest(request: Request, env: Env): boolean {
  const email = authenticatedEmail(request);
  return Boolean(env.ADMIN_EMAIL && email && email.toLowerCase() === env.ADMIN_EMAIL.toLowerCase());
}

export function adminLabel(request: Request): string {
  return authenticatedEmail(request) ?? "admin-token";
}
