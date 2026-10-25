// biome-ignore lint/performance/noBarrelFile: the package's single public entry point.
export {
	type DeliveryReceipt,
	MESSAGE_CHANNELS,
	type MessageChannel,
	type OutboundChannel,
	type OutboundMessage,
	type ReceiptParseFailure,
	type ReceiptParseResult,
	type ReceiptStatus,
	SEND_ERROR_CODES,
	type SendErrorCode,
	type SendResult,
	SMS_PROVIDER,
	type SmsProvider,
	type SmsSendInput,
} from "./channels";
export type {
	ICommunicationConfig,
	ISendMailOptions,
	IVerificationMailOptions,
} from "./communication.service";
export { CommunicationService } from "./communication.service";
export { escapeHtml, renderEmailHtml } from "./email-body";
export {
	parseKavenegarReceipt,
	parseReceipt,
} from "./receipts";
export { FakeSmsProvider, type IRecordedSms } from "./sms/fake.provider";
export {
	type IKavenegarConfig,
	KavenegarSmsProvider,
	normalizeKavenegarErrorCode,
} from "./sms/kavenegar.provider";
export {
	normalizeSmsRecipient,
	SmsChannel,
} from "./sms/sms.channel";
export { UnconfiguredSmsProvider } from "./sms/unconfigured.provider";
