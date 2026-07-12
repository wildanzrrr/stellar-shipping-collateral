import { Module } from '@nestjs/common';
import { CollateralController } from './collateral.controller';
import { CollateralService } from './collateral.service';
import { CollateralRepository } from './collateral.repository';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Module({
  imports: [JwtModule.register({})],
  providers: [CollateralService, CollateralRepository, JwtAuthGuard],
  controllers: [CollateralController],
  exports: [CollateralService, CollateralRepository],
})
export class CollateralModule {}
