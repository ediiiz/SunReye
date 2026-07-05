import { env } from "@SunReye/env/web";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: env.PUBLIC_SERVER_URL,
  plugins: [adminClient()],
});
