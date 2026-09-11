import { Controller, Get, HttpException, HttpStatus, Injectable, Module } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async database() {
    const checkedAt = new Date().toISOString();

    try {
      if (!this.connection.db) {
        throw new Error('MongoDB connection is not initialized');
      }

      await this.connection.db.command({ ping: 1 });
      return {
        status: 'ok',
        database: 'connected',
        checkedAt,
      };
    } catch {
      throw new HttpException(
        {
          status: 'error',
          database: 'disconnected',
          checkedAt,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

@Controller('health')
class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('database')
  database() {
    return this.health.database();
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}