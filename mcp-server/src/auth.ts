import type { AuthRequest, ClientInfo } from "@cloudflare/workers-oauth-provider";
import { handleAdmin } from "./admin";

interface OAuthEnv extends Env {
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<AuthRequest>;
    lookupClient(clientId: string): Promise<ClientInfo>;
    completeAuthorization(options: {
      request: AuthRequest;
      userId: string;
      metadata: Record<string, unknown>;
      scope: string[];
      props: Record<string, unknown>;
    }): Promise<{ redirectTo: string }>;
  };
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return new Response("dev-machine MCP server", {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    if (url.pathname === "/admin") {
      return handleAdmin(request, env);
    }

    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }

    const oauthEnv = env as OAuthEnv;
    const authRequest = await oauthEnv.OAUTH_PROVIDER.parseAuthRequest(request);
    const client = await oauthEnv.OAUTH_PROVIDER.lookupClient(authRequest.clientId);

    if (request.method === "GET") {
      return renderConsent(request.url, client, authRequest.scope ?? []);
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const form = await request.formData();
    const token = String(form.get("admin_token") ?? "");
    if (!env.MCP_ADMIN_TOKEN || token !== env.MCP_ADMIN_TOKEN) {
      return new Response("Invalid admin token", { status: 403 });
    }

    const grantedScopes = authRequest.scope?.length
      ? authRequest.scope
      : ["devmachine.read", "devmachine.write"];

    const { redirectTo } = await oauthEnv.OAUTH_PROVIDER.completeAuthorization({
      request: authRequest,
      userId: "owner",
      metadata: {
        clientName: client.clientName ?? client.clientId,
        approvedAt: new Date().toISOString()
      },
      scope: grantedScopes,
      props: {
        userId: "owner",
        role: "admin",
        clientId: authRequest.clientId
      }
    });

    return Response.redirect(redirectTo, 302);
  }
};

function renderConsent(action: string, client: ClientInfo, scopes: string[]): Response {
  const clientName = escapeHtml(client.clientName ?? client.clientId);
  const scopeText = escapeHtml(scopes.length ? scopes.join(" ") : "devmachine.read devmachine.write");
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize dev-machine MCP</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.45; }
      input, button { font: inherit; padding: .65rem .75rem; }
      input { width: 100%; box-sizing: border-box; margin: .5rem 0 1rem; }
      button { cursor: pointer; }
      code { background: #f4f4f4; padding: .1rem .25rem; border-radius: .25rem; }
    </style>
  </head>
  <body>
    <h1>Authorize dev-machine MCP</h1>
    <p>Client: <strong>${clientName}</strong></p>
    <p>Scopes: <code>${scopeText}</code></p>
    <form method="post" action="${escapeHtml(action)}">
      <label>
        Admin token
        <input name="admin_token" type="password" autocomplete="one-time-code" required />
      </label>
      <button type="submit">Authorize</button>
    </form>
  </body>
</html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
