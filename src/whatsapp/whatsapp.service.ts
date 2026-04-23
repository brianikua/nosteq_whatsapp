import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../customers/entities/customer.entity';
import { Conversation, ConversationStatus } from '../conversations/entities/conversation.entity';
import { Message, MessageDirection, MessageType } from '../messages/entities/message.entity';
import axios from 'axios';

@Injectable()
export class WhatsAppService {
  private apiUrl: string;
  private apiToken: string;
  private phoneNumberId: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Conversation)
    private conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {
    this.apiUrl = this.configService.get<string>('WHATSAPP_API_URL') || 'https://graph.facebook.com/v22.0';
    this.apiToken = this.configService.get<string>('WHATSAPP_API_TOKEN') || '';
    this.phoneNumberId = this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
  }

  async handleIncomingMessage(webhookData: any) {
    try {
      console.log('\ud83d\udd04 Processing incoming webhook:', JSON.stringify(webhookData).substring(0, 200) + '...');
      
      const entry = webhookData.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) {
        console.log('\u26a0\ufe0f No message in webhook, skipping');
        return { success: true, message: 'No message to process' };
      }

      const phoneNumber = message.from;
      const messageText = message.text?.body || '';
      const messageType = message.type;

      console.log('\ud83d\udd04 Processing message from:', phoneNumber, 'Type:', messageType);

      // Find or create customer
      let customer = await this.customerRepository.findOne({
        where: { phoneNumber },
      });

      if (!customer) {
        console.log('\ud83d\udd04 Creating new customer for:', phoneNumber);
        customer = this.customerRepository.create({
          phoneNumber,
          name: value.contacts?.[0]?.profile?.name || phoneNumber,
          lastMessageAt: new Date(),
        });
        await this.customerRepository.save(customer);
        console.log('\u2705 Customer created with ID:', customer.id);
      } else {
        console.log('\ud83d\udd04 Updating existing customer:', customer.id);
        customer.lastMessageAt = new Date();
        await this.customerRepository.save(customer);
      }

      // Find or create conversation - reuse existing conversation for same customer
      let conversation = await this.conversationRepository.findOne({
        where: { customerId: customer.id },
        order: { lastMessageAt: 'DESC' }, // Get the most recent conversation
      });

      if (!conversation) {
        console.log('\ud83d\udd04 Creating new conversation for customer:', customer.id);
        conversation = this.conversationRepository.create({
          customerId: customer.id,
          status: ConversationStatus.OPEN,
          lastMessageAt: new Date(),
        });
        await this.conversationRepository.save(conversation);
        console.log('\u2705 Conversation created with ID:', conversation.id);
      } else {
        console.log('\ud83d\udd04 Reusing conversation:', conversation.id);
        conversation.status = ConversationStatus.OPEN;
        conversation.lastMessageAt = new Date();
        await this.conversationRepository.save(conversation);
      }

      // Save message with proper content preservation
      const messageData = {
        conversationId: conversation.id,
        customerId: customer.id,
        direction: MessageDirection.INBOUND,
        content: messageText,
        messageType: messageType as MessageType,
        whatsappMessageId: message.id,
        metadata: message,
        status: MessageStatus.DELIVERED,
      };

      console.log('\ud83d\udcbe Saving incoming message:', { 
        conversationId: messageData.conversationId,
        customerId: messageData.customerId,
        contentLength: messageData.content.length,
        type: messageData.messageType
      });

      const newMessage = this.messageRepository.create(messageData);
      const savedMessage = await this.messageRepository.save(newMessage);

      console.log('\u2705 Message saved with ID:', savedMessage.id, 'Content length:', savedMessage.content?.length || 0);

      if (!savedMessage.id) {
        throw new Error('Message was not saved - no ID returned');
      }

      return {
        success: true,
        customer,
        conversation,
        message: savedMessage,
      };
    } catch (error) {
      console.error('\u274c Error handling incoming message:', error);
      throw new HttpException('Failed to process message', 500);
    }
  }

  async sendMessage(phoneNumber: string, content: string, userId?: number) {
    try {
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
    } catch (error) {
      console.error('WhatsApp API Error Details:', {
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
        console.error('WhatsApp API Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }

      throw new HttpException(
        `WhatsApp API Error: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }

  async sendMediaMessage(
    phoneNumber: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string,
    userId?: number,
  ) {
    try {
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
    } catch (error) {
      console.error('WhatsApp API Error Details:', {
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
        console.error('WhatsApp API Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }

      throw new HttpException(
        `WhatsApp API Error: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
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
    try {
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
    } catch (error) {
      console.error('WhatsApp Mark Read API Error Details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        whatsappMessageId,
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
        console.error('WhatsApp Mark Read API Error Response Body:', JSON.stringify(error.response.data, null, 2));
      }

      throw new HttpException(
        `WhatsApp Mark Read API Error: ${error.response?.data?.error?.message || error.message}`,
        error.response?.status || 500
      );
    }
  }
}
