import { PrismaClient } from "@prisma/client";

// Prisma Client 인스턴스 생성 (main DB용)
export const prismaMain = new PrismaClient({
  datasources: {
    db: {
      url: process.env.POSTGRES_URL,
    },
  },
});

// 애플리케이션 종료 시 연결 정리
process.on("beforeExit", async () => {
  await prismaMain.$disconnect();
});
