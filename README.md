# NovaFix — Plataforma de Gestión y Trazabilidad de Órdenes de Servicio

**NovaFix** es una plataforma web Full-Stack diseñada bajo principios *Secure by Design* (OWASP) para la gestión y seguimiento en tiempo real de órdenes de reparación de equipos de cómputo y dispositivos móviles.

## Stack Tecnológico
- **Monorepo:** `pnpm` v12.16.1 (`pnpm-workspace.yaml`)
- **Backend:** Node.js v26.13.0, Express 5, TypeScript estricto (`strict: true`)
- **Base de Datos & ORM:** PostgreSQL (`postgres:alpine` / Neon.tech) + Prisma ORM v7.10.1 (`@prisma/adapter-pg`)
- **Caché (Cache-Aside):** Redis (`redis:alpine` / Upstash) + cliente oficial `redis` v6
- **Frontend:** Angular CLI v22.2.5 (CSR, Standalone Components, Signals, `ChangeDetectionStrategy.OnPush`, CSS BEM)

## Comandos Rápidos (Desde la Raíz)

```bash
# 1. Levantar contenedores locales (PostgreSQL y Redis)
pnpm docker:up

# 2. Validar esquema y generar cliente tipado de Prisma v7
pnpm db:validate
pnpm db:generate

# 3. Ejecutar migraciones de base de datos
pnpm db:migrate

# 4. Iniciar Backend y Frontend en desarrollo
pnpm dev:backend
pnpm dev:frontend
```
