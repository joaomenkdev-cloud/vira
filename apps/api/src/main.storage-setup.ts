import { setupStorage } from "./bootstrap/setup-storage.js";

process.exitCode = await setupStorage(process.env);
