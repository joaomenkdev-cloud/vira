import { PrismaService } from "../../../platform/database/prisma.service.js";
import { RedisService } from "../../../platform/redis/redis.module.js";
import type { DependencyCheck } from "../application/check-readiness.js";

export function databaseCheck(prisma: PrismaService): DependencyCheck {
  return {
    name: "database",
    ping: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
  };
}

export function redisCheck(redis: RedisService): DependencyCheck {
  return {
    name: "redis",
    ping: async () => {
      if (redis.status === "wait" || redis.status === "end") await redis.connect();
      await redis.ping();
    },
  };
}

export const DEPENDENCY_CHECK_FACTORY = {
  inject: [PrismaService, RedisService],
  useFactory: (prisma: PrismaService, redis: RedisService): DependencyCheck[] => [
    databaseCheck(prisma),
    redisCheck(redis),
  ],
};
