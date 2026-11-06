import { z, type ZodType } from "zod";
import { AppError } from "../errors/app-error.js";

/**
 * Expresión regular estricta para códigos de seguimiento de órdenes.
 * Ejemplo válido: ORD-8F3K9A (de 4 a 8 caracteres alfanuméricos en mayúscula tras el prefijo ORD-).
 * Previene inyección de claves en Redis y ataques de enumeración secuencial.
 */
export const TICKET_CODE_REGEX = /^ORD-[A-Z0-9]{4,8}$/;

/**
 * Caracteres de control ASCII no imprimibles.
 */
const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Etiquetas HTML/XML para prevenir Cross-Site Scripting (XSS) almacenado.
 */
const HTML_TAGS_REGEX = /<[^>]*>/g;

/**
 * Conjunto de llaves prohibidas para evitar Prototype Pollution.
 */
const FORBIDDEN_OBJECT_KEYS: ReadonlySet<string> = new Set<string>([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Limpia caracteres de control, elimina etiquetas HTML y normaliza espacios.
 */
export function sanitizePlainText(raw: string): string {
  return raw
    .replace(CONTROL_CHARS_REGEX, "")
    .replace(HTML_TAGS_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Helper de esquema Zod para cadenas de texto obligatorias sanitizadas contra XSS.
 */
export function zSanitizedString(
  fieldName: string,
  minLength: number,
  maxLength: number
): z.ZodType<string, string> {
  return z
    .string({
      message: `El campo "${fieldName}" es obligatorio y debe ser texto.`,
    })
    .transform((val) => sanitizePlainText(val))
    .refine(
      (val) => val.length >= minLength,
      `El campo "${fieldName}" debe tener al menos ${minLength} caracteres válidos.`
    )
    .refine(
      (val) => val.length <= maxLength,
      `El campo "${fieldName}" no puede exceder los ${maxLength} caracteres.`
    );
}

/**
 * Verifica que un objeto no contenga llaves peligrosas (__proto__, constructor, prototype)
 * y ejecuta un esquema Zod estricto convirtiendo cualquier fallo en AppError.
 */
export function parseWithZod<T>(schema: ZodType<T>, payload: unknown): T {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    for (const key of Object.keys(payload)) {
      if (FORBIDDEN_OBJECT_KEYS.has(key)) {
        throw AppError.badRequest(
          `Propiedad prohibida detectada en la solicitud: "${key}".`
        );
      }
    }
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    });
    const firstMessage =
      details[0] ?? "Los datos enviados no cumplen con el formato requerido.";
    throw AppError.validation(firstMessage, details);
  }

  return result.data;
}

/**
 * Valida y normaliza el código de ticket (ticketCode) bajo formato estricto ^ORD-[A-Z0-9]{4,8}$.
 */
export function validateTicketCode(rawTicketCode: unknown): string {
  if (typeof rawTicketCode !== "string") {
    throw AppError.badRequest(
      "El código de seguimiento (ticketCode) es obligatorio y debe ser texto.",
      undefined,
      "INVALID_TICKET_CODE"
    );
  }

  const normalized = rawTicketCode.trim().toUpperCase();

  if (!TICKET_CODE_REGEX.test(normalized)) {
    throw AppError.badRequest(
      "Formato de código de seguimiento inválido. Debe cumplir el patrón ORD-XXXXXX (4 a 8 caracteres alfanuméricos).",
      undefined,
      "INVALID_TICKET_CODE"
    );
  }

  return normalized;
}

/**
 * Construye de forma segura la clave de caché en Redis para una orden.
 * Siempre valida primero el ticketCode para impedir Key Injection.
 */
export function buildOrderCacheKey(ticketCode: string): string {
  const safeTicketCode = validateTicketCode(ticketCode);
  return `order:${safeTicketCode}`;
}
