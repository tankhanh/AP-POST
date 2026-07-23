import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Public, ResponseMessage, Users } from 'src/health/decorator/customize';
import { Roles } from 'src/health/decorator/roles.decorator';
import { IUser } from 'src/types/user.interface';

@ApiTags('branches')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @Roles('ADMIN')
  @ResponseMessage('Tạo chi nhánh mới')
  create(@Body() dto: CreateBranchDto) {
    return this.branchesService.create(dto);
  }

  @Public()
  @Get()
  @ResponseMessage('Danh sách chi nhánh')
  findAll(
    @Query('current') current?: string,
    @Query('pageSize') size?: string,
    @Query() query?: any,
  ) {
    const page = current ? Number(current) : 1;
    const limit = size ? Number(size) : 10;
    return this.branchesService.findAll(page, limit, query || {});
  }

  // GET /branches/trash
  @Get('trash')
  @Roles('ADMIN')
  findTrash() {
    return this.branchesService.findTrash();
  }

  @Public()
  @Get(':id')
  @ResponseMessage('Chi tiết chi nhánh')
  findOne(@Param('id') id: string) {
    return this.branchesService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ResponseMessage('Cập nhật chi nhánh')
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ResponseMessage('Xóa (soft) chi nhánh')
  remove(@Param('id') id: string, @Users() user: IUser) {
    return this.branchesService.remove(id, user);
  }

  @Patch(':id/restore')
  @Roles('ADMIN')
  @ResponseMessage('Khôi phục chi nhánh')
  restore(@Param('id') id: string) {
    return this.branchesService.restore(id);
  }

  @Delete(':id/force')
  @Roles('ADMIN')
  @ResponseMessage('Xóa vĩnh viễn chi nhánh')
  hardDelete(@Param('id') id: string) {
    return this.branchesService.hardDelete(id);
  }
}
