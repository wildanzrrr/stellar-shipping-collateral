import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { WalletsRepository } from './wallets.repository';
import { UsersModule } from 'src/users/users.module';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

// The guard is self-provided here (JwtModule + JwtAuthGuard) so this module
// does not import AuthModule — AuthModule imports WalletsModule instead, which
// would otherwise be a circular dependency.
@Module({
  imports: [UsersModule, JwtModule.register({})],
  providers: [WalletsService, WalletsRepository, JwtAuthGuard],
  exports: [WalletsService, WalletsRepository],
  controllers: [WalletsController],
})
export class WalletsModule {}
