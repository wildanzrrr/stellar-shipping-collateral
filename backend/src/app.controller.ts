import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { DfnsService } from './dfns/dfns.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dfns: DfnsService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('dfns/whoami')
  async whoami() {
    const accounts = await this.dfns.api.auth.listServiceAccounts();
    return { ok: true, accounts };
  }
}
