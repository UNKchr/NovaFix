export type HttpStatusCode =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 413
  | 422
  | 429
  | 500
  | 503;

export type AppErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_TICKET_CODE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNPROCESSABLE_ENTITY"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface AppErrorOptions {
  readonly statusCode: HttpStatusCode;
  readonly errorCode: AppErrorCode;
  readonly message: string;
  readonly details?: ReadonlyArray<string> | undefined;
  readonly isOperational?: boolean | undefined;
}

export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly errorCode: AppErrorCode;
  public readonly isOperational: boolean;
  public readonly details: ReadonlyArray<string> | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  public static badRequest(
    message: string,
    details?: ReadonlyArray<string>,
    errorCode: AppErrorCode = "BAD_REQUEST"
  ): AppError {
    return new AppError({
      statusCode: 400,
      errorCode,
      message,
      details,
      isOperational: true,
    });
  }

  public static validation(
    message: string,
    details?: ReadonlyArray<string>
  ): AppError {
    return new AppError({
      statusCode: 422,
      errorCode: "VALIDATION_ERROR",
      message,
      details,
      isOperational: true,
    });
  }

  public static notFound(
    message: string,
    errorCode: AppErrorCode = "NOT_FOUND"
  ): AppError {
    return new AppError({
      statusCode: 404,
      errorCode,
      message,
      isOperational: true,
    });
  }

  public static conflict(message: string): AppError {
    return new AppError({
      statusCode: 409,
      errorCode: "CONFLICT",
      message,
      isOperational: true,
    });
  }

  public static internal(
    message = "Ha ocurrido un error interno en el servidor. Intente nuevamente más tarde."
  ): AppError {
    return new AppError({
      statusCode: 500,
      errorCode: "INTERNAL_SERVER_ERROR",
      message,
      isOperational: false,
    });
  }
}
