import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RwaController } from './rwa.controller';
import { RwaService } from './rwa.service';
import { RwaRepository } from './rwa.repository';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { CollateralModule } from 'src/collateral/collateral.module';

@Module({
  imports: [JwtModule.register({}), CollateralModule],
  providers: [RwaService, RwaRepository, JwtAuthGuard],
  controllers: [RwaController],
  exports: [RwaService, RwaRepository],
})
export class RwaModule {}
