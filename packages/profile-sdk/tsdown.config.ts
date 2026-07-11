import { defineConfig } from "tsdown";

// @SunReye/inverter-core is a private workspace package, so it gets bundled
// (inlined) into dist; zod stays external as a real npm dependency.
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: "esm",
  platform: "node",
  // The SDK never constructs ModbusInverter; without this, inverter-core's
  // barrel re-export of ./driver drags modbus-serial+serialport into the bundle.
  treeshake: {
    moduleSideEffects: (id: string) => !/modbus-serial|serialport/.test(id),
  },
  // tsconfig.build.json includes ../inverter-core/src so the tsc dts generator
  // can emit declarations for the bundled workspace dependency too.
  // eager: lazy per-file emit fails for files outside this package's root.
  dts: { generator: "tsc", tsconfig: "tsconfig.build.json", eager: true },
});
