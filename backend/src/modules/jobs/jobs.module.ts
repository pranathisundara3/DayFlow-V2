import { Controller, Headers, HttpCode, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import webpush from 'web-push';
import { Notification, NotificationSchema } from '../notifications/notifications.module';
import { Habit, HabitSchema } from '../habits/habits.module';
import { PushSubscription, PushSubscriptionSchema } from '../push/push.module';

@Injectable()
class JobsService {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @InjectModel(Habit.name) private readonly habits: Model<Habit>,
    @InjectModel(PushSubscription.name) private readonly subscriptions: Model<PushSubscription>,
  ) {}

  private vapidReady = false;
  private ensureVapid() {
    if (this.vapidReady) return true;
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (!publicKey || !privateKey || !subject) {
      console.warn('VAPID keys are not fully configured. Push notifications will not be sent.');
      return false;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.vapidReady = true;
    return true;
  }

  private async sendToUser(userId: string, payload: string) {
    const subs = await this.subscriptions.find({ userId }).exec();
    let sent = 0;
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys as any }, payload);
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await this.subscriptions.deleteOne({ _id: sub._id }).exec();
        } else {
          console.error(`Error sending push notification to user ${userId}:`, error?.body || error);
        }
      }
    }));
    return sent;
  }

  async sendReminders() {
    if (!this.ensureVapid()) return { success: true, message: 'VAPID keys not configured; no notifications sent.' };

    const todayStart = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const todaysReminders = await this.notifications.find({ date: todayStart }).exec();

    let notificationsSent = 0;
    for (const reminder of todaysReminders) {
      const payload = JSON.stringify({ title: reminder.title, body: reminder.message });
      notificationsSent += await this.sendToUser(reminder.userId.toString(), payload);
    }
    return { success: true, message: `Check complete. Sent ${notificationsSent} reminder notifications.` };
  }

  async waterCheck() {
    if (!this.ensureVapid()) return { success: true, message: 'VAPID keys not configured; no notifications sent.' };

    const now = new Date();
    const currentHour = now.getHours();
    const todayKey = now.toISOString().slice(0, 10);

    let requiredPercentage = 0;
    let notificationTitle = '';
    let notificationBody = '';

    if (currentHour >= 11 && currentHour < 12) {
      requiredPercentage = 0.30;
      notificationTitle = 'Water Reminder!';
      notificationBody = "Don't forget to stay hydrated. Aim for 30% of your goal by noon!";
    } else if (currentHour >= 17 && currentHour < 18) {
      requiredPercentage = 0.70;
      notificationTitle = 'Evening Hydration Check';
      notificationBody = 'Keep it up! Try to hit 70% of your water goal by 6 PM.';
    } else if (currentHour >= 21 && currentHour < 22) {
      requiredPercentage = 1.0;
      notificationTitle = 'Final Water Reminder';
      notificationBody = 'Almost there! Complete your daily water intake goal before bed.';
    } else {
      return { success: true, message: 'Not a scheduled check time.' };
    }

    const waterHabits = await this.habits.find({ icon: 'GlassWater', target: { $gt: 0 } }).exec();

    let notificationsSent = 0;
    for (const habit of waterHabits) {
      const target = habit.target as number;
      const glassesToday = (typeof habit.completions?.[todayKey] === 'number' ? habit.completions[todayKey] : 0) as number;
      const currentPercentage = glassesToday / target;
      if (currentPercentage >= requiredPercentage) continue;

      const payload = JSON.stringify({ title: notificationTitle, body: `${notificationBody} Your goal: ${target} glasses. You've had ${glassesToday}.` });
      notificationsSent += await this.sendToUser(habit.userId.toString(), payload);
    }
    return { success: true, message: `Check complete. Sent ${notificationsSent} notifications.` };
  }
}

@Controller('jobs')
class JobsController {
  constructor(private readonly config: ConfigService, private readonly jobs: JobsService) {}

  private authorize(value?: string) {
    if (value !== `Bearer ${this.config.get<string>('CRON_SECRET')}`) throw new UnauthorizedException();
  }

  @Post('send-reminders')
  @HttpCode(200)
  sendReminders(@Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    return this.jobs.sendReminders();
  }

  @Post('water-check')
  @HttpCode(200)
  waterCheck(@Headers('authorization') authorization?: string) {
    this.authorize(authorization);
    return this.jobs.waterCheck();
  }
}

@Module({
  imports: [MongooseModule.forFeature([
    { name: Notification.name, schema: NotificationSchema },
    { name: Habit.name, schema: HabitSchema },
    { name: PushSubscription.name, schema: PushSubscriptionSchema },
  ])],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
