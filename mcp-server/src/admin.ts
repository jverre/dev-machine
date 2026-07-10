import {
  deleteSecret,
  hasSecretsStoreConfig,
  listSecrets,
  MANAGED_SECRET_NAMES,
  putSecret,
  type ManagedSecretName
} from "./cloudflare-secrets";

export async function handleAdmin(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname !== "/admin") {
    return new Response("Not found", { status: 404 });
  }

  if (request.method === "GET") {
    return renderAdmin(env);
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const form = await request.formData();
  const adminToken = String(form.get("admin_token") ?? "");
  if (!env.MCP_ADMIN_TOKEN || adminToken !== env.MCP_ADMIN_TOKEN) {
    return renderAdmin(env, "Invalid admin token.", 403);
  }

  const deleteName = form.get("delete_name");
  const action = deleteName ? "delete" : "save";

  try {
    if (action === "delete") {
      const name = validateSecretName(String(deleteName ?? ""));
      await deleteSecret(env, name);
      return renderAdmin(env, `${name} deleted.`);
    }

    for (const name of MANAGED_SECRET_NAMES) {
      const value = String(form.get(name) ?? "").trim();
      if (value) {
        await putSecret(env, name, value);
      }
    }

    return renderAdmin(env, "Secrets saved. Empty fields were left unchanged.");
  } catch (error) {
    return renderAdmin(
      env,
      error instanceof Error ? error.message : "Failed to update secrets.",
      500
    );
  }
}

async function renderAdmin(
  env: Env,
  message?: string,
  status = 200
): Promise<Response> {
  const configured = hasSecretsStoreConfig(env);
  const existing = configured ? await listSecrets(env).catch(() => []) : [];
  const existingNames = new Set(existing.map((secret) => secret.name));

  const rows = MANAGED_SECRET_NAMES.map((name) => {
    const present = existingNames.has(name);
    return `<tr>
      <td><code>${name}</code></td>
      <td>${present ? "configured" : "missing"}</td>
      <td>
        <input name="${name}" type="password" autocomplete="off" placeholder="${
          present ? "leave blank to keep existing value" : "paste value"
        }" />
      </td>
      <td>
        <button name="delete_name" value="${name}" type="submit">Delete</button>
      </td>
    </tr>`;
  }).join("");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>dev-machine admin</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 68rem; padding: 0 1rem; line-height: 1.45; }
      table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
      th, td { border-bottom: 1px solid #ddd; padding: .6rem; text-align: left; vertical-align: top; }
      input { box-sizing: border-box; font: inherit; padding: .55rem; width: 100%; }
      button { font: inherit; padding: .5rem .75rem; }
      .notice { background: #f5f5f5; border-left: 4px solid #444; padding: .75rem 1rem; }
      .warn { border-left-color: #a15c00; }
      code { background: #f4f4f4; padding: .1rem .25rem; border-radius: .25rem; }
    </style>
  </head>
  <body>
    <h1>dev-machine admin</h1>
    ${message ? `<p class="notice">${escapeHtml(message)}</p>` : ""}
    ${
      configured
        ? ""
        : `<p class="notice warn">Cloudflare Secrets Store API config is incomplete. Set <code>CLOUDFLARE_ACCOUNT_ID</code>, <code>CLOUDFLARE_SECRETS_STORE_ID</code>, and <code>CLOUDFLARE_API_TOKEN</code>.</p>`
    }
    <form method="post" action="/admin">
      <label>
        Admin token
        <input name="admin_token" type="password" autocomplete="one-time-code" required />
      </label>
      <table>
        <thead>
          <tr>
            <th>Secret</th>
            <th>Status</th>
            <th>New value</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <button name="action" value="save" type="submit">Save secrets</button>
    </form>
  </body>
</html>`;

  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function validateSecretName(name: string): ManagedSecretName {
  if (MANAGED_SECRET_NAMES.includes(name as ManagedSecretName)) {
    return name as ManagedSecretName;
  }
  throw new Error("Unknown managed secret.");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
