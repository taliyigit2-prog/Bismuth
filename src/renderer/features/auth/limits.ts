/**
 * Wrong tries in a row before the account locks, and for how long (G-144). Keep in sync with the auth service's
 * defaults (src/main/services/auth-service.ts: maxFailedAttempts 5, lockMinutes 15).
 */
export const SIGN_IN_LIMITS = { attempts: 5, minutes: 15 }
