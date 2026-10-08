import "reflect-metadata";

import { run } from "./bootstrap/run.js";

process.exitCode = await run(process.env);
