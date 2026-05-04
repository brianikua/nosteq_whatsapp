#!/usr/bin/env node

/**
 * WhatsApp Webhook Testing Script
 * Tests the updated webhook functionality with signature verification
 */

const crypto = require('crypto');
const axios = require('axios');

// Configuration
const WEBHOOK_URL = 'http://localhost:3000/webhook';
const APP_SECRET = 'test_app_secret';
const VERIFY_TOKEN = 'test_verify_token';

// Test webhook verification
async function testWebhookVerification() {
  console.log('🧪 Testing webhook verification...');

  try {
    const response = await axios.get(WEBHOOK_URL, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'test_challenge_123'
      }
    });

    if (response.data === 'test_challenge_123') {
      console.log('✅ Webhook verification successful');
    } else {
      console.log('❌ Webhook verification failed:', response.data);
    }
  } catch (error) {
    console.error('❌ Webhook verification error:', error.message);
  }
}

// Test webhook signature verification
async function testWebhookSignature() {
  console.log('🧪 Testing webhook signature verification...');

  const webhookData = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test_entry_id',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'test_phone_id'
          },
          messages: [{
            id: 'test_message_id',
            from: '1234567890',
            type: 'text',
            timestamp: Date.now().toString(),
            text: { body: 'Hello from test!' }
          }],
          contacts: [{
            profile: { name: 'Test User' },
            wa_id: '1234567890'
          }]
        },
        field: 'messages'
      }]
    }]
  };

  // Generate valid signature
  const bodyString = JSON.stringify(webhookData);
  const signature = `sha256=${crypto
    .createHmac('sha256', APP_SECRET)
    .update(bodyString, 'utf8')
    .digest('hex')}`;

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'x-hub-signature-256': signature,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 && response.data.status === 'success') {
      console.log('✅ Valid signature webhook accepted');
    } else {
      console.log('❌ Valid signature webhook rejected:', response.data);
    }
  } catch (error) {
    console.error('❌ Valid signature webhook error:', error.response?.data || error.message);
  }

  // Test invalid signature
  try {
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'x-hub-signature-256': 'sha256=invalid_signature',
        'Content-Type': 'application/json'
      }
    });

    console.log('❌ Invalid signature was not rejected:', response.data);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Invalid signature correctly rejected');
    } else {
      console.error('❌ Invalid signature error:', error.response?.data || error.message);
    }
  }
}

// Test message status webhook
async function testMessageStatusWebhook() {
  console.log('🧪 Testing message status webhook...');

  const statusWebhookData = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test_entry_id',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'test_phone_id'
          },
          statuses: [{
            id: 'test_message_id',
            status: 'delivered',
            timestamp: Date.now().toString(),
            recipient_id: '1234567890',
            conversation: {
              id: 'test_conversation_id',
              origin: { type: 'service' }
            },
            pricing: {
              billable: true,
              pricing_model: 'CBP',
              category: 'service'
            }
          }]
        },
        field: 'messages'
      }]
    }]
  };

  const bodyString = JSON.stringify(statusWebhookData);
  const signature = `sha256=${crypto
    .createHmac('sha256', APP_SECRET)
    .update(bodyString, 'utf8')
    .digest('hex')}`;

  try {
    const response = await axios.post(WEBHOOK_URL, statusWebhookData, {
      headers: {
        'x-hub-signature-256': signature,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 && response.data.status === 'success') {
      console.log('✅ Message status webhook processed');
    } else {
      console.log('❌ Message status webhook failed:', response.data);
    }
  } catch (error) {
    console.error('❌ Message status webhook error:', error.response?.data || error.message);
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Starting WhatsApp Webhook Tests...\n');

  // Wait a bit for server to start (in real scenario, start server separately)
  console.log('⏳ Make sure your NestJS server is running on http://localhost:3000\n');

  await testWebhookVerification();
  console.log('');

  await testWebhookSignature();
  console.log('');

  await testMessageStatusWebhook();
  console.log('');

  console.log('🏁 Tests completed!');
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests, testWebhookVerification, testWebhookSignature, testMessageStatusWebhook };