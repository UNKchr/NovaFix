import type { AppErrorCode } from "../errors/app-error.js";

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
  readonly meta?: Readonly<Record<string, string | number | boolean>> | undefined;
  readonly timestamp: string;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: AppErrorCode;
    readonly message: string;
    readonly details?: ReadonlyArray<string> | undefined;
  };
  readonly timestamp: string;
}

export function buildSuccessResponse<T>(
  data: T,
  message = "Operación completada exitosamente.",
  meta?: Readonly<Record<string, string | number | boolean>>
): ApiSuccessResponse<T> {
  return {
    success: true,
    message,
    data,
    ...(meta !== undefined ? { meta } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function buildErrorResponse(
  code: AppErrorCode,
  message: string,
  details?: ReadonlyArray<string>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined && details.length > 0 ? { details } : {}),
    },
    timestamp: new Date().toISOString(),
  };
}
