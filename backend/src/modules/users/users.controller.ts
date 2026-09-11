import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: { sub: string }) {
    return this.usersService.toPublic(await this.usersService.findById(user.sub));
  }

  @Patch('me')
  async update(@CurrentUser() user: { sub: string }, @Body() dto: UpdateUserDto) {
    return this.usersService.toPublic(await this.usersService.update(user.sub, dto));
  }
}