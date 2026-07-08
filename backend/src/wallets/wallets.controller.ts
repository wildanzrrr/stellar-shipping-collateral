import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateWalletDTO,
  DelegateWalletDTO,
  SignInitDTO,
  SignCompleteDTO,
  TransferInitDTO,
  TransferCompleteDTO,
} from './wallets.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create wallet',
    description:
      'Create a Stellar Testnet wallet (owned by the service account).',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Wallet created successfully',
    schema: {
      example: {
        success: true,
        message: 'Wallet created successfully',
        data: { id: 'wa-abc123', address: 'G...', network: 'StellarTestnet' },
        statusCode: 201,
      },
    },
  })
  create(@Body() payload: CreateWalletDTO) {
    return this.walletsService.createWallet(payload);
  }

  @Post(':walletId/delegate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delegate wallet',
    description: 'Delegate an SA-owned wallet to the end user.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Wallet delegated successfully',
    schema: {
      example: {
        success: true,
        message: 'Wallet delegated successfully',
        statusCode: 200,
      },
    },
  })
  delegate(
    @Param('walletId') walletId: string,
    @Body() payload: DelegateWalletDTO,
  ) {
    return this.walletsService.delegateWallet(walletId, payload);
  }

  @Post(':walletId/sign/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign message (step 1)',
    description:
      'Builds a Stellar transaction containing the message in a manageData op and requests a signing challenge.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Signing challenge created',
    schema: {
      example: {
        success: true,
        message: 'Signing challenge created',
        data: {
          challenge: '...',
          keyId: 'key-abc123',
          transactionXdr: '0x...',
        },
        statusCode: 200,
      },
    },
  })
  signInit(@Param('walletId') walletId: string, @Body() payload: SignInitDTO) {
    return this.walletsService.signInit(walletId, payload);
  }

  @Post(':walletId/sign/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign message (step 2)',
    description: 'Completes message signing with the user-signed challenge.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Message signed successfully',
    schema: {
      example: {
        success: true,
        message: 'Message signed successfully',
        data: { signedTransaction: '0x...' },
        statusCode: 200,
      },
    },
  })
  signComplete(
    @Param('walletId') walletId: string,
    @Body() payload: SignCompleteDTO,
  ) {
    return this.walletsService.signComplete(walletId, payload);
  }

  @Post(':walletId/transfer/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transfer (step 1)',
    description:
      'Builds a Stellar payment transaction and requests a passkey signing challenge.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer challenge created',
  })
  transferInit(
    @Param('walletId') walletId: string,
    @Body() payload: TransferInitDTO,
  ) {
    return this.walletsService.transferInit(walletId, payload);
  }

  @Post(':walletId/transfer/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transfer (step 2)',
    description:
      'Completes the passkey signature and broadcasts the payment to Stellar.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Transfer broadcast successfully',
  })
  transferComplete(
    @Param('walletId') walletId: string,
    @Body() payload: TransferCompleteDTO,
  ) {
    return this.walletsService.transferComplete(walletId, payload);
  }
}
