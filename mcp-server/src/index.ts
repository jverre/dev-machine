import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp";
import { z } from "zod";
import { authHandler } from "./auth";
import { getConfig, getSecretStatus } from "./config";
import { renderCloudInit } from "./cloud-init";

function createServer(env: Env) {
  const server = new McpServer({
    name: "dev-machine",
    version: "0.1.0"
  });

  server.registerTool(
    "devmachine_status",
    {
      description: "Show MCP server configuration and which required secrets are present.",
      inputSchema: {}
    },
    async () => {
      const auth = getMcpAuthContext();
      return jsonToolResult({
        authenticated: Boolean(auth),
        auth: auth?.props ?? null,
        config: getConfig(env),
        secrets: getSecretStatus(env)
      });
    }
  );

  server.registerTool(
    "devmachine_connection_info",
    {
      description: "Return SSH and VS Code connection commands for a dev machine.",
      inputSchema: {
        name: z.string().optional(),
        user: z.string().optional()
      }
    },
    async ({ name, user }) => {
      const config = getConfig(env);
      const machineName = name ?? config.defaultName;
      const machineUser = user ?? config.defaultUser;
      return jsonToolResult({
        ssh: `ssh ${machineUser}@${machineName}`,
        tmux: "tmux new -A -s work",
        vscode: `code --remote ssh-remote+${machineName} /home/${machineUser}/work`
      });
    }
  );

  server.registerTool(
    "devmachine_render_cloud_init",
    {
      description: "Render cloud-init for inspection. Requires a short-lived Tailscale auth key.",
      inputSchema: {
        tailscaleAuthKey: z.string(),
        name: z.string().optional(),
        user: z.string().optional(),
        repo: z.string().optional(),
        ref: z.string().optional(),
        sshPublicKey: z.string().optional()
      }
    },
    async ({ tailscaleAuthKey, name, user, repo, ref, sshPublicKey }) => {
      const config = getConfig(env);
      const rendered = renderCloudInit({
        devUser: user ?? config.defaultUser,
        sshPublicKey: sshPublicKey ?? config.sshPublicKey ?? "",
        tailscaleAuthKey,
        tailscaleHostname: name ?? config.defaultName,
        repo: repo ?? config.repo,
        ref: ref ?? config.ref
      });

      return {
        content: [{ type: "text", text: rendered }]
      };
    }
  );

  server.registerTool(
    "devmachine_create",
    {
      description: "Plan creation of a dev machine. DigitalOcean/Tailscale execution is the next implementation step.",
      inputSchema: {
        name: z.string().optional(),
        region: z.string().optional(),
        size: z.string().optional(),
        image: z.string().optional(),
        ref: z.string().optional()
      }
    },
    async ({ name, region, size, image, ref }) => {
      const config = getConfig(env);
      return jsonToolResult({
        status: "planned",
        next: "Implement DigitalOcean droplet creation and Tailscale auth-key minting in this tool.",
        machine: {
          name: name ?? config.defaultName,
          region: region ?? config.region,
          size: size ?? config.size,
          image: image ?? config.image,
          repo: config.repo,
          ref: ref ?? config.ref,
          tag: config.tag
        },
        secrets: getSecretStatus(env)
      });
    }
  );

  return server;
}

const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return createMcpHandler(createServer(env), {
      route: "/mcp"
    })(request, env, ctx);
  }
};

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler: authHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  scopesSupported: ["devmachine.read", "devmachine.write"],
  accessTokenTTL: 3600,
  refreshTokenTTL: 0,
  allowImplicitFlow: false,
  allowPlainPKCE: false
});

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
