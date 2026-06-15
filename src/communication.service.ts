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

// ──────────────────────────────────────────────────────────────────
// CommunicationService
// ──────────────────────────────────────────────────────────────────

export class CommunicationService {
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

		return this.transporter.sendMail(mailOptions);
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
