import type { SendResult, SmsProvider, SmsSendInput } from "../channels";

// ════════════════════════════════════════════════════════════════
// UNCONFIGURED SMS PROVIDER
//
// What the app binds when no `SMS_*` credentials exist. SMS is an optional
// channel: a deployment without an account must still boot (email/auth keep
// working), and a send must fail honestly with `not_configured` instead of
// throwing or pretending it went out.
// ════════════════════════════════════════════════════════════════

export class UnconfiguredSmsProvider implements SmsProvider {
	readonly name = "none";
	readonly configured = false;

	send(_input: SmsSendInput): Promise<SendResult> {
		return Promise.resolve({
			provider: this.name,
			status: "failed",
			errorCode: "not_configured",
			errorMessage: "The SMS channel has no credentials configured",
		});
	}
}
