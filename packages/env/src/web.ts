import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "PUBLIC_",
  client: {
    PUBLIC_SERVER_URL: z.url(),
  },
  runtimeEnv: (import.meta as any).env,
  // `process` is absent in the browser bundle; guard before touching it so the
  // schema can be imported client-side as well as during SSR.
  skipValidation:
    typeof process !== "undefined" && !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
