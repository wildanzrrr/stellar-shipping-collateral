import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedRequest } from 'src/auth/jwt.types';
import { RwaService } from './rwa.service';
import { RwaQueryDTO, SettleDebtDTO, CreateRwaTokenDTO } from './rwa.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/rwa')
export class RwaController {
  constructor(private readonly rwaService: RwaService) {}

  @Get()
  @ApiOperation({
    summary: 'List RWAs (filtered by shipper for SHIPPING_COMPANY)',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'RWA list' })
  list(@Req() req: AuthenticatedRequest, @Query() query: RwaQueryDTO) {
    // If SHIPPING_COMPANY, filter by their wallet address
    const shipperAddress =
      req.user.role === 'SHIPPING_COMPANY' ? req.user.walletAddress : undefined;
    return this.rwaService.listRwas(
      shipperAddress,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @Get('events')
  @ApiOperation({
    summary: 'List transaction events for the authenticated user',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction events' })
  listEvents(@Req() req: AuthenticatedRequest) {
    const isShipper = req.user.role === 'SHIPPING_COMPANY';
    return this.rwaService.listEvents(
      req.user.sub,
      isShipper,
      undefined, // shipperRwaIds — populated in a richer version
      req.user.walletAddress,
    );
  }

  @Get(':rwaId')
  @ApiOperation({ summary: 'Get RWA details from on-chain + local collateral' })
  @ApiResponse({ status: HttpStatus.OK, description: 'RWA details' })
  getRwa(@Param('rwaId') rwaId: string) {
    return this.rwaService.getRwa(rwaId);
  }

  @Get(':rwaId/investors')
  @ApiOperation({ summary: 'List investors (SharesBought events) for an RWA' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Investor list' })
  getInvestors(@Param('rwaId') rwaId: string) {
    return this.rwaService.getInvestors(rwaId);
  }

  @Post('create-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare create_rwa_token transaction',
    description:
      'Generates salt, nonce, deadline, and admin-signed mint permit. Returns the assembled transaction XDR for DFNS signing by the shipper.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction prepared' })
  prepareCreateRwaToken(
    @Req() req: AuthenticatedRequest,
    @Body() payload: CreateRwaTokenDTO,
  ) {
    if (!req.user.walletAddress) {
      throw new BadRequestException(
        'Wallet address required to create RWA token',
      );
    }
    return this.rwaService.prepareCreateRwaToken(
      req.user.walletAddress,
      payload,
    );
  }

  @Post('approve-factory')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare USDC approve transaction (shipper → factory)',
    description:
      'Returns the assembled approve transaction XDR the shipper must sign via DFNS BEFORE create_rwa_token, so the factory can pull the upfront interest + protocol fee.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction prepared' })
  prepareApproveFactory(
    @Req() req: AuthenticatedRequest,
    @Body() payload: CreateRwaTokenDTO,
  ) {
    if (!req.user.walletAddress) {
      throw new BadRequestException(
        'Wallet address required to approve the factory',
      );
    }
    return this.rwaService.prepareApproveFactory(
      req.user.walletAddress,
      payload,
    );
  }

  @Post(':rwaId/collect-fund')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare collect_fund transaction',
    description:
      'Returns the assembled transaction XDR for DFNS signing by the shipper.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction prepared' })
  prepareCollectFund(
    @Req() req: AuthenticatedRequest,
    @Param('rwaId') rwaId: string,
  ) {
    if (!req.user.walletAddress) {
      throw new BadRequestException('Wallet address required');
    }
    return this.rwaService.prepareCollectFund(rwaId, req.user.walletAddress);
  }

  @Post(':rwaId/settle-debt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare settle_debt transaction',
    description:
      'Returns the assembled transaction XDR for DFNS signing by the shipper.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction prepared' })
  prepareSettleDebt(
    @Req() req: AuthenticatedRequest,
    @Param('rwaId') rwaId: string,
    @Body() payload: SettleDebtDTO,
  ) {
    if (!req.user.walletAddress) {
      throw new BadRequestException('Wallet address required');
    }
    return this.rwaService.prepareSettleDebt(
      rwaId,
      req.user.walletAddress,
      payload,
    );
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a signed Soroban transaction',
    description:
      'After the shipper signs the XDR via DFNS, submit it to Soroban RPC.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Transaction submitted' })
  submitTransaction(@Body() body: { signedTxXdr: string }) {
    return this.rwaService.submitSignedTransaction(body.signedTxXdr);
  }
}
