import type { SendResult, SmsProvider, SmsSendInput } from "../channels";

// ════════════════════════════════════════════════════════════════
// FAKE SMS PROVIDER — deterministic tests, no network
//
// Records every attempt so a test can assert *what* was sent, and can be
// primed with results so the failure paths (no credit, rate limit, bad
// number) are exercised without touching a real provider.
// ════════════════════════════════════════════════════════════════

export interface IRecordedSms {
	input: SmsSendInput;
	result: SendResult;
}

export class FakeSmsProvider implements SmsProvider {
	readonly name = "fake-sms";

	/** Every attempted send, in order. Reset between tests. */
	readonly sends: IRecordedSms[] = [];

	/** Set false to simulate an unconfigured channel. */
	configured = true;

	private readonly queued: SendResult[] = [];

	/** Prime the next send(s) with a specific result. */
	queueResult(result: SendResult): void {
		this.queued.push(result);
	}

	/** Prime the next send to fail with a code. */
	queueFailure(
		errorCode: NonNullable<SendResult["errorCode"]>,
		errorMessage = "queued failure",
	): void {
		this.queued.push({
			provider: this.name,
			status: "failed",
			errorCode,
			errorMessage,
		});
	}

	reset(): void {
		this.sends.length = 0;
		this.queued.length = 0;
		this.configured = true;
	}

	send(input: SmsSendInput): Promise<SendResult> {
		const result: SendResult = this.queued.shift() ?? {
			provider: this.name,
			status: "sent",
			providerMessageId: `fake-${this.sends.length + 1}`,
		};

		this.sends.push({ input, result });
		return Promise.resolve(result);
	}
}
