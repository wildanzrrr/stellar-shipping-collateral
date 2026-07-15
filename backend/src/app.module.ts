import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma.module';
import { DfnsModule } from './dfns/dfns.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { SumsubModule } from './sumsub/sumsub.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    DfnsModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    SumsubModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
