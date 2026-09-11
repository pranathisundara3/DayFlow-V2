import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { HabitsModule } from './modules/habits/habits.module';
import { PlannerModule } from './modules/planner/planner.module';
import { NotesModule } from './modules/notes/notes.module';
import { CredentialsModule } from './modules/credentials/credentials.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PushModule } from './modules/push/push.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';

function validateEnvironment(config: Record<string, unknown>) {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: Number(config.get<string>('MONGODB_SERVER_SELECTION_TIMEOUT_MS', '5000')),
        connectTimeoutMS: Number(config.get<string>('MONGODB_CONNECT_TIMEOUT_MS', '10000')),
      }),
    }),
    AuthModule,
    UsersModule,
    TasksModule,
    ExpensesModule,
    HabitsModule,
    PlannerModule,
    NotesModule,
    CredentialsModule,
    NotificationsModule,
    PushModule,
    JobsModule,
    HealthModule,
  ],
})
export class AppModule {}