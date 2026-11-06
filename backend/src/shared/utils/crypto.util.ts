import {
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.config.js";
import { AppError } from "../errors/app-error.js";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
} as const;

const SALT_BYTES = 32;
const TICKET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TICKET_RANDOM_LENGTH = 6;
const MAX_TOKEN_LENGTH = 2048;

export interface PasswordHashResult {
  readonly passwordHash: string;
  readonly passwordSalt: string;
}

export interface AuthTokenPayload {
  readonly jti: string;
  readonly sub: string;
  readonly companyId: string;
  readonly iat: number;
  readonly exp: number;
}

const jwtHeaderSchema = z
  .object({
    alg: z.literal("HS256"),
    typ: z.literal("JWT"),
  })
  .strict();

const authTokenPayloadSchema = z
  .object({
    jti: z.string().uuid(),
    sub: z.string().uuid(),
    companyId: z.string().uuid(),
    iat: z.number().int().positive(),
    exp: z.number().int().positive(),
  })
  .strict();

function deriveScryptKey(password: string, saltHex: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const saltBuffer = Buffer.from(saltHex, "hex");
    scryptCallback(
      password.normalize("NFKC"),
      saltBuffer,
      SCRYPT_KEYLEN,
      SCRYPT_PARAMS,
      (err, derivedKey) => {
        if (err !== null) {
          reject(err);
          return;
        }
        resolve(derivedKey);
      }
    );
  });
}

/**
 * Genera un salt criptográfico aleatorio de 32 bytes (64 hex chars) y deriva
 * el hash de la contraseña mediante scrypt (N=16384, r=8, p=1).
 */
export async function hashPassword(
  plainPassword: string
): Promise<PasswordHashResult> {
  const passwordSalt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = await deriveScryptKey(plainPassword, passwordSalt);

  return {
    passwordHash: derivedKey.toString("hex"),
    passwordSalt,
  };
}

/**
 * Verifica una contraseña en texto plano contra el hash y salt almacenados
 * usando comparación en tiempo constante (timingSafeEqual) para evitar Timing Attacks.
 */
export async function verifyPassword(
  plainPassword: string,
  storedHashHex: string,
  storedSaltHex: string
): Promise<boolean> {
  if (
    storedHashHex.length !== SCRYPT_KEYLEN * 2 ||
    storedSaltHex.length !== SALT_BYTES * 2
  ) {
    return false;
  }

  const derivedKey = await deriveScryptKey(plainPassword, storedSaltHex);
  const storedHashBuffer = Buffer.from(storedHashHex, "hex");

  if (derivedKey.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, storedHashBuffer);
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function computeHmacSignature(unsignedToken: string): Buffer {
  return createHmac("sha256", env.jwtSecret)
    .update(unsignedToken)
    .digest();
}

/**
 * Firma un token de sesión JWT (HMAC-SHA256) con identificador único jti
 * para permitir invalidación instantánea en Logout.
 */
export function signAuthToken(params: {
  readonly userId: string;
  readonly companyId: string;
}): { readonly token: string; readonly payload: AuthTokenPayload } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expSeconds = nowSeconds + env.jwtExpiresInHours * 3600;

  const header = {
    alg: "HS256" as const,
    typ: "JWT" as const,
  };

  const payload: AuthTokenPayload = {
    jti: randomUUID(),
    sub: params.userId,
    companyId: params.companyId,
    iat: nowSeconds,
    exp: expSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = computeHmacSignature(unsignedToken).toString("base64url");

  return {
    token: `${unsignedToken}.${signature}`,
    payload,
  };
}

/**
 * Verifica de forma estricta un token JWT (algoritmo HS256 fijo, firma en tiempo constante,
 * estructura de claims con Zod y ventana de expiración).
 */
export function verifyAuthToken(rawToken: string): AuthTokenPayload {
  if (rawToken.length === 0 || rawToken.length > MAX_TOKEN_LENGTH) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Token de autenticación inválido o malformado.",
    });
  }

  const segments = rawToken.split(".");
  if (segments.length !== 3) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Formato de token de autenticación inválido.",
    });
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined ||
    encodedHeader.length === 0 ||
    encodedPayload.length === 0 ||
    encodedSignature.length === 0
  ) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Segmentos de token de autenticación incompletos.",
    });
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignatureBuf = computeHmacSignature(unsignedToken);

  let providedSignatureBuf: Buffer;
  try {
    providedSignatureBuf = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Firma del token inválida.",
    });
  }

  if (
    providedSignatureBuf.length !== expectedSignatureBuf.length ||
    !timingSafeEqual(providedSignatureBuf, expectedSignatureBuf)
  ) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Firma criptográfica del token inválida.",
    });
  }

  let parsedHeader: unknown;
  let parsedPayload: unknown;
  try {
    parsedHeader = JSON.parse(base64UrlDecode(encodedHeader));
    parsedPayload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Contenido del token corrupto.",
    });
  }

  const headerValidation = jwtHeaderSchema.safeParse(parsedHeader);
  if (!headerValidation.success) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Algoritmo o cabecera de token no soportados.",
    });
  }

  const payloadValidation = authTokenPayloadSchema.safeParse(parsedPayload);
  if (!payloadValidation.success) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "Estructura de claims del token inválida.",
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payloadValidation.data.exp <= nowSeconds) {
    throw new AppError({
      statusCode: 401,
      errorCode: "UNAUTHORIZED",
      message: "La sesión ha expirado. Por favor, inicie sesión nuevamente.",
    });
  }

  return payloadValidation.data;
}

/**
 * Genera un código de seguimiento aleatorio criptográficamente seguro (ej. ORD-8F3K9A).
 * Previene enumeración secuencial de órdenes de otros clientes.
 */
export function generateSecureTicketCode(): string {
  let code = "";
  for (let i = 0; i < TICKET_RANDOM_LENGTH; i++) {
    const index = randomInt(0, TICKET_ALPHABET.length);
    const char = TICKET_ALPHABET[index];
    if (char !== undefined) {
      code += char;
    }
  }
  return `ORD-${code}`;
}
