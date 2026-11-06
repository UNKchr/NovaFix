import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.config.js";

/**
 * Instancia Singleton de PrismaClient v7.10.1 utilizando el Driver Adapter oficial
 * @prisma/adapter-pg para PostgreSQL (Docker local en desarrollo / Neon.tech en producción).
 */
class DatabaseManager {
  private static instance: DatabaseManager | undefined;
  public readonly prisma: PrismaClient;

  private constructor() {
    const adapter = new PrismaPg({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    this.prisma = new PrismaClient({
      adapter,
    });
  }

  public static getInstance(): DatabaseManager {
    if (DatabaseManager.instance === undefined) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async connect(): Promise<void> {
    await this.prisma.$connect();
    console.info("[PostgreSQL] Conexión establecida exitosamente vía Prisma v7 Adapter.");
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    console.info("[PostgreSQL] Conexión cerrada limpiamente.");
  }
}

export const databaseManager = DatabaseManager.getInstance();
export const prisma: PrismaClient = databaseManager.prisma;
