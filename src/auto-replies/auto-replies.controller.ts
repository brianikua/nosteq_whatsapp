import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AutoRepliesService } from './auto-replies.service';
import { CreateAutoReplyDto, UpdateAutoReplyDto } from './dto/auto-reply.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('auto-replies')
@UseGuards(JwtAuthGuard)
export class AutoRepliesController {
  constructor(private autoRepliesService: AutoRepliesService) {}

  @Post()
  async create(@Body() createAutoReplyDto: CreateAutoReplyDto) {
    return this.autoRepliesService.create(createAutoReplyDto);
  }

  @Get()
  async findAll(@Query('conversationId') conversationId?: string) {
    const convId = conversationId ? parseInt(conversationId, 10) : undefined;
    return this.autoRepliesService.findAll(convId);
  }

  @Get('statistics')
  async getStatistics(@Query('conversationId') conversationId?: string) {
    const convId = conversationId ? parseInt(conversationId, 10) : undefined;
    return this.autoRepliesService.getStatistics(convId);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.autoRepliesService.findById(parseInt(id, 10));
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAutoReplyDto: UpdateAutoReplyDto,
  ) {
    return this.autoRepliesService.update(parseInt(id, 10), updateAutoReplyDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.autoRepliesService.delete(parseInt(id, 10));
    return { message: 'Auto-reply rule deleted successfully' };
  }
}
