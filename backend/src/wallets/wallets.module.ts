import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';
import { UsersModule } from 'src/users/users.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [UsersModule, AuthModule],
  providers: [WalletsService, WalletsRepository],
  exports: [WalletsService, WalletsRepository],
  controllers: [WalletsController],
})
export class WalletsModule {}
