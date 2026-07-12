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
import { BlockchainModule } from './blockchain/blockchain.module';
import { StorageModule } from './storage/storage.module';
import { CollateralModule } from './collateral/collateral.module';
import { RwaModule } from './rwa/rwa.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    DfnsModule,
    StorageModule,
    BlockchainModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    SumsubModule,
    CollateralModule,
    RwaModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
