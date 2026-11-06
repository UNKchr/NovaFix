import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Blocks ASCII control characters (\x00-\x1F, \x7F) and HTML angle brackets (<, >)
 * to mirror the backend's zSanitizedString schema and prevent XSS injection vectors.
 */
const UNSAFE_CHARS_REGEX = /[\x00-\x1F\x7F<>]/;

/**
 * Standard RFC-compliant email structure check without whitespace or angle brackets.
 */
const STRICT_EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

/**
 * Standard UUID format check (v1-v8).
 */
const STRICT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Strict TicketCode format check (^ORD-[A-Z0-9]{4,8}$).
 */
export const STRICT_TICKET_CODE_REGEX = /^ORD-[A-Z0-9]{4,8}$/;

const CRYPTO_ALPHABET_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CRYPTO_ALPHABET_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const CRYPTO_ALPHABET_DIGITS = '23456789';
const CRYPTO_ALPHABET_ALL =
  CRYPTO_ALPHABET_UPPER + CRYPTO_ALPHABET_LOWER + CRYPTO_ALPHABET_DIGITS;

export interface PasswordRequirementsChecklist {
  readonly minLengthMet: boolean;
  readonly maxLengthMet: boolean;
  readonly hasLetter: boolean;
  readonly hasNumber: boolean;
  readonly isValid: boolean;
}

export function evaluatePasswordChecklist(rawPassword: string): PasswordRequirementsChecklist {
  const minLengthMet = rawPassword.length >= 8;
  const maxLengthMet = rawPassword.length <= 72;
  const hasLetter = /[A-Za-z]/.test(rawPassword);
  const hasNumber = /[0-9]/.test(rawPassword);

  return {
    minLengthMet,
    maxLengthMet,
    hasLetter,
    hasNumber,
    isValid: minLengthMet && maxLengthMet && hasLetter && hasNumber,
  };
}

export function isValidTicketCode(raw: string): boolean {
  return STRICT_TICKET_CODE_REGEX.test(raw.trim().toUpperCase());
}

/**
 * Generates an unambiguous 16-character alphanumeric password using Web Crypto CSPRNG
 * guaranteed to satisfy strongPasswordValidator() without shell-problematic special chars.
 */
export function generateCryptographicPassword(length = 16): string {
  const safeLength = Math.max(12, Math.min(32, length));
  const randomBytes = new Uint32Array(safeLength);
  globalThis.crypto.getRandomValues(randomBytes);

  const chars: string[] = [
    CRYPTO_ALPHABET_UPPER[randomBytes[0]! % CRYPTO_ALPHABET_UPPER.length]!,
    CRYPTO_ALPHABET_LOWER[randomBytes[1]! % CRYPTO_ALPHABET_LOWER.length]!,
    CRYPTO_ALPHABET_DIGITS[randomBytes[2]! % CRYPTO_ALPHABET_DIGITS.length]!,
  ];

  for (let i = 3; i < safeLength; i++) {
    const byte = randomBytes[i]!;
    chars.push(CRYPTO_ALPHABET_ALL[byte % CRYPTO_ALPHABET_ALL.length]!);
  }

  // Fisher-Yates shuffle using CSPRNG
  const shuffleBytes = new Uint32Array(chars.length);
  globalThis.crypto.getRandomValues(shuffleBytes);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBytes[i]! % (i + 1);
    const temp = chars[i]!;
    chars[i] = chars[j]!;
    chars[j] = temp;
  }

  return chars.join('');
}

export function sanitizedTextValidator(minLength: number, maxLength: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawValue = typeof control.value === 'string' ? control.value : '';
    const trimmed = rawValue.trim();

    if (trimmed.length === 0) {
      return { required: true };
    }
    if (UNSAFE_CHARS_REGEX.test(trimmed)) {
      return { unsafeCharacters: true };
    }
    if (trimmed.length < minLength) {
      return { minlength: { requiredLength: minLength, actualLength: trimmed.length } };
    }
    if (trimmed.length > maxLength) {
      return { maxlength: { requiredLength: maxLength, actualLength: trimmed.length } };
    }
    return null;
  };
}

export function optionalSanitizedTextValidator(
  minLength: number,
  maxLength: number,
): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawValue = typeof control.value === 'string' ? control.value : '';
    const trimmed = rawValue.trim();

    if (trimmed.length === 0) {
      return null;
    }
    if (UNSAFE_CHARS_REGEX.test(trimmed)) {
      return { unsafeCharacters: true };
    }
    if (trimmed.length < minLength) {
      return { minlength: { requiredLength: minLength, actualLength: trimmed.length } };
    }
    if (trimmed.length > maxLength) {
      return { maxlength: { requiredLength: maxLength, actualLength: trimmed.length } };
    }
    return null;
  };
}

export function strictEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawValue = typeof control.value === 'string' ? control.value : '';
    const normalized = rawValue.trim().toLowerCase();

    if (normalized.length === 0) {
      return { required: true };
    }
    if (normalized.length > 150) {
      return { maxlength: { requiredLength: 150, actualLength: normalized.length } };
    }
    if (!STRICT_EMAIL_REGEX.test(normalized)) {
      return { email: true };
    }
    return null;
  };
}

export function uuidValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawValue = typeof control.value === 'string' ? control.value.trim() : '';
    if (rawValue.length === 0) {
      return { required: true };
    }
    if (!STRICT_UUID_REGEX.test(rawValue)) {
      return { invalidUuid: true };
    }
    return null;
  };
}

export function ticketCodeValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawValue = typeof control.value === 'string' ? control.value.trim().toUpperCase() : '';
    if (rawValue.length === 0) {
      return { required: true };
    }
    if (!STRICT_TICKET_CODE_REGEX.test(rawValue)) {
      return { invalidTicketCode: true };
    }
    return null;
  };
}

export function strongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawPassword = typeof control.value === 'string' ? control.value : '';

    if (rawPassword.length === 0) {
      return { required: true };
    }

    const checklist = evaluatePasswordChecklist(rawPassword);
    if (checklist.isValid) {
      return null;
    }

    const errors: ValidationErrors = {};
    if (!checklist.minLengthMet) {
      errors['tooShort'] = true;
    }
    if (!checklist.maxLengthMet) {
      errors['tooLong'] = true;
    }
    if (!checklist.hasLetter) {
      errors['missingLetter'] = true;
    }
    if (!checklist.hasNumber) {
      errors['missingNumber'] = true;
    }
    return errors;
  };
}

export function optionalStrongPasswordValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const rawPassword = typeof control.value === 'string' ? control.value : '';
    if (rawPassword.length === 0) {
      return null;
    }
    return strongPasswordValidator()(control);
  };
}
