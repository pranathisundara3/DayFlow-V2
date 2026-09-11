import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly client: Resend | null;
  private readonly fromAddress: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.fromAddress = this.config.get<string>('MAIL_FROM_ADDRESS', 'DayFlow <onboarding@resend.dev>');
    this.client = apiKey ? new Resend(apiKey) : null;
    if (!this.client) {
      console.warn('RESEND_API_KEY is not configured. Password reset emails will not be sent.');
    }
  }

  async sendPasswordResetEmail(to: string, resetLink: string) {
    if (!this.client) return;
    try {
      await this.client.emails.send({
        from: this.fromAddress,
        to,
        subject: 'Reset your DayFlow password',
        html: `<p>We received a request to reset your DayFlow password.</p><p><a href="${resetLink}">Click here to choose a new password</a></p><p>This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email.</p>`,
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
    }
  }
}
