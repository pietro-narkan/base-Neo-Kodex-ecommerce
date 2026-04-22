import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { AdminOnlyGuard } from '../auth/guards/admin-only.guard';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AttributesService } from './attributes.service';
import {
  CreateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeDto,
} from './dto/attributes.dto';

@UseGuards(AdminOnlyGuard)
@Controller('admin/attributes')
export class AdminAttributesController {
  constructor(private readonly attrs: AttributesService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.attrs.list(pagination);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.attrs.getById(id);
  }

  @Post()
  create(@Body() dto: CreateAttributeDto) {
    return this.attrs.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAttributeDto) {
    return this.attrs.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.attrs.remove(id);
  }

  @Post(':id/values')
  addValue(
    @Param('id') id: string,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.attrs.addValue(id, dto);
  }

  @Delete(':id/values/:valueId')
  removeValue(
    @Param('id') id: string,
    @Param('valueId') valueId: string,
  ) {
    return this.attrs.removeValue(id, valueId);
  }
}
