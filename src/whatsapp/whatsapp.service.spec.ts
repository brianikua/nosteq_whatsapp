import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppService } from '../src/whatsapp/whatsapp.service';
import { Customer } from '../src/customers/entities/customer.entity';
import { Conversation } from '../src/conversations/entities/conversation.entity';
import { Message } from '../src/messages/entities/message.entity';
import { Template } from '../src/templates/entities/template.entity';
import { AutoRepliesService } from '../src/auto-replies/auto-replies.service';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let configService: ConfigService;

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
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<WhatsAppService>(WhatsAppService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid signature', () => {
      const body = '{"test": "data"}';
      const secret = 'test_app_secret';
      const expectedSignature = require('crypto')
        .createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('hex');
      const signature = `sha256=${expectedSignature}`;

      const result = service.verifyWebhookSignature(body, signature);
      expect(result).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const body = '{"test": "data"}';
      const signature = 'sha256=invalid_signature';

      const result = service.verifyWebhookSignature(body, signature);
      expect(result).toBe(false);
    });

    it('should return true when app secret is not configured (development mode)', () => {
      // Mock config to return undefined for app secret
      jest.spyOn(configService, 'get').mockReturnValueOnce(undefined);

      const result = service.verifyWebhookSignature('test', 'test');
      expect(result).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      // Access private method for testing
      const checkRateLimit = (service as any).checkRateLimit.bind(service);

      // Should allow initial requests
      expect(checkRateLimit()).toBe(true);
      expect(checkRateLimit()).toBe(true);
    });
  });
});