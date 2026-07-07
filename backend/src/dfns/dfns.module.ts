import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DfnsService } from './dfns.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DfnsService],
  exports: [DfnsService],
})
export class DfnsModule {}
