import { Controller, Post, Body, Get, Query, HttpCode, Headers } from '@nestjs/common';
import { WhatsAppService } from './whatsapp.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhook')
export class WhatsAppController {
  constructor(
    private whatsappService: WhatsAppService,
    private configService: ConfigService,
  ) {}

  // WhatsApp webhook verification
  @Get()
  verifyWebhook(@Query() query: any) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    const verifyToken = this.configService.get('WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified');
      return challenge;
    }
    return 'Verification failed';
  }

  // WhatsApp webhook receiver
  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    console.log('Webhook received:', JSON.stringify(body, null, 2));
    
    if (body.object === 'whatsapp_business_account') {
      await this.whatsappService.handleIncomingMessage(body, signature);
      return { status: 'success' };
    }
    
    return { status: 'ignored' };
  }
}