import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { RwaModule } from 'src/rwa/rwa.module';
import { CollateralModule } from 'src/collateral/collateral.module';

@Module({
  imports: [RwaModule, CollateralModule],
  providers: [EventsService],
})
export class EventsModule {}
