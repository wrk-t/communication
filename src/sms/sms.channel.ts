import type {
	MessageChannel,
	OutboundChannel,
	OutboundMessage,
	SendResult,
	SmsProvider,
} from "../channels";

// ════════════════════════════════════════════════════════════════
// SMS CHANNEL — validation and the channel contract
//
// The channel owns what is common to every SMS provider: a recipient must
// look like a phone number, an unconfigured provider fails fast instead of
// pretending, and the tenant's sender line is passed through. Provider
// errors are already normalized by the provider itself.
// ════════════════════════════════════════════════════════════════

/** Digits with an optional leading `+`; separators are stripped first. */
const SMS_RECIPIENT = /^\+?[0-9]{6,20}$/;

export function normalizeSmsRecipient(
	raw: string | null | undefined,
): string | null {
	if (!raw) return null;
	const value = raw.replace(/[\s\-().]/g, "");
	return SMS_RECIPIENT.test(value) ? value : null;
}

export class SmsChannel implements OutboundChannel {
	readonly channel: MessageChannel = "sms";

	constructor(private readonly sms: SmsProvider) {}

	/** The provider's stable name (`kavenegar`, `fake-sms`, …). */
	get provider(): string {
		return this.sms.name;
	}

	send(message: OutboundMessage): Promise<SendResult> {
		if (!this.sms.configured) {
			return Promise.resolve({
				provider: this.sms.name,
				status: "failed",
				errorCode: "not_configured",
				errorMessage: "The SMS channel has no credentials configured",
			});
		}

		const to = normalizeSmsRecipient(message.to);
		if (!to) {
			return Promise.resolve({
				provider: this.sms.name,
				status: "failed",
				errorCode: "invalid_recipient",
				errorMessage: "Not a usable phone number",
			});
		}

		return this.sms.send({
			to,
			body: message.body,
			...(message.sender ? { sender: message.sender } : {}),
		});
	}
}
