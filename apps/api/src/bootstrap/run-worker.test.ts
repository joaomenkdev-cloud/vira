import { NestFactory } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { runWorker } from "./run-worker.js";

describe("runWorker", () => {
  it("refuses to start when the environment is invalid", async () => {
    const create = vi.spyOn(NestFactory, "createApplicationContext");
    const errors: string[] = [];

    const exitCode = await runWorker(
      {
        NODE_ENV: "production",
        WEB_ORIGIN: "https://vira.example",
        DATABASE_URL: "postgresql://vira:pw@db.example/vira",
        REDIS_URL: "redis://insecure.example",
        SMTP_URL: "smtps://mail.example",
        MAIL_FROM: "Vira <no-reply@vira.example>",
        S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
        S3_BUCKET: "vira-events",
        S3_ACCESS_KEY_ID: "key-id",
        S3_SECRET_ACCESS_KEY: "key-secret",
        JWT_SECRET: "j".repeat(44),
        CSRF_SECRET: "c".repeat(44),
      },
      { writeError: (message) => errors.push(message) },
    );
    const output = errors.join("\n");

    expect(exitCode).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(output).toContain("DATABASE_URL");
    expect(output).toContain("REDIS_URL");
    expect(output).not.toContain("insecure.example");
  });
});
