import type { SendMailOptions, Transporter } from "nodemailer";
import { createTransport } from "nodemailer";
import type { MessageChannel, OutboundMessage, SendResult } from "./channels";
import { renderEmailHtml } from "./email-body";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export interface ICommunicationConfig {
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
	defaultFrom: string;
}

export interface ISendMailOptions {
	to: string;
	subject: string;
	text: string;
	html?: string;
	/** Display name for the From header ("Rose & Bean" <no-reply@…>). */
	fromName?: string;
	replyTo?: string;
}

export interface IVerificationMailOptions {
	to: string;
	token: string;
	frontendUrl: string;
}

// ──────────────────────────────────────────────────────────────────
// CommunicationService — the SMTP transport, also an email channel
//
// `sendMail` stays the low-level API auth already uses; `send()` is the
// channel-contract view of it, returning a normalized result instead of
// throwing. SMTP can only report **accepted** or **rejected**: a `sent`
// here is not proof of delivery (see `DeliveryReceipt` for that).
// ──────────────────────────────────────────────────────────────────

export class CommunicationService {
	readonly channel: MessageChannel = "email";
	readonly provider = "smtp";

	private readonly transporter: Transporter;
	private readonly defaultFrom: string;

	constructor(config: ICommunicationConfig) {
		this.defaultFrom = config.defaultFrom;
		this.transporter = createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: {
				user: config.username,
				pass: config.password,
			},
		});
	}

	/**
	 * Send a plain email.
	 */
	sendMail(options: ISendMailOptions) {
		const mailOptions: SendMailOptions = {
			from: options.fromName
				? `"${sanitizeDisplayName(options.fromName)}" <${this.defaultFrom}>`
				: this.defaultFrom,
			to: options.to,
			subject: options.subject,
			text: options.text,
		};

		if (options.html) {
			mailOptions.html = options.html;
		}
		if (options.replyTo) {
			mailOptions.replyTo = options.replyTo;
		}

		return this.transporter.sendMail(mailOptions);
	}

	/**
	 * The channel-contract view of `sendMail`: never throws, always reports.
	 */
	async send(message: OutboundMessage): Promise<SendResult> {
		const to = message.to?.trim();
		if (!to) {
			return {
				provider: this.provider,
				status: "failed",
				errorCode: "invalid_recipient",
				errorMessage: "Email recipient is empty",
			};
		}

		try {
			const info = await this.sendMail({
				to,
				subject: message.subject ?? "",
				text: message.body,
				// A tenant writes text; the shell is ours. A caller that
				// already has HTML passes it explicitly.
				html: message.html ?? renderEmailHtml(message.body),
				...(message.fromName ? { fromName: message.fromName } : {}),
				...(message.replyTo ? { replyTo: message.replyTo } : {}),
			});

			return {
				provider: this.provider,
				providerMessageId: info?.messageId ?? null,
				status: "sent",
			};
		} catch (error) {
			return this.mapError(error);
		}
	}

	/**
	 * Send an email verification link.
	 */
	sendVerificationEmail(options: IVerificationMailOptions) {
		const link = `${options.frontendUrl}/verify-email?token=${options.token}`;

		return this.sendMail({
			to: options.to,
			subject: "Verify your email",
			text: `Please verify your email address by clicking the link below:\n\n${link}\n\nThis link will expire in 24 hours.`,
		});
	}

	/**
	 * Send a password reset link.
	 */
	sendPasswordResetEmail(options: IVerificationMailOptions) {
		const link = `${options.frontendUrl}/reset-password?token=${options.token}`;

		return this.sendMail({
			to: options.to,
			subject: "Reset your password",
			text: `You requested a password reset. Click the link below to reset your password:\n\n${link}\n\nThis link will expire in 1 hour.\n\nIf you did not request this, please ignore this email.`,
		});
	}

	/**
	 * Verify the SMTP connection is working.
	 */
	async verifyConnection(): Promise<boolean> {
		try {
			await this.transporter.verify();
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * SMTP errors are all transport-level except a refused recipient, which
	 * nodemailer reports as `EENVELOPE`. Everything else is `provider_error`.
	 */
	private mapError(error: unknown): SendResult {
		const code = (error as { code?: string } | null)?.code;
		const message =
			error instanceof Error ? error.message : String(error ?? "unknown");

		return {
			provider: this.provider,
			status: "failed",
			errorCode: code === "EENVELOPE" ? "invalid_recipient" : "provider_error",
			errorMessage: message,
		};
	}
}

/** Quotes/backslashes would break the From header. */
function sanitizeDisplayName(name: string): string {
	return name.replace(/["\\\r\n]/g, "").trim();
}
