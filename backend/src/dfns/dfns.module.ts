import { Global, Module } from '@nestjs/common';
import { DfnsService } from './dfns.service';

@Global()
@Module({
  providers: [DfnsService],
  exports: [DfnsService],
})
export class DfnsModule {}
