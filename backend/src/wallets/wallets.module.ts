import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [UsersModule],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService, WalletsRepository],
  controllers: [WalletsController],
})
export class WalletsModule {}
