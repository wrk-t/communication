import { Logger } from "@nestjs/common";
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

export interface IInvitationMailOptions {
	to: string;
	tenantName?: string | null;
	roleName?: string | null;
	frontendUrl: string;
	/**
	 * Set when the address is not a user yet: the recipient must create the
	 * account, so the email carries an accept link (`[[147-task]]`). Without a
	 * token the mail is the "you were added, sign in" notice it always was.
	 */
	token?: string | null;
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

	private static readonly logger = new Logger("CommunicationService");
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

		// Log what the SMTP server ANSWERED, not just that we tried: "no email
		// arrived" is otherwise indistinguishable from "we never sent it"
		// ([[147-task]]). `accepted`/`rejected` and the messageId are what a mail
		// provider needs to trace a message that left us and did not land.
		const info = await this.transporter.sendMail(mailOptions);
		CommunicationService.logger.log(
			`mail to ${options.to}: messageId=${info?.messageId} accepted=${JSON.stringify(
				info?.accepted ?? [],
			)} rejected=${JSON.stringify(info?.rejected ?? [])} response=${
				info?.response ?? ""
			}`,
		);
		return info;
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
	 * Send a tenant invitation email.
	 */
	async sendInvitationEmail(options: IInvitationMailOptions) {
		const tenantPart = options.tenantName ? ` to ${options.tenantName}` : "";
		const rolePart = options.roleName ? ` as ${options.roleName}` : "";

		// An invited address has no account yet, so the link is what creates it;
		// an existing user just signs in and reviews the pending membership.
		const link = options.token
			? `${options.frontendUrl}/accept-invitation?token=${options.token}`
			: `${options.frontendUrl}/dashboard`;
		const action = options.token
			? "Accept the invitation and set your password"
			: "Sign in to review and accept the invitation";

		return this.sendMail({
			to: options.to,
			subject: "You've been invited to join a workspace",
			text: `You have been invited${tenantPart}${rolePart} on the platform.\n\n${action}:\n${link}\n\nIf you did not expect this invitation, you can ignore this email.`,
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
