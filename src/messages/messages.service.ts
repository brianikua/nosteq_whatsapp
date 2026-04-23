import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Message, MessageDirection, MessageType, MessageStatus } from './entities/message.entity';
import { Conversation, ConversationStatus } from '../conversations/entities/conversation.entity';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { ConversationsGateway } from '../conversations/conversations.gateway';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    private whatsappService: WhatsAppService,
    private conversationsGateway: ConversationsGateway,
  ) {}

  async findByConversation(conversationId: number, user?: any): Promise<Message[]> {
    // Check if user has access to this conversation
    if (user && user.role === 'agent') {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });
      
      if (!conversation || (conversation.assignedUserId !== user.userId && conversation.assignedUserId !== null)) {
        throw new NotFoundException(`Conversation with ID ${conversationId} not found`);
      }
    }

    console.log(`🔄 Fetching messages for conversation ${conversationId}...`);
    const messages = await this.messageRepository.find({
      where: { conversationId },
      relations: ['user', 'customer'],
      order: { createdAt: 'ASC' },
    });

    console.log(`✅ Retrieved ${messages.length} messages for conversation ${conversationId}`);

    // Verify all messages have content
    messages.forEach((msg, idx) => {
      if (!msg.content) {
        console.warn(`⚠️ Message ${msg.id} at index ${idx} has empty content!`);
      }
    });

    return messages.map((message) => {
      if (message.user) {
        message.senderName = message.user.fullName;
      }
      return message;
    });
  }

  async sendMessage(
    conversationId: number,
    customerId: number,
    content: string,
    userId: number,
    phoneNumber: string,
  ): Promise<Message> {
    try {
      // Validate inputs
      if (!conversationId || !customerId || !content) {
        throw new Error('Invalid message parameters');
      }

      // Send via WhatsApp API
      console.log('🔄 Sending message to WhatsApp:', { phoneNumber, contentLength: content.length });
      const whatsappResponse = await this.whatsappService.sendMessage(
        phoneNumber,
        content,
        userId,
      );
      console.log('✅ WhatsApp response:', whatsappResponse);

      // Create message object
      const messageData = {
        conversationId,
        customerId,
        userId,
        content,
        direction: MessageDirection.OUTBOUND,
        messageType: MessageType.TEXT,
        whatsappMessageId: whatsappResponse.messages?.[0]?.id,
        status: MessageStatus.SENT,
      };

      // Save to database with explicit commit
      console.log('💾 Saving message to database:', { conversationId, customerId, contentLength: content.length });
      const message = this.messageRepository.create(messageData);
      const savedMessage = await this.messageRepository.save(message);
      console.log('✅ Message saved with ID:', savedMessage.id);

      if (!savedMessage.id) {
        throw new Error('Message was not saved properly - no ID returned');
      }

      // Update conversation assignment and last message time
      await this.assignConversationToUserIfNeeded(conversationId, userId);

      // Load full message with relations
      const fullMessage = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['customer', 'user'],
      });

      if (!fullMessage) {
        throw new Error(`Failed to load message with id ${savedMessage.id} from database after save`);
      }

      console.log('✅ Message loaded from database:', fullMessage.id);

      if (fullMessage.user) {
        fullMessage.senderName = fullMessage.user.fullName;
      }

      // Emit via WebSocket
      this.conversationsGateway.emitNewMessage(conversationId, fullMessage);
      this.conversationsGateway.emitConversationUpdate(conversationId, {
        lastMessageAt: new Date(),
      });

      console.log('✅ Message sent and stored successfully:', fullMessage.id);
      return fullMessage;
    } catch (error) {
      console.error('❌ Error in sendMessage:', error);
      throw error;
    }
  }

  async sendMediaMessage(
    conversationId: number,
    customerId: number,
    phoneNumber: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    userId: number,
    caption?: string,
  ): Promise<Message> {
    try {
      // Validate inputs
      if (!conversationId || !customerId || !mediaUrl) {
        throw new Error('Invalid media message parameters');
      }

      // Send via WhatsApp API
      console.log('🔄 Sending media to WhatsApp:', { phoneNumber, mediaType, mediaUrl });
      const whatsappResponse = await this.whatsappService.sendMediaMessage(
        phoneNumber,
        mediaType,
        mediaUrl,
        caption,
      );
      console.log('✅ WhatsApp media response:', whatsappResponse);

      // Create message data
      const messageData = {
        conversationId,
        customerId,
        userId,
        content: caption || `[${mediaType}]`,
        mediaUrl,
        direction: MessageDirection.OUTBOUND,
        messageType: mediaType as MessageType,
        whatsappMessageId: whatsappResponse.messages?.[0]?.id,
        status: MessageStatus.SENT,
      };

      // Save to database
      console.log('💾 Saving media message to database:', { conversationId, customerId, mediaType });
      const message = this.messageRepository.create(messageData);
      const savedMessage = await this.messageRepository.save(message);
      console.log('✅ Media message saved with ID:', savedMessage.id);

      if (!savedMessage.id) {
        throw new Error('Media message was not saved properly - no ID returned');
      }

      // Update conversation assignment and last message time
      await this.assignConversationToUserIfNeeded(conversationId, userId);

      // Load and emit
      const fullMessage = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: ['customer', 'user'],
      });

      if (!fullMessage) {
        throw new Error(`Failed to load media message with id ${savedMessage.id} from database after save`);
      }

      console.log('✅ Media message loaded from database:', fullMessage.id);

      if (fullMessage.user) {
        fullMessage.senderName = fullMessage.user.fullName;
      }

      this.conversationsGateway.emitNewMessage(conversationId, fullMessage);
      this.conversationsGateway.emitConversationUpdate(conversationId, {
        lastMessageAt: new Date(),
      });

      console.log('✅ Media message sent and stored successfully:', fullMessage.id);
      return fullMessage;
    } catch (error) {
      console.error('❌ Error in sendMediaMessage:', error);
      throw error;
    }
  }

  private async assignConversationToUserIfNeeded(conversationId: number, userId: number): Promise<void> {
    try {
      const conversation = await this.conversationRepository.findOne({
        where: { id: conversationId },
      });

      if (!conversation) {
        console.warn(`\u26a0\ufe0f Warning: Conversation ${conversationId} not found for user assignment`);
        return;
      }

      if (!conversation.assignedUserId) {
        console.log(`\ud83d\udd04 Auto-assigning conversation ${conversationId} to user ${userId}`);
        await this.conversationRepository.update(conversationId, {
          assignedUserId: userId,
          lastMessageAt: new Date(),
        });
        console.log(`\u2705 Conversation ${conversationId} assigned to user ${userId}`);
      } else if (conversation.assignedUserId !== userId) {
        console.log(`\ud83d\udd04 Updating conversation ${conversationId} last message time`);
        await this.conversationRepository.update(conversationId, {
          lastMessageAt: new Date(),
        });
      }
    } catch (error) {
      console.error(`\u274c Error assigning conversation ${conversationId}:`, error);
      // Don't throw - allow message to be saved even if assignment fails
    }
  }

  async updateMessageStatus(whatsappMessageId: string, status: string) {
    await this.messageRepository.update(
      { whatsappMessageId },
      { status: status as any },
    );
  }

  async markAsRead(messageId: number): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    // // Only mark as read if it's not already read
    // if (message.readAt) {
    //   return this.messageRepository.findOne({
    //     where: { id: messageId },
    //     relations: ['customer', 'user'],
    //   }) as Promise<Message>;
    // }

    if (message.direction !== MessageDirection.INBOUND) {
      throw new BadRequestException(
        `Cannot mark outgoing message as read. Only incoming messages from customers can be marked as read.`
      );
    }else if(message.readAt){
      return this.messageRepository.findOne({
        where: { id: messageId },
        relations: ['customer', 'user'],
      }) as Promise<Message>;
    }

    // Check if WhatsApp message ID is valid (not a test ID)
    const isValidWhatsAppId = message.whatsappMessageId && 
      !message.whatsappMessageId.includes('test') && 
      message.whatsappMessageId.startsWith('wamid.') &&
      message.whatsappMessageId.length > 20;

    if (isValidWhatsAppId) {
      try {
        await this.whatsappService.markMessageAsRead(message.whatsappMessageId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to mark WhatsApp message as read: ${errorMessage}`);
        // Continue with local database update even if WhatsApp API fails
      }
    } else {
      console.log(`Skipping WhatsApp API call for test/invalid message ID: ${message.whatsappMessageId}`);
    }

    const readAt = new Date();
    await this.messageRepository.update(messageId, {
      status: MessageStatus.READ,
      readAt,
    });

    const updatedMessage = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['customer', 'user'],
    }) as Message;

    // Emit read status update via WebSocket
    this.conversationsGateway.emitMessageRead(message.conversationId, {
      messageId,
      readAt,
    });
    await this.updateConversationStatus(message.conversationId);

    return updatedMessage;
  }

  async markConversationAsRead(conversationId: number, userId?: number): Promise<void> {
    console.log('🔍 DEBUG - markConversationAsRead called with:', { conversationId, userId });
    
    // Use QueryBuilder to match the same logic as unread queries
    const queryBuilder = this.messageRepository.createQueryBuilder('message')
      .leftJoin('message.conversation', 'conversation')
      .select(['message.id', 'message.whatsappMessageId'])
      .where('message.conversationId = :conversationId', { conversationId })
      .andWhere('message.readAt IS NULL')
      .andWhere('message.direction = :direction', { direction: MessageDirection.INBOUND });

    if (userId) {
      // Filter by conversations assigned to the user OR unassigned conversations
      queryBuilder.andWhere(
        '(conversation.assignedUserId = :userId OR conversation.assignedUserId IS NULL)',
        { userId }
      );
      console.log('🔍 DEBUG - Filtering by assignedUserId OR unassigned:', userId);
    }

    const unreadMessages = await queryBuilder.getMany();
    console.log('🔍 DEBUG - Found unread messages to mark as read:', unreadMessages.length);

    if (unreadMessages.length === 0) {
      return;
    }

    const readAt = new Date();
    const messageIds = unreadMessages.map(msg => msg.id);

    await this.messageRepository.update(
      messageIds,
      {
        status: MessageStatus.READ,
        readAt,
      }
    );

    const whatsappMessageIds = unreadMessages
      .filter(msg => msg.whatsappMessageId)
      .map(msg => msg.whatsappMessageId);

    if (whatsappMessageIds.length > 0) {
      for (const whatsappId of whatsappMessageIds) {
        try {
          await this.whatsappService.markMessageAsRead(whatsappId);
        } catch (error) {
          console.error(`Failed to mark WhatsApp message ${whatsappId} as read:`, error);
        }
      }
    }

    this.conversationsGateway.emitConversationRead(conversationId, {
      messageIds,
      readAt,
    });
    await this.updateConversationStatus(conversationId);
  }

  async getUnreadCount(conversationId?: number, userId?: number): Promise<number> {
    console.log('🔍 DEBUG - getUnreadCount called with:', { conversationId, userId });
    
    const queryBuilder = this.messageRepository.createQueryBuilder('message')
      .leftJoin('message.conversation', 'conversation')
      .where('message.readAt IS NULL')
      .andWhere('message.direction = :direction', { direction: MessageDirection.INBOUND });

    if (conversationId) {
      queryBuilder.andWhere('message.conversationId = :conversationId', { conversationId });
      console.log('🔍 DEBUG - Filtering by conversationId:', conversationId);
    }

    if (userId) {
      // Filter by conversations assigned to the user OR unassigned conversations
      queryBuilder.andWhere(
        '(conversation.assignedUserId = :userId OR conversation.assignedUserId IS NULL)',
        { userId }
      );
      console.log('🔍 DEBUG - Filtering by assignedUserId OR unassigned:', userId);
    }

    // Log the generated SQL for debugging
    const sql = queryBuilder.getSql();
    const parameters = queryBuilder.getParameters();
    console.log('🔍 DEBUG - Generated SQL:', sql);
    console.log('🔍 DEBUG - SQL Parameters:', parameters);

    const count = await queryBuilder.getCount();
    console.log('🔍 DEBUG - Unread count result:', count);
    
    return count;
  }

  async getUnreadMessages(conversationId?: number, userId?: number): Promise<Message[]> {
    const queryBuilder = this.messageRepository.createQueryBuilder('message')
      .leftJoinAndSelect('message.conversation', 'conversation')
      .leftJoinAndSelect('message.customer', 'customer')
      .leftJoinAndSelect('message.user', 'user')
      .where('message.readAt IS NULL')
      .andWhere('message.direction = :direction', { direction: MessageDirection.INBOUND })
      .orderBy('message.createdAt', 'DESC');

    if (conversationId) {
      queryBuilder.andWhere('message.conversationId = :conversationId', { conversationId });
    }

    if (userId) {
      // Filter by conversations assigned to the user OR unassigned conversations
      queryBuilder.andWhere(
        '(conversation.assignedUserId = :userId OR conversation.assignedUserId IS NULL)',
        { userId }
      );
    }

    return queryBuilder.getMany();
  }

  private async updateConversationStatus(conversationId: number): Promise<void> {
    // Check if there are any unread incoming messages in this conversation
    const unreadIncomingCount = await this.messageRepository.count({
      where: {
        conversationId,
        readAt: IsNull(),
        direction: MessageDirection.INBOUND, // Only count incoming messages from clients
      },
    });

    // Get current conversation
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      return;
    }

    // Determine new status based on unread incoming messages
    const newStatus = unreadIncomingCount > 0 ? ConversationStatus.OPEN : ConversationStatus.CLOSED;
    
    // Only update if status has changed
    if (conversation.status !== newStatus) {
      await this.conversationRepository.update(conversationId, {
        status: newStatus,
      });

      // Emit conversation status update via WebSocket
      this.conversationsGateway.emitConversationUpdate(conversationId, {
        status: newStatus,
        unreadIncomingCount,
      });

      console.log(`Conversation ${conversationId} status updated to ${newStatus} (unread incoming messages: ${unreadIncomingCount})`);
    }
  }
  async getUnreadDiagnostics(userId: number) {
    console.log('🔍 DIAGNOSTICS - Starting unread diagnostics for userId:', userId);
    
    // 1. Check total messages
    const totalMessages = await this.messageRepository.count();
    console.log('📊 Total messages in database:', totalMessages);
    
    // 2. Check inbound messages
    const inboundMessages = await this.messageRepository.count({
      where: { direction: MessageDirection.INBOUND }
    });
    console.log('📊 Total inbound messages:', inboundMessages);
    
    // 3. Check unread inbound messages (no user filter)
    const unreadInbound = await this.messageRepository.count({
      where: { 
        direction: MessageDirection.INBOUND,
        readAt: IsNull()
      }
    });
    console.log('📊 Total unread inbound messages:', unreadInbound);
    
    // 4. Check conversations assigned to user
    const userConversations = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoin('message.conversation', 'conversation')
      .select('DISTINCT(conversation.id)', 'conversationId')
      .addSelect('conversation.assignedUserId', 'assignedUserId')
      .where('conversation.assignedUserId = :userId', { userId })
      .getRawMany();
    console.log('📊 Conversations assigned to user:', userConversations);
    
    // 5. Check messages in user's conversations
    const messagesInUserConversations = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoin('message.conversation', 'conversation')
      .where('conversation.assignedUserId = :userId', { userId })
      .andWhere('message.direction = :direction', { direction: MessageDirection.INBOUND })
      .getCount();
    console.log('📊 Inbound messages in user conversations:', messagesInUserConversations);
    
    // 6. Check unread messages in user's conversations
    const unreadInUserConversations = await this.messageRepository
      .createQueryBuilder('message')
      .leftJoin('message.conversation', 'conversation')
      .where('conversation.assignedUserId = :userId', { userId })
      .andWhere('message.direction = :direction', { direction: MessageDirection.INBOUND })
      .andWhere('message.readAt IS NULL')
      .getCount();
    console.log('📊 Unread inbound messages in user conversations:', unreadInUserConversations);
    
    return {
      userId,
      totalMessages,
      inboundMessages,
      unreadInbound,
      userConversations: userConversations.length,
      conversationDetails: userConversations,
      messagesInUserConversations,
      unreadInUserConversations,
      timestamp: new Date().toISOString()
    };
  }

  async getMessageStats(userId?: number) {
    const query = this.messageRepository.createQueryBuilder('message');

    if (userId) {
      query.where('message.userId = :userId', { userId });
    }

    const [totalMessages, sentMessages, receivedMessages] = await Promise.all([
      query.getCount(),
      query.clone().andWhere('message.direction = :direction', { direction: 'outbound' }).getCount(),
      query.clone().andWhere('message.direction = :direction', { direction: 'inbound' }).getCount(),
    ]);

    return {
      totalMessages,
      sentMessages,
      receivedMessages,
    };
  }

  async getMessageDiagnostics() {
    console.log('\ud83d\udd0d DIAGNOSTICS - Starting message storage diagnostics');
    
    try {
      // 1. Total messages count
      const totalMessages = await this.messageRepository.count();
      console.log('\ud83d\udcca Total messages in DB:', totalMessages);
      
      // 2. Messages by direction
      const outboundCount = await this.messageRepository.count({
        where: { direction: MessageDirection.OUTBOUND }
      });
      const inboundCount = await this.messageRepository.count({
        where: { direction: MessageDirection.INBOUND }
      });
      console.log('\ud83d\udcca Outbound messages:', outboundCount);
      console.log('\ud83d\udcca Inbound messages:', inboundCount);
      
      // 3. Recent messages (last 10)
      const recentMessages = await this.messageRepository.find({
        order: { createdAt: 'DESC' },
        take: 10,
        relations: ['conversation', 'user', 'customer']
      });
      
      const recentMessagesSummary = recentMessages.map(m => ({
        id: m.id,
        direction: m.direction,
        type: m.messageType,
        contentLength: m.content?.length || 0,
        hasContent: !!m.content,
        userId: m.userId,
        conversationId: m.conversationId,
        createdAt: m.createdAt
      }));
      
      console.log('\ud83d\udcca Recent messages:', JSON.stringify(recentMessagesSummary, null, 2));
      
      // 4. Check for messages with missing content
      const messagesWithoutContent = await this.messageRepository
        .createQueryBuilder('message')
        .where('message.content IS NULL OR message.content = ""')
        .getMany();
      
      console.log('\u26a0\ufe0f Messages without content:', messagesWithoutContent.length);
      
      // 5. Check conversations and their message counts
      const conversationsWithMessageCounts = await this.messageRepository
        .createQueryBuilder('message')
        .select('message.conversationId', 'conversationId')
        .addSelect('COUNT(message.id)', 'messageCount')
        .addSelect('SUM(LENGTH(message.content))', 'totalContentLength')
        .groupBy('message.conversationId')
        .limit(20)
        .getRawMany();
      
      console.log('\ud83d\udcca Conversations with message counts:', JSON.stringify(conversationsWithMessageCounts, null, 2));
      
      return {
        totalMessages,
        outboundCount,
        inboundCount,
        recentMessages: recentMessagesSummary,
        messagesWithoutContent: messagesWithoutContent.length,
        conversationsWithMessageCounts,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('\u274c Error in getMessageDiagnostics:', error);
      throw error;
    }
  }
}