/** Shared client + server validation rules for merchant onboarding. */

export const PHONE_RE = /^[6-9]\d{9}$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const PINCODE_RE = /^\d{6}$/;
export const PIN_RE = /^\d{4}$/;
export const OTP_RE = /^\d{6}$/;

export const digitsOnly = (v: string) => v.replace(/\D/g, "");
export const upperAlnum = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

export function validatePhone(v: string): string | null {
  if (!v) return "Mobile number is required";
  if (!PHONE_RE.test(v)) return "Enter a valid 10-digit number starting with 6-9";
  return null;
}

export function validateGstin(v: string): string | null {
  if (!v) return "GSTIN is required";
  if (v.length !== 15) return "GSTIN must be 15 characters";
  if (!GSTIN_RE.test(v)) return "That doesn't look like a valid GSTIN";
  return null;
}

export function validatePan(v: string): string | null {
  if (!v) return "PAN number is required";
  if (!PAN_RE.test(v)) return "PAN must look like ABCDE1234F";
  return null;
}

export function validateIfsc(v: string): string | null {
  if (!v) return "IFSC code is required";
  if (!IFSC_RE.test(v)) return "IFSC must look like HDFC0001234";
  return null;
}

export function validatePincode(v: string): string | null {
  if (!v) return "Pincode is required";
  if (!PINCODE_RE.test(v)) return "Pincode must be 6 digits";
  return null;
}

export function required(v: string, label: string): string | null {
  return v.trim().length ? null : `${label} is required`;
}
