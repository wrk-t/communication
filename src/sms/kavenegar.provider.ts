import type {
	SendErrorCode,
	SendResult,
	SmsProvider,
	SmsSendInput,
} from "../channels";

// ════════════════════════════════════════════════════════════════
// KAVENEGAR — the SMS provider
//
// One provider, chosen for the Iranian market. Plain `fetch`, no SDK: the
// API is one GET with a key in the path, and a wrapper would only hide the
// failure modes we need to normalize anyway.
//
// Kavenegar answers **HTTP 200 with an error status inside the body** for
// most failures, so the body's `return.status` is the real status. The
// numbers below are Kavenegar's documented codes; anything unrecognized
// becomes `provider_error` rather than being guessed into a specific bucket.
// ════════════════════════════════════════════════════════════════

export interface IKavenegarConfig {
	apiKey: string;
	/** Platform sender line; a tenant may override it per message. */
	sender: string;
	/** Defaults to https://api.kavenegar.com */
	baseUrl?: string;
	/** Per-request timeout in ms (default 10s). */
	timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.kavenegar.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const TRAILING_SLASHES = /\/+$/;

/**
 * Kavenegar `return.status` → our stable code.
 *
 * - 400/411/422: the request or the recipient is unusable
 * - 401/403/409: the account/key is not allowed to send
 * - 402: no credit
 * - 412/413: rate limiting
 */
const KAVENEGAR_ERROR_CODES: Record<number, SendErrorCode> = {
	400: "invalid_recipient",
	401: "provider_error",
	402: "insufficient_credit",
	403: "provider_error",
	409: "provider_error",
	411: "invalid_recipient",
	412: "rate_limited",
	413: "rate_limited",
	414: "rate_limited",
	422: "invalid_recipient",
	429: "rate_limited",
};

export function normalizeKavenegarErrorCode(status: number): SendErrorCode {
	return KAVENEGAR_ERROR_CODES[status] ?? "provider_error";
}

interface KavenegarReturn {
	status?: number;
	message?: string;
}

interface KavenegarResponse {
	return?: KavenegarReturn;
	entries?: Array<{ messageid?: number | string; status?: number }>;
}

export class KavenegarSmsProvider implements SmsProvider {
	readonly name = "kavenegar";
	readonly configured = true;

	private readonly baseUrl: string;
	private readonly timeoutMs: number;

	constructor(private readonly config: IKavenegarConfig) {
		this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(
			TRAILING_SLASHES,
			"",
		);
		this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	async send(input: SmsSendInput): Promise<SendResult> {
		const params = new URLSearchParams({
			receptor: input.to,
			message: input.body,
		});

		const sender = input.sender?.trim() || this.config.sender;
		if (sender) params.set("sender", sender);

		const url = `${this.baseUrl}/v1/${encodeURIComponent(this.config.apiKey)}/sms/send.json?${params.toString()}`;

		let response: Response;
		try {
			response = await fetch(url, {
				method: "GET",
				signal: AbortSignal.timeout(this.timeoutMs),
			});
		} catch (error) {
			return {
				provider: this.name,
				status: "failed",
				errorCode: "provider_error",
				errorMessage:
					error instanceof Error ? error.message : "SMS provider unreachable",
			};
		}

		const payload = await readJson(response);
		const bodyStatus = payload?.return?.status ?? response.status;
		const bodyMessage = payload?.return?.message;

		if (response.ok && bodyStatus === 200) {
			const entry = payload?.entries?.[0];
			return {
				provider: this.name,
				status: "sent",
				providerMessageId:
					entry?.messageid === undefined || entry?.messageid === null
						? null
						: String(entry.messageid),
			};
		}

		return {
			provider: this.name,
			status: "failed",
			errorCode: normalizeKavenegarErrorCode(bodyStatus),
			errorMessage: bodyMessage || `SMS provider responded ${bodyStatus}`,
		};
	}
}

async function readJson(response: Response): Promise<KavenegarResponse | null> {
	try {
		return (await response.json()) as KavenegarResponse;
	} catch {
		return null;
	}
}
