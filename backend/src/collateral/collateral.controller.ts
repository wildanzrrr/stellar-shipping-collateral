import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { AuthenticatedRequest } from 'src/auth/jwt.types';
import { CollateralService } from './collateral.service';
import {
  CreateCollateralDTO,
  UpdateCollateralDTO,
  CollateralQueryDTO,
  RequestUploadDTO,
} from './collateral.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/collateral')
export class CollateralController {
  constructor(private readonly collateralService: CollateralService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create collateral record',
    description:
      'Creates a new collateral record linking an on-chain RWA token to off-chain legal documents.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Collateral created',
    schema: {
      example: {
        success: true,
        message: 'Collateral created successfully',
        data: { id: 'col-abc123', rwaId: 'INV-1023', status: 'DRAFT' },
        statusCode: 201,
      },
    },
  })
  create(
    @Req() req: AuthenticatedRequest,
    @Body() payload: CreateCollateralDTO,
  ) {
    return this.collateralService.create(req.user.sub, payload);
  }

  @Get()
  @ApiOperation({ summary: 'List collateral for the authenticated user' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collateral list' })
  list(@Req() req: AuthenticatedRequest, @Query() query: CollateralQueryDTO) {
    return this.collateralService.list(
      req.user.sub,
      query.page ?? 1,
      query.limit ?? 10,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get collateral details with documents' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collateral details' })
  getById(@Param('id') id: string) {
    return this.collateralService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update collateral metadata or status' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Collateral updated' })
  update(@Param('id') id: string, @Body() payload: UpdateCollateralDTO) {
    return this.collateralService.update(id, payload);
  }

  @Post(':id/documents/upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a presigned GCS upload URL',
    description:
      'Pre-creates a CollateralDocument row and returns a short-lived signed PUT URL. The browser uploads the file bytes directly to GCS.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Signed URL generated',
  })
  requestUpload(@Param('id') id: string, @Body() body: RequestUploadDTO) {
    return this.collateralService.requestDocumentUpload(id, body);
  }

  @Get(':id/documents/:docId')
  @ApiOperation({ summary: 'Get a signed download URL for a document' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Signed URL generated' })
  getDocumentUrl(@Param('id') id: string, @Param('docId') docId: string) {
    return this.collateralService.getDocumentUrl(id, docId);
  }
}
