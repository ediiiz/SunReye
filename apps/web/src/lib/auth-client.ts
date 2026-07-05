import { PUBLIC_SERVER_URL } from "$env/static/public";
import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/svelte";

export const authClient = createAuthClient({
  baseURL: PUBLIC_SERVER_URL,
  plugins: [adminClient()],
});
