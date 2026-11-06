export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly message: string;
  readonly data: T;
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
  readonly timestamp?: string;
}

export interface ApiErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: ApiErrorDetail;
}
