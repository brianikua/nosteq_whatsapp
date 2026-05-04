import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoReply, KeywordMatchType } from './entities/auto-reply.entity';
import { CreateAutoReplyDto, UpdateAutoReplyDto } from './dto/auto-reply.dto';
import { Template } from '../templates/entities/template.entity';

@Injectable()
export class AutoRepliesService {
  constructor(
    @InjectRepository(AutoReply)
    private autoReplyRepository: Repository<AutoReply>,
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
  ) {}

  async create(createAutoReplyDto: CreateAutoReplyDto): Promise<AutoReply> {
    // Validate that either customReply or templateId is provided
    if (!createAutoReplyDto.customReply && !createAutoReplyDto.templateId) {
      throw new BadRequestException('Either customReply or templateId must be provided');
    }

    // If templateId is provided, verify it exists
    if (createAutoReplyDto.templateId) {
      const template = await this.templateRepository.findOne({
        where: { id: createAutoReplyDto.templateId },
      });
      if (!template) {
        throw new NotFoundException(`Template with ID ${createAutoReplyDto.templateId} not found`);
      }
    }

    const autoReply = this.autoReplyRepository.create(createAutoReplyDto);
    return this.autoReplyRepository.save(autoReply);
  }

  async findAll(conversationId?: number): Promise<AutoReply[]> {
    const query = this.autoReplyRepository.createQueryBuilder('autoReply');

    if (conversationId) {
      query.where('autoReply.conversationId = :conversationId OR autoReply.conversationId IS NULL', {
        conversationId,
      });
    } else {
      query.where('autoReply.conversationId IS NULL');
    }

    return query.orderBy('autoReply.createdAt', 'DESC').getMany();
  }

  async findById(id: number): Promise<AutoReply> {
    const autoReply = await this.autoReplyRepository.findOne({ where: { id } });
    if (!autoReply) {
      throw new NotFoundException(`Auto-reply with ID ${id} not found`);
    }
    return autoReply;
  }

  async update(id: number, updateAutoReplyDto: UpdateAutoReplyDto): Promise<AutoReply> {
    const autoReply = await this.findById(id);

    // If templateId is provided in update, verify it exists
    if (updateAutoReplyDto.templateId) {
      const template = await this.templateRepository.findOne({
        where: { id: updateAutoReplyDto.templateId },
      });
      if (!template) {
        throw new NotFoundException(`Template with ID ${updateAutoReplyDto.templateId} not found`);
      }
    }

    Object.assign(autoReply, updateAutoReplyDto);
    return this.autoReplyRepository.save(autoReply);
  }

  async delete(id: number): Promise<void> {
    const autoReply = await this.findById(id);
    await this.autoReplyRepository.remove(autoReply);
  }

  async findMatchingRules(
    messageContent: string,
    conversationId: number,
  ): Promise<AutoReply[]> {
    // Get all active auto-reply rules for this conversation or global rules
    const rules = await this.autoReplyRepository.find({
      where: [
        { conversationId, isActive: true },
        { conversationId: null, isActive: true },
      ],
    });

    return rules.filter((rule) => this.matchesKeyword(messageContent, rule));
  }

  private matchesKeyword(messageContent: string, rule: AutoReply): boolean {
    const keyword = rule.caseSensitive ? rule.keyword : rule.keyword.toLowerCase();
    const content = rule.caseSensitive ? messageContent : messageContent.toLowerCase();

    if (rule.matchType === KeywordMatchType.EXACT) {
      return content === keyword;
    } else if (rule.matchType === KeywordMatchType.PARTIAL) {
      return content.includes(keyword);
    }

    return false;
  }

  async incrementReplyCount(id: number): Promise<void> {
    await this.autoReplyRepository.increment({ id }, 'replyCount', 1);
  }

  async getStatistics(conversationId?: number): Promise<any> {
    const query = this.autoReplyRepository.createQueryBuilder('autoReply');

    if (conversationId) {
      query.where('autoReply.conversationId = :conversationId', { conversationId });
    }

    const rules = await query.getMany();
    const totalReplies = rules.reduce((sum, rule) => sum + rule.replyCount, 0);
    const totalRules = rules.length;
    const activeRules = rules.filter((r) => r.isActive).length;

    return {
      totalRules,
      activeRules,
      inactiveRules: totalRules - activeRules,
      totalRepliesSent: totalReplies,
      averageRepliesPerRule: totalRules > 0 ? (totalReplies / totalRules).toFixed(2) : 0,
      topRules: rules
        .sort((a, b) => b.replyCount - a.replyCount)
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          keyword: r.keyword,
          replyCount: r.replyCount,
        })),
    };
  }
}
