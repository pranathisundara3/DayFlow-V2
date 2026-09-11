import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { Model } from 'mongoose';
import { ChangeEmailDto, ChangePasswordDto, LoginDto, RegisterDto } from './dto/auth.dto';
import { MailService } from './mail.service';
import { PasswordResetToken, PasswordResetTokenDocument } from './schemas/password-reset-token.schema';
import { RefreshSession, RefreshSessionDocument } from './schemas/refresh-session.schema';
import { UsersService } from '../users/users.service';

const PASSWORD_RESET_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectModel(RefreshSession.name) private readonly sessions: Model<RefreshSessionDocument>,
    @InjectModel(PasswordResetToken.name) private readonly resetTokens: Model<PasswordResetTokenDocument>,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.findByEmail(dto.email)) throw new ConflictException('Email is already registered');
    const user = await this.users.create({ email: dto.email.toLowerCase(), username: dto.username.trim(), passwordHash: await bcrypt.hash(dto.password, 12), isAnonymous: false });
    return this.issueTokens(user._id.toString(), user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findByEmail(dto.email);
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid email or password');
    return this.issueTokens(user._id.toString(), user.email);
  }

  async guest() {
    const user = await this.users.create({ username: 'Guest User', isAnonymous: true });
    return this.issueTokens(user._id.toString());
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email?: string }>(refreshToken, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET') });
      const tokenHash = this.hash(refreshToken);
      const session = await this.sessions.findOne({ userId: payload.sub, tokenHash, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).exec();
      if (!session) throw new UnauthorizedException('Invalid refresh token');
      session.revokedAt = new Date();
      await session.save();
      return this.issueTokens(payload.sub, payload.email);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken?: string) {
    if (refreshToken) await this.sessions.updateOne({ tokenHash: this.hash(refreshToken) }, { revokedAt: new Date() }).exec();
    return { success: true };
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const existing = await this.users.findByEmail(dto.newEmail);
    if (existing && existing._id.toString() !== userId) throw new ConflictException('Email is already registered');
    const updated = await this.users.update(userId, { email: dto.newEmail.toLowerCase() });
    return this.users.toPublic(updated);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!user.passwordHash || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.updatePasswordHash(userId, await bcrypt.hash(dto.newPassword, 12));
    return { success: true };
  }

  async requestPasswordReset(email: string) {
    const user = await this.users.findByEmail(email);
    // Always return success, whether or not the account exists, so this
    // endpoint can't be used to enumerate registered emails.
    if (user?.email) {
      const rawToken = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
      await this.resetTokens.create({ userId: user._id, tokenHash: this.hash(rawToken), expiresAt });
      const resetLink = `${this.config.get<string>('FRONTEND_URL', 'http://localhost:9002')}/reset-password?token=${rawToken}`;
      await this.mail.sendPasswordResetEmail(user.email, resetLink);
    }
    return { success: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.resetTokens
      .findOne({ tokenHash: this.hash(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
      .exec();
    if (!resetToken) throw new UnauthorizedException('Invalid or expired reset link');

    resetToken.usedAt = new Date();
    await resetToken.save();

    await this.users.updatePasswordHash(resetToken.userId.toString(), await bcrypt.hash(newPassword, 12));
    // Invalidate all existing sessions so a leaked-then-reset password can't be ridden on an old session.
    await this.sessions.updateMany({ userId: resetToken.userId }, { revokedAt: new Date() }).exec();
    return { success: true };
  }

  private async issueTokens(userId: string, email?: string) {
    const payload = { sub: userId, email };
    const accessToken = await this.jwt.signAsync(payload, { secret: this.config.getOrThrow<string>('JWT_SECRET'), expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m') as any });
    const refreshToken = await this.jwt.signAsync(payload, { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') as any });
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.sessions.create({ userId, tokenHash: this.hash(refreshToken), expiresAt });
    return { accessToken, refreshToken };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}