import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoRepliesService } from './auto-replies.service';
import { AutoRepliesController } from './auto-replies.controller';
import { AutoReply } from './entities/auto-reply.entity';
import { Template } from '../templates/entities/template.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AutoReply, Template])],
  controllers: [AutoRepliesController],
  providers: [AutoRepliesService],
  exports: [AutoRepliesService],
})
export class AutoRepliesModule {}
