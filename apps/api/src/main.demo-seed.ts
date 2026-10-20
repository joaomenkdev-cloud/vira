import { runDemoSeed } from "./bootstrap/demo-seed/run-demo-seed.js";

process.exitCode = await runDemoSeed(process.argv.slice(2), process.env);
