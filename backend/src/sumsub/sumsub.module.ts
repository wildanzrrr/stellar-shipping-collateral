import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SumsubController, SumsubWebhookController } from './sumsub.controller';
import { SumsubService } from './sumsub.service';
import { UsersModule } from 'src/users/users.module';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Module({
  // JwtModule + JwtAuthGuard so the access-token endpoint can be guarded
  // without importing AuthModule (avoids circular deps — same pattern as WalletsModule).
  imports: [UsersModule, JwtModule.register({})],
  providers: [SumsubService, JwtAuthGuard],
  controllers: [SumsubController, SumsubWebhookController],
  exports: [SumsubService],
})
export class SumsubModule {}
