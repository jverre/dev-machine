import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "agents/mcp";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  DevMachineError,
  DevMachineService,
  parseDevMachineConfig
} from "./dev-machine";
import {
  DigitalOceanApiError,
  DigitalOceanClient
} from "./digitalocean";

interface AccessIdentity {
  email: string;
  sub: string;
}

const MachineSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  status: z.string(),
  size: z.string(),
  region: z.string(),
  ipv4: z.string().nullable()
});

const ActionSchema = z.object({
  id: z.number().int(),
  status: z.string(),
  type: z.string()
});

function createServer(identity: AccessIdentity, env: Env) {
  const config = parseDevMachineConfig(env);
  const service = new DevMachineService(
    config,
    new DigitalOceanClient(env.DIGITALOCEAN_TOKEN)
  );
  const sizeSchema = z.enum(
    config.allowedSizes as [string, ...string[]]
  );
  const server = new McpServer({
    name: "dev-machine",
    version: "0.2.0"
  });

  server.registerTool(
    "devmachine_ping",
    {
      title: "Ping dev machine MCP",
      description: "Confirm that the remote MCP connection and OAuth login work.",
      outputSchema: z.object({
        ok: z.literal(true),
        authenticatedAs: z.string()
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      }
    },
    async () =>
      toolResult({
        ok: true as const,
        authenticatedAs: identity.email
      })
  );

  server.registerTool(
    "devmachine_status",
    {
      title: "Get dev machine status",
      description:
        "Get the existence, power status, size, region, and public IP of the single managed dev machine.",
      outputSchema: z.object({
        exists: z.boolean(),
        machine: MachineSchema.optional()
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => runTool(() => service.status())
  );

  server.registerTool(
    "devmachine_create",
    {
      title: "Create dev machine",
      description:
        "Create the single managed DigitalOcean dev machine, or return it unchanged if it already exists.",
      inputSchema: z.object({
        size: sizeSchema
          .optional()
          .describe(`Droplet size. Defaults to ${config.defaultSize}.`)
      }),
      outputSchema: z.object({
        changed: z.boolean(),
        machine: MachineSchema
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ size }) => runTool(() => service.create(size))
  );

  server.registerTool(
    "devmachine_resize",
    {
      title: "Resize dev machine",
      description:
        "Resize the managed dev machine's CPU and RAM. This powers the machine off and never expands its disk.",
      inputSchema: z.object({
        size: sizeSchema.describe("The new allowed Droplet size.")
      }),
      outputSchema: z.object({
        changed: z.boolean(),
        machine: MachineSchema,
        requestedSize: z.string(),
        action: ActionSchema.optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ size }) => runTool(() => service.resize(size))
  );

  server.registerTool(
    "devmachine_delete",
    {
      title: "Delete dev machine",
      description:
        "Permanently delete the managed dev machine. Associated volumes and snapshots are left untouched.",
      inputSchema: z.object({
        confirm: z
          .literal(true)
          .describe("Must be true to confirm permanent deletion.")
      }),
      outputSchema: z.object({
        changed: z.boolean(),
        deletedMachine: MachineSchema.optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async ({ confirm }) => runTool(() => service.delete(confirm))
  );

  return server;
}

async function runTool<T extends object>(
  operation: () => Promise<T>
): Promise<CallToolResult> {
  try {
    return toolResult(await operation());
  } catch (error) {
    if (
      !(error instanceof DevMachineError) &&
      !(error instanceof DigitalOceanApiError)
    ) {
      console.error("Unexpected dev machine operation error", error);
    }
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: safeErrorMessage(error)
        }
      ]
    };
  }
}

function toolResult<T extends object>(value: T): CallToolResult {
  return {
    structuredContent: { ...value } as Record<string, unknown>,
    content: [
      {
        type: "text",
        text: JSON.stringify(value)
      }
    ]
  };
}

function safeErrorMessage(error: unknown): string {
  if (
    error instanceof DevMachineError ||
    error instanceof DigitalOceanApiError
  ) {
    return error.message;
  }
  return "The dev machine operation failed unexpectedly.";
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

    return createMcpHandler(createServer(identity, env), {
      route: "/mcp"
    })(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
