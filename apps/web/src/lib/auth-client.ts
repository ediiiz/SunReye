import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";
import { serverUrl } from "./server-url";

export const authClient = createAuthClient({
  // The `/api/auth` mount is spelled out because Better Auth only appends its
  // default basePath when the baseURL has no path — under a reverse-proxy
  // prefix (Home Assistant ingress) `serverUrl` carries one.
  baseURL: `${serverUrl}/api/auth`,
  plugins: [adminClient()],
});
