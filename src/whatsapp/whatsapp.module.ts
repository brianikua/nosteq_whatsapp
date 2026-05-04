import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppController } from './whatsapp.controller';
import { Customer } from '../customers/entities/customer.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { Message } from '../messages/entities/message.entity';
import { Template } from '../templates/entities/template.entity';
import { AutoRepliesModule } from '../auto-replies/auto-replies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Conversation, Message, Template]),
    AutoRepliesModule,
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}