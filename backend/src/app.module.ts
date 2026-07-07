import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DfnsModule } from './dfns/dfns.module';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { WalletsController } from './wallets/wallets.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DfnsModule,
  ],
  controllers: [AppController, UsersController, WalletsController],
  providers: [AppService, UsersService],
})
export class AppModule {}
