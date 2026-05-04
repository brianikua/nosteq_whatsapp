import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Conversation, ConversationStatus } from '../conversations/entities/conversation.entity';
import { Message, MessageDirection, MessageType, MessageStatus } from '../messages/entities/message.entity';
import { AutoRepliesService } from '../auto-replies/auto-replies.service';
import { Template } from '../templates/entities/template.entity';
import { ConversationsGateway } from '../conversations/conversations.gateway';
import axios from 'axios';
import * as crypto from 'crypto';

@Injectable()
export class WhatsAppService {
  private apiUrl: string;
  private apiToken: string;
  private phoneNumberId: string;
  private appSecret: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
    @InjectRepository(Template)
    private templateRepository: Repository<Template>,
    private autoRepliesService: AutoRepliesService,
    private conversationsGateway: ConversationsGateway,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL') || 'https://graph.facebook.com/v23.0';
    this.apiToken = this.configService.get<string>('WHATSAPP_API_TOKEN') || '';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
    this.appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET') || '';
  }

  /**
   * Verify webhook signature for security
   */
  verifyWebhookSignature(requestBody: string, signature: string): boolean {
    if (!this.appSecret) {
      console.warn('WHATSAPP_APP_SECRET not configured, skipping signature verification');
      return true; // Allow in development
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(requestBody, 'utf8')
      .digest('hex');

    const expectedSignatureWithPrefix = `sha256=${expectedSignature}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignatureWithPrefix)
    );
  }

  async handleIncomingMessage(webhookData: any, signature?: string) {
    try {
      // Verify webhook signature if provided
      if (signature) {
        const isValidSignature = this.verifyWebhookSignature(JSON.stringify(webhookData), signature);
        if (!isValidSignature) {
          console.error('❌ Invalid webhook signature');
          throw new HttpException('Invalid signature', 401);
        }
      }

      console.log('🔄 Processing incoming webhook:', JSON.stringify(webhookData).substring(0, 200) + '...');
      
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        console.log('⚠️ No value in webhook, skipping');
        return { success: true, message: 'No value to process' };
      }

      // Handle messages (incoming user messages)
      if (value.messages && value.messages.length > 0) {
        return await this.handleIncomingMessages(value);
      }

      // Handle statuses (outgoing message status updates)
      if (value.statuses && value.statuses.length > 0) {
        return await this.handleMessageStatuses(value);
      }

      // Handle other webhook types (contacts, errors, etc.)
      if (value.contacts) {
        console.log('📞 Contacts webhook received');
        // Handle contact updates if needed
      }

      if (value.errors) {
        console.log('❌ Errors webhook received:', value.errors);
        // Handle system/app/account errors
      }

      console.log('ℹ️ Unhandled webhook type');
      return { success: true, message: 'Webhook processed but no action taken' };
    } catch (error) {
      console.error('❌ Error handling incoming webhook:', error);
      throw new HttpException('Failed to process webhook', 500);
    }
  }

  /**
   * Handle incoming messages from users
   */
  private async handleIncomingMessages(value: any) {
    const message = value.messages[0];
    const phoneNumber = message.from;
    let messageContent = '';
    let messageType = message.type;

    // Extract content based on message type
    switch (message.type) {
      case 'text':
        messageContent = message.text?.body || '';
        break;
      case 'image':
        messageContent = message.image?.caption || '[Image]';
        break;
      case 'video':
        messageContent = message.video?.caption || '[Video]';
        break;
      case 'document':
        messageContent = message.document?.caption || message.document?.filename || '[Document]';
        break;
      case 'audio':
        messageContent = '[Audio message]';
        break;
      case 'location':
        messageContent = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
        break;
      case 'contacts':
        messageContent = `[Contact: ${message.contacts?.[0]?.name?.formatted_name || 'Unknown'}]`;
        break;
      case 'reaction':
        messageContent = `[Reaction: ${message.reaction?.emoji}]`;
        break;
      default:
        messageContent = `[${message.type} message]`;
        break;
    }

    console.log('🔄 Processing message from:', phoneNumber, 'Type:', messageType);

    // Find or create customer
    let customer = await this.customerRepository.findOne({
      where: { phoneNumber },
    });

    if (!customer) {
      console.log('🔄 Creating new customer for:', phoneNumber);
      customer = this.customerRepository.create({
        phoneNumber,
        name: value.contacts?.[0]?.profile?.name || phoneNumber,
        lastMessageAt: new Date(),
      });
      await this.customerRepository.save(customer);
      console.log('✅ Customer created with ID:', customer.id);
    } else {
      console.log('🔄 Updating existing customer:', customer.id);
      customer.lastMessageAt = new Date();
      await this.customerRepository.save(customer);
    }

    // Find or create conversation
    let conversation = await this.conversationRepository.findOne({
      where: { customerId: customer.id },
      order: { lastMessageAt: 'DESC' },
    });

    if (!conversation) {
      console.log('🔄 Creating new conversation for customer:', customer.id);
      conversation = this.conversationRepository.create({
        customerId: customer.id,
        status: ConversationStatus.OPEN,
        lastMessageAt: new Date(),
      });
      await this.conversationRepository.save(conversation);
      console.log('✅ Conversation created with ID:', conversation.id);
    } else {
      console.log('🔄 Reusing conversation:', conversation.id);
      conversation.status = ConversationStatus.OPEN;
      conversation.lastMessageAt = new Date();
      await this.conversationRepository.save(conversation);
    }

    // Save message
    const messageData = {
      conversationId: conversation.id,
      customerId: customer.id,
      direction: MessageDirection.INBOUND,
      content: messageContent,
      messageType: messageType as MessageType,
      whatsappMessageId: message.id,
      metadata: message,
      status: MessageStatus.DELIVERED,
    };

    console.log('💾 Saving incoming message:', { 
      conversationId: messageData.conversationId,
      customerId: messageData.customerId,
      contentLength: messageData.content.length,
      type: messageData.messageType
    });

    const newMessage = this.messageRepository.create(messageData);
    const savedMessage = await this.messageRepository.save(newMessage);

    console.log('✅ Message saved with ID:', savedMessage.id);

    // Check for auto-replies (only for text messages)
    if (message.type === 'text' && messageContent.trim()) {
      await this.handleAutoReplies(conversation.id, messageContent, customer.phoneNumber);
    }

    return {
      success: true,
      customer,
      conversation,
      message: savedMessage,
    };
  }

  /**
   * Handle status updates for outgoing messages
   */
  private async handleMessageStatuses(value: any) {
    const status = value.statuses[0];
    const whatsappMessageId = status.id;
    const statusType = status.status;

    console.log('📊 Processing message status update:', { whatsappMessageId, statusType });

    // Find the message in our database
    const message = await this.messageRepository.findOne({
      where: { whatsappMessageId },
    });

    if (!message) {
      console.log('⚠️ Message not found for status update:', whatsappMessageId);
      return { success: true, message: 'Message not found' };
    }

    // Update message status based on WhatsApp status
    let newStatus: MessageStatus;
    switch (statusType) {
      case 'sent':
        newStatus = MessageStatus.SENT;
        break;
      case 'delivered':
        newStatus = MessageStatus.DELIVERED;
        break;
      case 'read':
        newStatus = MessageStatus.READ;
        break;
      case 'failed':
        newStatus = MessageStatus.FAILED;
        break;
      default:
        console.log('⚠️ Unknown status type:', statusType);
        return { success: true, message: 'Unknown status type' };
    }

    // Update the message status
    message.status = newStatus;
    await this.messageRepository.save(message);

    console.log('✅ Message status updated:', { messageId: message.id, status: newStatus });

    // Emit real-time update via WebSocket if needed
    // This would integrate with your conversations gateway

    return {
      success: true,
      messageId: message.id,
      status: newStatus,
    };
  }

  private async handleAutoReplies(
    conversationId: number,
    messageContent: string,
    customerPhoneNumber: string,
  ): Promise<void> {
    try {
      console.log('\ud83d\udd0d Checking for auto-reply rules for conversation:', conversationId);

      // Find matching auto-reply rules
      const matchingRules = await this.autoRepliesService.findMatchingRules(
        messageContent,
        conversationId,
      );

      if (matchingRules.length === 0) {
        console.log('\u26a0\ufe0f No matching auto-reply rules found for this message');
        return;
      }

      console.log(`\ud83d\udd04 Found ${matchingRules.length} matching auto-reply rule(s)`);

      // Process each matching rule
      for (const rule of matchingRules) {
        try {
          let replyContent = '';

          if (rule.replyType === 'custom' && rule.customReply) {
            replyContent = rule.customReply;
          } else if (rule.replyType === 'template' && rule.templateId) {
            // Get template content
            const template = await this.templateRepository.findOne({
              where: { id: rule.templateId },
            });

            if (template) {
              replyContent = template.content;
              // Replace variables if needed
              if (template.variables && Object.keys(template.variables).length > 0) {
                Object.entries(template.variables).forEach(([key, value]) => {
                  replyContent = replyContent.replace(new RegExp(`{{${key}}}`, 'g'), value as string);
                });
              }
            }
          }

          if (replyContent) {
            console.log('\ud83d\udd04 Sending auto-reply for rule ID:', rule.id);
            
            // Send the auto-reply
            await this.sendMessage(customerPhoneNumber, replyContent);

            // Increment reply count
            await this.autoRepliesService.incrementReplyCount(rule.id);

            console.log('\u2705 Auto-reply sent successfully for rule ID:', rule.id);
          }
        } catch (error) {
          console.error(`\u274c Error sending auto-reply for rule ID ${rule.id}:`, error);
          // Don't stop processing other rules if one fails
        }
      }
    } catch (error) {
      console.error('\u274c Error handling auto-replies:', error);
      // Don't throw - allow message processing to continue even if auto-reply fails
    }
  private rateLimitCache = new Map<string, number>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 1000; // Adjust based on your tier

  /**
   * Check rate limit for API calls
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.RATE_LIMIT_WINDOW;
    
    // Clean old entries
    for (const [key, timestamp] of this.rateLimitCache.entries()) {
      if (timestamp < windowStart) {
        this.rateLimitCache.delete(key);
      }
    }

    // Check current request count
    const currentRequests = this.rateLimitCache.size;
    if (currentRequests >= this.RATE_LIMIT_MAX_REQUESTS) {
      console.warn('⚠️ Rate limit exceeded');
      return false;
    }

    // Add current request
    this.rateLimitCache.set(`req_${now}_${Math.random()}`, now);
    return true;
  }

  /**
   * Retry mechanism for API calls
   */
  private async retryApiCall<T>(
    apiCall: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ API call attempt ${attempt} failed:`, error.message);

        // Don't retry on authentication errors
        if (error.response?.status === 401 || error.response?.status === 403) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const waitTime = delayMs * Math.pow(2, attempt - 1);
          console.log(`⏳ Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    throw lastError;
  }
  async sendMessage(phoneNumber: string, content: string, userId?: number) {
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new HttpException('Rate limit exceeded', 429);
    }

    return this.retryApiCall(async () => {
      console.log('WhatsApp API Request:', {
        url: `${this.apiUrl}/${this.phoneNumberId}/messages`,
        data: {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: { 
            preview_url: false,
            body: content 
          },
        },
        headers: {
          Authorization: `Bearer ${this.apiToken?.substring(0, 20)}...`, // Log partial token for security
          'Content-Type': 'application/json',
        },
      });

      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: { 
            preview_url: false,
            body: content 
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('WhatsApp API Success Response:', response.data);
      return response.data;
    });
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string,
    userId?: number,
  ) {
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new HttpException('Rate limit exceeded', 429);
    }

    return this.retryApiCall(async () => {
      console.log('WhatsApp API Request:', {
        url: `${this.apiUrl}`,
        data: {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: mediaType,
          [mediaType]: { id: await this.uploadMedia(mediaUrl, mediaType) },
        },
        headers: {
          Authorization: `Bearer ${this.apiToken?.substring(0, 20)}...`, // Log partial token for security
          'Content-Type': 'application/json',
        },
      });

      // First, upload the media to WhatsApp if it's a URL
      const mediaId = await this.uploadMedia(mediaUrl, mediaType);

      const messagePayload: any = {
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: mediaType,
        [mediaType]: { id: mediaId },
      };

      // Add caption for supported media types
      if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
        messagePayload[mediaType].caption = caption;
      }

      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        messagePayload,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('WhatsApp API Success Response:', response.data);
      return response.data;
    });
  }

  private async uploadMedia(mediaUrl: string, mediaType: string): Promise<string> {
    try {
      // Download the media file first
      const mediaResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
      const mediaBuffer = Buffer.from(mediaResponse.data);

      // Create form data for the upload
      const FormData = require('form-data');
      const formData = new FormData();
      
      // Add the media file
      formData.append('file', mediaBuffer, {
        filename: `media.${this.getFileExtension(mediaType)}`,
        contentType: this.getContentType(mediaType),
      });
      
      // Add required parameters
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', mediaType);

      console.log('WhatsApp Media Upload Request:', {
        url: `${this.apiUrl}/${this.phoneNumberId}/media`,
        headers: {
          Authorization: `Bearer ${this.apiToken?.substring(0, 20)}...`,
          ...formData.getHeaders(),
        },
      });

      // Upload to WhatsApp Media API
      const uploadResponse = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/media`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            ...formData.getHeaders(),
          },
        },
      );

      console.log('WhatsApp Media Upload Success Response:', uploadResponse.data);
      return uploadResponse.data.id;
    } catch (error) {
      console.error('WhatsApp Media Upload Error Details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: {
            ...error.config?.headers,
            Authorization: error.config?.headers?.Authorization?.substring(0, 20) + '...'
          }
        }
      });

      if (error.response?.data) {
        console.error('WhatsApp Media Upload Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }

      throw new HttpException(
        `WhatsApp Media Upload Error: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  private getFileExtension(mediaType: string): string {
    const extensions = {
      image: 'jpg',
      video: 'mp4',
      audio: 'ogg',
      document: 'pdf',
    };
    return extensions[mediaType as keyof typeof extensions] || 'bin';
  }

  private getContentType(mediaType: string): string {
    const contentTypes = {
      image: 'image/jpeg',
      video: 'video/mp4',
      audio: 'audio/ogg',
      document: 'application/pdf',
    };
    return contentTypes[mediaType as keyof typeof contentTypes] || 'application/octet-stream';
  }

  async markMessageAsRead(whatsappMessageId: string) {
    // Check rate limit
    if (!this.checkRateLimit()) {
      throw new HttpException('Rate limit exceeded', 429);
    }

    return this.retryApiCall(async () => {
      const readEndpoint = `${this.apiUrl}/${this.phoneNumberId}/messages`;
      
      console.log('WhatsApp Mark Read API Request:', {
        url: readEndpoint,
        data: {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: whatsappMessageId,
        },
        headers: {
          Authorization: `Bearer ${this.apiToken?.substring(0, 20)}...`, // Log partial token for security
          'Content-Type': 'application/json',
        },
      });

      const response = await axios.post(
        readEndpoint,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: whatsappMessageId,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      console.log('WhatsApp Mark Read API Success Response:', response.data);
      return response.data;
    });
  }
}
