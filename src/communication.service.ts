import { Logger } from "@nestjs/common";
import type { SendMailOptions, Transporter } from "nodemailer";
import { createTransport } from "nodemailer";

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
// CommunicationService
// ──────────────────────────────────────────────────────────────────

export class CommunicationService {
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
	async sendMail(options: ISendMailOptions) {
		const mailOptions: SendMailOptions = {
			from: this.defaultFrom,
			to: options.to,
			subject: options.subject,
			text: options.text,
		};

		if (options.html) {
			mailOptions.html = options.html;
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
	 * Send an email verification link.
	 */
	async sendVerificationEmail(options: IVerificationMailOptions) {
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
	async sendPasswordResetEmail(options: IVerificationMailOptions) {
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
}
