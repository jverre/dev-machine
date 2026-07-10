import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp";
import { z } from "zod";
import { authHandler } from "./auth";
import { getConfig } from "./config";
import { renderCloudInit } from "./cloud-init";
import {
  createDroplet,
  destroyDroplet,
  dropletAction,
  findDroplet,
  listDroplets,
  waitForAction
} from "./digitalocean";
import { getSecretConfig, getSecretStatus } from "./secret-config";
import { createTailscaleAuthKey } from "./tailscale";

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
        secrets: await getSecretStatus(env)
      });
    }
  );

  server.registerTool(
    "devmachine_list",
    {
      description: "List DigitalOcean Droplets managed by dev-machine.",
      inputSchema: {}
    },
    async () => {
      const config = getConfig(env);
      const secrets = await getSecretConfig(env);
      return jsonToolResult(await listDroplets(secrets, config.tag));
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
        sshPublicKey:
          sshPublicKey ??
          (await getSecretConfig(env)).DEV_MACHINE_SSH_PUBLIC_KEY ??
          "",
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
      description: "Create a DigitalOcean dev machine and bootstrap it into Tailscale.",
      inputSchema: {
        name: z.string().optional(),
        region: z.string().optional(),
        size: z.string().optional(),
        image: z.string().optional(),
        ref: z.string().optional(),
        user: z.string().optional()
      }
    },
    async ({ name, region, size, image, ref, user }) => {
      const config = getConfig(env);
      const secrets = await getSecretConfig(env);
      const machineName = name ?? config.defaultName;
      const existing = await findDroplet(secrets, machineName, config.tag);
      if (existing) {
        return jsonToolResult({ status: "already_exists", droplet: existing });
      }

      const tailscaleKey = await createTailscaleAuthKey(
        secrets,
        config.tag,
        `dev-machine ${machineName}`
      );
      const userData = renderCloudInit({
        devUser: user ?? config.defaultUser,
        sshPublicKey: secrets.DEV_MACHINE_SSH_PUBLIC_KEY ?? "",
        tailscaleAuthKey: tailscaleKey,
        tailscaleHostname: machineName,
        repo: config.repo,
        ref: ref ?? config.ref
      });
      const droplet = await createDroplet(secrets, {
        name: machineName,
        region: region ?? config.region,
        size: size ?? config.size,
        image: image ?? config.image,
        tags: [config.tag],
        userData
      });
      return jsonToolResult({
        status: "creating",
        droplet,
        connection: connectionInfo(machineName, user ?? config.defaultUser)
      });
    }
  );

  server.registerTool(
    "devmachine_start",
    {
      description: "Power on a managed DigitalOcean dev machine.",
      inputSchema: { name: z.string().optional() }
    },
    async ({ name }) => {
      return jsonToolResult(await runDropletAction(env, name, "power_on"));
    }
  );

  server.registerTool(
    "devmachine_stop",
    {
      description: "Gracefully shut down a managed DigitalOcean dev machine.",
      inputSchema: { name: z.string().optional() }
    },
    async ({ name }) => {
      return jsonToolResult(await runDropletAction(env, name, "shutdown"));
    }
  );

  server.registerTool(
    "devmachine_power_off",
    {
      description: "Hard power off a managed DigitalOcean dev machine.",
      inputSchema: { name: z.string().optional() }
    },
    async ({ name }) => {
      return jsonToolResult(await runDropletAction(env, name, "power_off"));
    }
  );

  server.registerTool(
    "devmachine_suspend",
    {
      description: "Snapshot a dev machine, then destroy the Droplet. Requires confirm='snapshot and destroy'.",
      inputSchema: {
        name: z.string().optional(),
        confirm: z.string()
      }
    },
    async ({ name, confirm }) => {
      if (confirm !== "snapshot and destroy") {
        throw new Error("Set confirm to 'snapshot and destroy'.");
      }
      const config = getConfig(env);
      const secrets = await getSecretConfig(env);
      const machineName = name ?? config.defaultName;
      const droplet = await requireDroplet(secrets, machineName, config.tag);
      const snapshotName = `${machineName}-${new Date().toISOString().replaceAll(":", "-")}`;
      const action = await dropletAction(secrets, droplet.id, "snapshot", snapshotName);
      await waitForAction(secrets, action.action.id);
      await destroyDroplet(secrets, droplet.id);
      return jsonToolResult({ status: "snapshotted_and_destroyed", snapshotName, action });
    }
  );

  server.registerTool(
    "devmachine_destroy",
    {
      description: "Destroy a managed DigitalOcean dev machine. Requires confirm='destroy'.",
      inputSchema: {
        name: z.string().optional(),
        confirm: z.string()
      }
    },
    async ({ name, confirm }) => {
      if (confirm !== "destroy") {
        throw new Error("Set confirm to 'destroy'.");
      }
      const config = getConfig(env);
      const secrets = await getSecretConfig(env);
      const machineName = name ?? config.defaultName;
      const droplet = await requireDroplet(secrets, machineName, config.tag);
      await destroyDroplet(secrets, droplet.id);
      return jsonToolResult({ status: "destroyed", droplet });
    }
  );

  return server;
}

async function runDropletAction(
  env: Env,
  name: string | undefined,
  action: "power_on" | "shutdown" | "power_off"
) {
  const config = getConfig(env);
  const secrets = await getSecretConfig(env);
  const machineName = name ?? config.defaultName;
  const droplet = await requireDroplet(secrets, machineName, config.tag);
  return dropletAction(secrets, droplet.id, action);
}

async function requireDroplet(
  secrets: Awaited<ReturnType<typeof getSecretConfig>>,
  name: string,
  tag: string
) {
  const droplet = await findDroplet(secrets, name, tag);
  if (!droplet) {
    throw new Error(`No managed Droplet found named ${name}.`);
  }
  return droplet;
}

function connectionInfo(name: string, user: string) {
  return {
    ssh: `ssh ${user}@${name}`,
    tmux: "tmux new -A -s work",
    vscode: `code --remote ssh-remote+${name} /home/${user}/work`
  };
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
