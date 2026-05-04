import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { WhatsAppController } from '../src/whatsapp/whatsapp.controller';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../src/customers/entities/customer.entity';
import { Conversation } from '../src/conversations/entities/conversation.entity';
import { Message } from '../src/messages/entities/message.entity';
import { Template } from '../src/templates/entities/template.entity';
import { AutoRepliesService } from '../src/auto-replies/auto-replies.service';

describe('WhatsAppController (e2e)', () => {
  let app: INestApplication<App>;
  let whatsappService: WhatsAppService;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAutoRepliesService = {
    findMatchingRules: jest.fn(),
    incrementReplyCount: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WhatsAppController],
      providers: [
        WhatsAppService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                WHATSAPP_API_URL: 'https://graph.facebook.com/v23.0',
                WHATSAPP_API_TOKEN: 'test_token',
                WHATSAPP_PHONE_NUMBER_ID: 'test_phone_id',
                WHATSAPP_APP_SECRET: 'test_app_secret',
                WEBHOOK_VERIFY_TOKEN: 'test_verify_token',
              };
              return config[key];
            }),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Conversation),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Message),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Template),
          useValue: mockRepository,
        },
        {
          provide: AutoRepliesService,
          useValue: mockAutoRepliesService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    whatsappService = moduleFixture.get<WhatsAppService>(WhatsAppService);
    await app.init();
  });

  describe('/webhook (GET)', () => {
    it('should verify webhook successfully', () => {
      return request(app.getHttpServer())
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'test_verify_token',
          'hub.challenge': 'test_challenge'
        })
        .expect(200)
        .expect('test_challenge');
    });

    it('should fail webhook verification with wrong token', () => {
      return request(app.getHttpServer())
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': 'test_challenge'
        })
        .expect(200)
        .expect('Verification failed');
    });
  });

  describe('/webhook (POST)', () => {
    it('should handle webhook with valid signature', async () => {
      const webhookData = {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'test_message_id',
                from: '1234567890',
                type: 'text',
                text: { body: 'Hello' }
              }],
              contacts: [{
                profile: { name: 'Test User' },
                wa_id: '1234567890'
              }]
            }
          }]
        }]
      };

      const bodyString = JSON.stringify(webhookData);
      const signature = `sha256=${require('crypto')
        .createHmac('sha256', 'test_app_secret')
        .update(bodyString, 'utf8')
        .digest('hex')}`;

      // Mock the service method
      jest.spyOn(whatsappService, 'handleIncomingMessage').mockResolvedValue({
        success: true,
        message: 'Webhook processed'
      });

      return request(app.getHttpServer())
        .post('/webhook')
        .set('x-hub-signature-256', signature)
        .send(webhookData)
        .expect(200)
        .expect({ status: 'success' });
    });

    it('should reject webhook with invalid signature', () => {
      const webhookData = {
        object: 'whatsapp_business_account',
        entry: []
      };

      return request(app.getHttpServer())
        .post('/webhook')
        .set('x-hub-signature-256', 'sha256=invalid_signature')
        .send(webhookData)
        .expect(401);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});