import { ContainerProxy, getSandbox } from "@cloudflare/sandbox";
import { DevMachine } from "./dev-machine";
import type { Env } from "./env";

export { ContainerProxy, DevMachine };

const SANDBOX_ID = "primary";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!isAuthorized(request, env, url)) {
      return new Response("Forbidden", { status: 403 });
    }

    const sandbox = getSandbox(env.DEV_MACHINE, SANDBOX_ID, {
      containerTimeouts: {
        instanceGetTimeoutMS: 90_000,
        portReadyTimeoutMS: 120_000
      },
      normalizeId: true,
      sleepAfter: env.IDLE_TIMEOUT,
      transport: "rpc"
    });

    try {
      if (url.pathname === "/__dev-machine/status") {
        return Response.json(await sandbox.machineStatus());
      }

      if (url.pathname === "/__dev-machine/pair") {
        if (request.method !== "GET") {
          return methodNotAllowed("GET");
        }
        const pairing = await sandbox.createPairingLink(env.PUBLIC_URL);
        return Response.redirect(pairing.pairUrl, 302);
      }

      if (url.pathname === "/__dev-machine/checkpoint") {
        if (request.method !== "POST") {
          return methodNotAllowed("POST");
        }
        return Response.json(await sandbox.checkpoint());
      }

      if (url.pathname === "/__dev-machine/sleep") {
        if (request.method !== "POST") {
          return methodNotAllowed("POST");
        }
        return Response.json(await sandbox.sleep());
      }

      await sandbox.ensureReady();
      const port = Number.parseInt(env.T3_PORT, 10);
      if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
        return sandbox.wsConnect(request, port);
      }

      return sandbox.containerFetch(request, port);
    } catch (error) {
      console.error("Dev machine request failed.", {
        error: serializeError(error),
        method: request.method,
        path: url.pathname
      });
      return Response.json(
        {
          error: "The dev machine could not complete the request. Check Worker logs."
        },
        { status: 503 }
      );
    }
  }
} satisfies ExportedHandler<Env>;

function isAuthorized(request: Request, env: Env, url: URL): boolean {
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return true;
  }

  return (
    request.headers.get("Cf-Access-Authenticated-User-Email")?.toLowerCase() ===
    env.ALLOWED_EMAIL.toLowerCase()
  );
}

function methodNotAllowed(method: string): Response {
  return new Response("Method Not Allowed", {
    headers: { Allow: method },
    status: 405
  });
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return { value: String(error) };
}
