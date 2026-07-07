import { Injectable, Logger } from '@nestjs/common';
import { version } from '../package.json';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return `Hello from SEP57 API v${version}`;
  }

  async checkHealth() {
    const timestamp = new Date().toISOString();
    const startTime = Date.now();
    this.logger.debug('Performing health check...', { timestamp });

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const responseTime = Date.now() - startTime;
      this.logger.debug('Health check successful', { timestamp, responseTime });

      return {
        status: 'ok',
        timestamp,
        database: {
          status: 'connected',
          responseTime,
        },
      };
    } catch (error) {
      this.logger.error('Database connection failed:', error);
      return {
        status: 'error',
        timestamp,
        database: {
          status: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
