import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createMcpHandler } from "agents/mcp";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import {
  DevMachineError,
  DevMachineService,
  type MachineStatusResult,
  parseDevMachineConfig
} from "./dev-machine";
import {
  DigitalOceanApiError,
  DigitalOceanClient
} from "./digitalocean";

export { DevMachineHibernateWorkflow } from "./hibernate-workflow";

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

const SnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  sizeGigabytes: z.number()
});

const WorkflowOperationSchema = z.object({
  id: z.string(),
  status: z.string()
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
    version: "0.4.0"
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
        "Get the lifecycle, power status, size, region, public IP, and hibernation snapshot of the single managed dev machine.",
      outputSchema: z.object({
        exists: z.boolean(),
        lifecycle: z.enum([
          "running",
          "off",
          "hibernating",
          "hibernated",
          "absent"
        ]),
        machine: MachineSchema.optional(),
        snapshot: SnapshotSchema.optional(),
        operation: WorkflowOperationSchema.optional()
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => runTool("status", () => statusWithWorkflow(service, env))
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
    async ({ size }) => runTool("create", () => service.create(size))
  );

  server.registerTool(
    "devmachine_start",
    {
      title: "Start dev machine",
      description:
        "Power on the managed dev machine, or recreate it from its latest hibernation snapshot when no Droplet exists.",
      outputSchema: z.object({
        changed: z.boolean(),
        machine: MachineSchema,
        action: ActionSchema.optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => runTool("start", () => service.start())
  );

  server.registerTool(
    "devmachine_stop",
    {
      title: "Stop dev machine",
      description:
        "Request a graceful shutdown of the managed dev machine, or return it unchanged if it is already off.",
      outputSchema: z.object({
        changed: z.boolean(),
        machine: MachineSchema,
        action: ActionSchema.optional()
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () => runTool("stop", () => service.stop())
  );

  server.registerTool(
    "devmachine_hibernate",
    {
      title: "Hibernate dev machine",
      description:
        "Gracefully stop the dev machine, snapshot its disk, verify the snapshot, and delete the Droplet. Running processes and RAM are not preserved.",
      outputSchema: z.object({
        changed: z.boolean(),
        lifecycle: z.literal("hibernating"),
        operation: WorkflowOperationSchema
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async () =>
      runTool("hibernate", () => beginHibernate(service, env))
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
    async ({ size }) => runTool("resize", () => service.resize(size))
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
    async ({ confirm }) => runTool("delete", () => service.delete(confirm))
  );

  return server;
}

async function statusWithWorkflow(
  service: DevMachineService,
  env: Env
): Promise<
  Omit<MachineStatusResult, "lifecycle"> & {
    lifecycle: MachineStatusResult["lifecycle"] | "hibernating";
    operation?: { id: string; status: string };
  }
> {
  const result = await service.status();
  if (!result.machine) {
    return result;
  }

  const id = hibernateOperationId(result.machine.id);
  try {
    const instance = await env.DEV_MACHINE_HIBERNATE.get(id);
    const operation = await instance.status();
    const inProgress = [
      "queued",
      "running",
      "paused",
      "waiting",
      "waitingForPause"
    ].includes(operation.status);
    return {
      ...result,
      ...(inProgress ? { lifecycle: "hibernating" as const } : {}),
      operation: { id, status: operation.status }
    };
  } catch (error) {
    if (!isMissingWorkflowError(error)) {
      console.error("Failed to read hibernation workflow status", {
        operation: "status",
        workflowId: id,
        error
      });
    }
    return result;
  }
}

async function beginHibernate(
  service: DevMachineService,
  env: Env
): Promise<{
  changed: boolean;
  lifecycle: "hibernating";
  operation: { id: string; status: string };
}> {
  const params = await service.prepareHibernate();
  const id = hibernateOperationId(params.dropletId);

  try {
    const instance = await env.DEV_MACHINE_HIBERNATE.create({
      id,
      params,
      retention: {
        successRetention: "1 day",
        errorRetention: "3 days"
      }
    });
    const status = await instance.status();
    return {
      changed: true,
      lifecycle: "hibernating",
      operation: { id, status: status.status }
    };
  } catch (createError) {
    try {
      const instance = await env.DEV_MACHINE_HIBERNATE.get(id);
      const status = await instance.status();
      if (status.status === "errored" || status.status === "terminated") {
        await instance.restart();
        return {
          changed: true,
          lifecycle: "hibernating",
          operation: { id, status: "queued" }
        };
      }

      return {
        changed: false,
        lifecycle: "hibernating",
        operation: { id, status: status.status }
      };
    } catch {
      throw createError;
    }
  }
}

function hibernateOperationId(dropletId: number): string {
  return `hibernate-${dropletId}`;
}

function isMissingWorkflowError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /not found|does not exist|no instance/i.test(error.message)
  );
}

async function runTool<T extends object>(
  operationName: string,
  operation: () => Promise<T>
): Promise<CallToolResult> {
  try {
    return toolResult(await operation());
  } catch (error) {
    logToolError(operationName, error);
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

function logToolError(operation: string, error: unknown): void {
  if (error instanceof DigitalOceanApiError) {
    console.error("DigitalOcean operation failed", {
      operation,
      status: error.status,
      message: error.message
    });
    return;
  }

  if (error instanceof DevMachineError) {
    console.error("Dev machine operation rejected", {
      operation,
      message: error.message
    });
    return;
  }

  console.error("Unexpected dev machine operation error", {
    operation,
    error
  });
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
