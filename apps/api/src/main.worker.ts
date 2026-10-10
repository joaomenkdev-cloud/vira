import "reflect-metadata";

import { runWorker } from "./bootstrap/run-worker.js";

// The process stays alive on the open Redis and database connections and on the
// poller's timer; it exits when the shutdown hooks close the application.
const exitCode = await runWorker(process.env);
if (exitCode !== 0) process.exit(exitCode);
