import { 
    Controller, 
    Get, 
    Post,
    Patch, 
    Param, 
    Body, 
    Query, 
    UseGuards, 
    Request,
    HttpCode,
    HttpStatus,
    BadRequestException
  } from '@nestjs/common';
  import { ConversationsService } from './conversations.service';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { ConversationStatus } from './entities/conversation.entity';
  
  @Controller('conversations')
  @UseGuards(JwtAuthGuard)
  export class ConversationsController {
    constructor(private readonly conversationsService: ConversationsService) {}
  
    @Get()
    @HttpCode(HttpStatus.OK)
    async findAll(@Query('status') status?: ConversationStatus, @Request() req?: any) {
      return this.conversationsService.findAll(status, req?.user);
    }
  
    @Get('my-conversations')
    @HttpCode(HttpStatus.OK)
    async findMyConversations(@Request() req) {
      return this.conversationsService.findByUser(req.user.userId);
    }
  
    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(@Param('id') id: string, @Request() req) {
      return this.conversationsService.findOne(+id, req.user);
    }
  
    @Patch(':id/assign')
    @HttpCode(HttpStatus.OK)
    async assignToUser(
      @Param('id') id: string, 
      @Body() body: { userId: number },
      @Request() req
    ) {
      // Only admins can assign conversations
      if (req.user.role !== 'admin') {
        throw new BadRequestException('Only administrators can assign conversations');
      }
      return this.conversationsService.assignToUser(+id, body.userId);
    }
  
    @Patch(':id/status')
    @HttpCode(HttpStatus.OK)
    async updateStatus(
      @Param('id') id: string, 
      @Body() body: { status: ConversationStatus }
    ) {
      return this.conversationsService.updateStatus(+id, body.status);
    }
  
    @Post(':id/close')
    @HttpCode(HttpStatus.OK)
    async closeConversation(@Param('id') id: string) {
      return this.conversationsService.updateStatus(+id, ConversationStatus.CLOSED);
    }
  
    @Post(':id/reopen')
    @HttpCode(HttpStatus.OK)
    async reopenConversation(@Param('id') id: string) {
      return this.conversationsService.updateStatus(+id, ConversationStatus.OPEN);
    }
  }