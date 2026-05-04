import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';

export enum KeywordMatchType {
  EXACT = 'exact', // Entire message must match
  PARTIAL = 'partial', // Keyword appears anywhere in message
}

export enum AutoReplyType {
  CUSTOM = 'custom', // Custom message
  TEMPLATE = 'template', // Use template
}

@Entity('auto_replies')
export class AutoReply {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'conversation_id', nullable: true })
  @Index('idx_conversation')
  conversationId: number;

  @Column({ type: 'text' })
  keyword: string;

  @Column({
    type: 'enum',
    enum: KeywordMatchType,
    default: KeywordMatchType.PARTIAL,
  })
  matchType: KeywordMatchType;

  @Column({
    type: 'enum',
    enum: AutoReplyType,
    default: AutoReplyType.CUSTOM,
  })
  replyType: AutoReplyType;

  @Column({ type: 'text', nullable: true })
  customReply: string;

  @Column({ name: 'template_id', nullable: true })
  templateId: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ name: 'case_sensitive', default: false })
  caseSensitive: boolean;

  @Column({ name: 'reply_count', default: 0 })
  replyCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Conversation, { nullable: true })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;
}
