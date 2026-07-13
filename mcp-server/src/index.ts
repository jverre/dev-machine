import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";
import { createRemoteJWKSet, jwtVerify } from "jose";

interface AccessIdentity {
  email: string;
  sub: string;
}

function createServer(identity: AccessIdentity) {
  const server = new McpServer({
    name: "dev-machine",
    version: "0.1.0"
  });

  server.registerTool(
    "devmachine_ping",
    {
      description: "Confirm that the remote MCP connection and OAuth login work.",
      inputSchema: {}
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            authenticatedAs: identity.email
          })
        }
      ]
    })
  );

  return server;
}

async function verifyAccessJwt(token: string, env: Env): Promise<AccessIdentity> {
  const teamDomain = env.TEAM_DOMAIN.replace(/\/$/, "");
  const jwks = createRemoteJWKSet(
    new URL(`${teamDomain}/cdn-cgi/access/certs`)
  );
  const { payload } = await jwtVerify(token, jwks, {
    issuer: teamDomain,
    audience: env.POLICY_AUD
  });

  if (typeof payload.email !== "string" || typeof payload.sub !== "string") {
    throw new Error("Access token is missing identity claims.");
  }

  if (payload.email.toLowerCase() !== env.ALLOWED_EMAIL.toLowerCase()) {
    throw new Error("Access identity is not allowed.");
  }

  return {
    email: payload.email,
    sub: payload.sub
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    let identity: AccessIdentity;
    try {
      identity = await verifyAccessJwt(token, env);
    } catch {
      return new Response("Forbidden", { status: 403 });
    }

    return createMcpHandler(createServer(identity), {
      route: "/mcp"
    })(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
