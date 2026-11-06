import type { Server } from "node:http";
import { app } from "./app.js";
import { databaseManager } from "./config/database.config.js";
import { env } from "./config/env.config.js";
import { redisCache } from "./config/redis.config.js";

let httpServer: Server | undefined;
let isShuttingDown = false;

async function bootstrapServer(): Promise<void> {
  try {
    // 1. Conectar a PostgreSQL vía Prisma v7 Adapter (crítico)
    await databaseManager.connect();

    // 2. Conectar a Redis (con degradación elegante si no está disponible)
    await redisCache.connect();

    // 3. Iniciar servidor HTTP Express
    httpServer = app.listen(env.port, () => {
      console.info(
        `[NovaFix Backend] Servidor escuchando en http://localhost:${env.port} (${env.nodeEnv})`
      );
      console.info(
        `[NovaFix Security] CORS restringido al origen: ${env.frontendUrl}`
      );
    });
  } catch (error: unknown) {
    console.error(
      "[FATAL][Bootstrap] Fallo crítico al inicializar el servidor NovaFix:",
      error
    );
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  console.info(
    `\n[NovaFix Backend] Señal ${signal} recibida. Iniciando cierre limpio de conexiones...`
  );

  try {
    if (httpServer !== undefined) {
      await new Promise<void>((resolve, reject) => {
        httpServer?.close((err) => {
          if (err !== undefined && err !== null) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    }

    await redisCache.disconnect();
    await databaseManager.disconnect();
    console.info("[NovaFix Backend] Cierre limpio completado.");
    process.exit(0);
  } catch (error: unknown) {
    console.error("[NovaFix Backend] Error durante el cierre:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void gracefulShutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void gracefulShutdown("SIGTERM");
});

void bootstrapServer();
