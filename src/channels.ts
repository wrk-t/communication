// ════════════════════════════════════════════════════════════════
// CHANNEL CONTRACT
//
// One shape for anything the platform can send to a customer, and one
// result shape for what happened to it. Providers (SMTP, SMS) are
// implementations; callers (campaigns, test sends) never touch them
// directly.
//
// The result is deliberately honest: `sent` means the provider
// **accepted** the message, not that a human received it. `delivered`
// exists only in the receipt contract, because only a provider callback
// can tell us that (SMTP cannot).
// ════════════════════════════════════════════════════════════════

export const MESSAGE_CHANNELS = ["sms", "email"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

/**
 * Stable, provider-independent failure codes. A caller can branch on
 * these without knowing which provider produced them.
 */
export const SEND_ERROR_CODES = [
	/** The address/number cannot be sent to (bad number, refused recipient). */
	"invalid_recipient",
	/** The provider account has no credit left. */
	"insufficient_credit",
	/** The recipient or account is blocked by the provider. */
	"blocked",
	/** The provider is rate limiting; retry later, do not hammer it. */
	"rate_limited",
	/** Anything else on the provider side (auth, downtime, bad request). */
	"provider_error",
	/** The channel has no credentials configured, so nothing was attempted. */
	"not_configured",
] as const;
export type SendErrorCode = (typeof SEND_ERROR_CODES)[number];

export interface OutboundMessage {
	channel: MessageChannel;
	/** SMS: the phone number. Email: the address. */
	to: string;
	/** Email only. */
	subject?: string;
	/** Plain text. Email wraps it in a minimal HTML shell unless `html` is set. */
	body: string;
	/** Optional email alternative; already HTML. */
	html?: string;
	/** Email display name ("Rose & Bean" <no-reply@…>). */
	fromName?: string;
	/** Email reply-to. */
	replyTo?: string;
	/** SMS sender line under the platform account. */
	sender?: string;
	/**
	 * Tenant id and other correlation data. The transport is platform-wide;
	 * this is how a send is attributed for logging/rate accounting later.
	 */
	meta?: Record<string, unknown>;
}

export interface SendResult {
	/** Which implementation handled it: `smtp`, `kavenegar`, … */
	provider: string;
	/** The provider's own id for the message, when it returns one. */
	providerMessageId?: string | null;
	status: "sent" | "failed";
	errorCode?: SendErrorCode | null;
	errorMessage?: string | null;
}

export interface OutboundChannel {
	readonly channel: MessageChannel;
	readonly provider: string;
	send(message: OutboundMessage): Promise<SendResult>;
}

// ────────────────────────────────────────────────────────────────
// SMS provider seam
//
// A provider only knows how to push one message and normalize its own
// errors. Validation, the channel contract and the fake live above it.
// ────────────────────────────────────────────────────────────────

/** DI token the host app binds to its SMS provider. */
export const SMS_PROVIDER = "SMS_PROVIDER";

export interface SmsSendInput {
	/** Already normalized by `SmsChannel` (digits with optional `+`). */
	to: string;
	body: string;
	/** Tenant sender line; falls back to the provider's configured sender. */
	sender?: string;
}

export interface SmsProvider {
	readonly name: string;
	/** False when the channel has no credentials — sends fail fast. */
	readonly configured: boolean;
	send(input: SmsSendInput): Promise<SendResult>;
}

// ────────────────────────────────────────────────────────────────
// Receipts (DLR) — what happened *after* the provider accepted
//
// Only a provider callback can say "delivered"; this is its normalized
// shape. Parsing is pure so it can be unit-tested against captured
// payloads, and the host app decides what to do with the result.
// ────────────────────────────────────────────────────────────────

export type ReceiptStatus = "delivered" | "failed";

export interface DeliveryReceipt {
	provider: string;
	providerMessageId: string;
	status: ReceiptStatus;
	errorCode?: SendErrorCode | null;
	errorMessage?: string | null;
	occurredAt: Date;
}

export type ReceiptParseFailure =
	| "unknown_provider"
	| "malformed"
	/** The provider reported an intermediate state (queued, sent to network). */
	| "not_final";

export type ReceiptParseResult =
	| { ok: true; receipt: DeliveryReceipt }
	| { ok: false; reason: ReceiptParseFailure; detail?: string };
