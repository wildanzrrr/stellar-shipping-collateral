import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { RwaModule } from 'src/rwa/rwa.module';

@Module({
  imports: [RwaModule],
  providers: [EventsService],
})
export class EventsModule {}
