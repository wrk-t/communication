import type {
	DeliveryReceipt,
	ReceiptParseResult,
	SendErrorCode,
} from "./channels";

// ════════════════════════════════════════════════════════════════
// RECEIPTS — normalizing provider delivery callbacks
//
// Pure parsing, so it can be tested against captured payloads and reused by
// whichever receiver the host app exposes. A provider reports intermediate
// states too ("queued", "handed to the network"); those are `not_final`, not
// delivery. An **unknown** status is rejected as malformed rather than
// guessed — recording the wrong delivery state is worse than recording none.
// ════════════════════════════════════════════════════════════════

/**
 * Kavenegar's delivery statuses.
 *
 * 1/2/4 are intermediate (queued, scheduled, handed to the telco), 5 is the
 * handset confirmation, and the rest are terminal failures.
 */
const KAVENEGAR_STATUS: Record<
	number,
	| { final: false }
	| { final: true; delivered: boolean; errorCode?: SendErrorCode }
> = {
	1: { final: false },
	2: { final: false },
	4: { final: false },
	5: { final: true, delivered: true },
	6: { final: true, delivered: false, errorCode: "provider_error" },
	10: { final: true, delivered: false, errorCode: "provider_error" },
	11: { final: true, delivered: false, errorCode: "invalid_recipient" },
	13: { final: true, delivered: false, errorCode: "provider_error" },
	15: { final: true, delivered: false, errorCode: "provider_error" },
	16: { final: true, delivered: false, errorCode: "blocked" },
};

export function parseKavenegarReceipt(
	payload: Record<string, unknown>,
): ReceiptParseResult {
	const messageId = toText(payload.messageid ?? payload.messageId);
	if (!messageId) {
		return { ok: false, reason: "malformed", detail: "messageid missing" };
	}

	const rawStatus = Number(payload.status);
	if (!Number.isFinite(rawStatus)) {
		return { ok: false, reason: "malformed", detail: "status missing" };
	}

	const mapping = KAVENEGAR_STATUS[rawStatus];
	if (!mapping) {
		return {
			ok: false,
			reason: "malformed",
			detail: `unknown status ${rawStatus}`,
		};
	}
	if (!mapping.final) {
		return { ok: false, reason: "not_final", detail: `status ${rawStatus}` };
	}

	const receipt: DeliveryReceipt = {
		provider: "kavenegar",
		providerMessageId: messageId,
		status: mapping.delivered ? "delivered" : "failed",
		...(mapping.delivered
			? {}
			: {
					errorCode: mapping.errorCode ?? "provider_error",
					errorMessage: toText(payload.statustext) ?? null,
				}),
		occurredAt: parseOccurredAt(payload.date),
	};

	return { ok: true, receipt };
}

/**
 * Parse a provider receipt by name. Unknown providers are a caller error
 * (the route names the provider), not a silent success.
 */
export function parseReceipt(
	provider: string,
	payload: Record<string, unknown>,
): ReceiptParseResult {
	if (provider === "kavenegar") return parseKavenegarReceipt(payload);
	return { ok: false, reason: "unknown_provider", detail: provider };
}

function toText(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const text = String(value).trim();
	return text === "" ? null : text;
}

/** Kavenegar sends unix seconds; a missing/odd date falls back to now. */
function parseOccurredAt(value: unknown): Date {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) return new Date();
	return new Date(seconds * 1000);
}
