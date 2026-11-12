import type { SetupDraft } from '@shared/contract'

export declare const OWNER: { username: string; displayName: string; password: string; pin: string }
export declare const RECEPTION: { username: string; displayName: string; password: string }
export declare function draftFrom(options: unknown): SetupDraft
