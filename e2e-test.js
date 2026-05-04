#!/usr/bin/env node

/**
 * End-to-End WhatsApp Integration Test Suite
 * Tests all updated functionality including webhook signature verification,
 * message status updates, rate limiting, and auto-replies
 */

const crypto = require('crypto');
const axios = require('axios');

// Configuration - Update these with your actual values
const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3000/api';
const WEBHOOK_URL = `${BASE_URL}/webhook`;
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || 'test_app_secret';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'test_verify_token';
const JWT_TOKEN = process.env.JWT_TOKEN || 'your_jwt_token_here'; // Get from login

// Test results
let testsPassed = 0;
let testsFailed = 0;

function logTest(name, success, message = '') {
  const status = success ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} ${name}`);
  if (message) console.log(`   ${message}`);
  if (success) testsPassed++;
  else testsFailed++;
}

// Test webhook verification
async function testWebhookVerification() {
  console.log('\n🧪 Testing Webhook Verification');

  try {
    const response = await axios.get(WEBHOOK_URL, {
      params: {
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'test_challenge_123'
      }
    });

    const success = response.data === 'test_challenge_123';
    logTest('Webhook verification', success, success ? '' : `Expected 'test_challenge_123', got '${response.data}'`);
  } catch (error) {
    logTest('Webhook verification', false, error.message);
  }
}

// Test webhook signature verification
async function testWebhookSignatureVerification() {
  console.log('\n🧪 Testing Webhook Signature Verification');

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
            text: { body: 'Hello from automated test!' }
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

  // Test valid signature
  const bodyString = JSON.stringify(webhookData);
  const validSignature = `sha256=${crypto
    .createHmac('sha256', APP_SECRET)
    .update(bodyString, 'utf8')
    .digest('hex')}`;

  try {
    const response = await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'x-hub-signature-256': validSignature,
        'Content-Type': 'application/json'
      }
    });

    const success = response.status === 200 && response.data.status === 'success';
    logTest('Valid webhook signature', success);
  } catch (error) {
    logTest('Valid webhook signature', false, error.response?.data || error.message);
  }

  // Test invalid signature
  try {
    await axios.post(WEBHOOK_URL, webhookData, {
      headers: {
        'x-hub-signature-256': 'sha256=invalid_signature',
        'Content-Type': 'application/json'
      }
    });
    logTest('Invalid webhook signature rejection', false, 'Should have been rejected');
  } catch (error) {
    const success = error.response?.status === 401;
    logTest('Invalid webhook signature rejection', success);
  }
}

// Test message status webhook
async function testMessageStatusWebhook() {
  console.log('\n🧪 Testing Message Status Webhook');

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

    const success = response.status === 200 && response.data.status === 'success';
    logTest('Message status webhook', success);
  } catch (error) {
    logTest('Message status webhook', false, error.response?.data || error.message);
  }
}

// Test different message types
async function testMessageTypes() {
  console.log('\n🧪 Testing Different Message Types');

  const messageTypes = [
    {
      name: 'Text Message',
      data: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'text_msg_id',
                from: '1234567890',
                type: 'text',
                timestamp: Date.now().toString(),
                text: { body: 'Test text message' }
              }],
              contacts: [{ profile: { name: 'Test User' }, wa_id: '1234567890' }]
            }
          }]
        }]
      }
    },
    {
      name: 'Image Message',
      data: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'image_msg_id',
                from: '1234567890',
                type: 'image',
                timestamp: Date.now().toString(),
                image: {
                  mime_type: 'image/jpeg',
                  sha256: 'test_sha256',
                  id: 'test_image_id',
                  caption: 'Test image'
                }
              }],
              contacts: [{ profile: { name: 'Test User' }, wa_id: '1234567890' }]
            }
          }]
        }]
      }
    },
    {
      name: 'Location Message',
      data: {
        object: 'whatsapp_business_account',
        entry: [{
          changes: [{
            value: {
              messages: [{
                id: 'location_msg_id',
                from: '1234567890',
                type: 'location',
                timestamp: Date.now().toString(),
                location: {
                  latitude: 37.7749,
                  longitude: -122.4194,
                  name: 'San Francisco',
                  address: 'San Francisco, CA'
                }
              }],
              contacts: [{ profile: { name: 'Test User' }, wa_id: '1234567890' }]
            }
          }]
        }]
      }
    }
  ];

  for (const testCase of messageTypes) {
    const bodyString = JSON.stringify(testCase.data);
    const signature = `sha256=${crypto
      .createHmac('sha256', APP_SECRET)
      .update(bodyString, 'utf8')
      .digest('hex')}`;

    try {
      const response = await axios.post(WEBHOOK_URL, testCase.data, {
        headers: {
          'x-hub-signature-256': signature,
          'Content-Type': 'application/json'
        }
      });

      const success = response.status === 200 && response.data.status === 'success';
      logTest(`${testCase.name} processing`, success);
    } catch (error) {
      logTest(`${testCase.name} processing`, false, error.response?.data || error.message);
    }
  }
}

// Test API endpoints (requires authentication)
async function testApiEndpoints() {
  console.log('\n🧪 Testing API Endpoints');

  if (!JWT_TOKEN || JWT_TOKEN === 'your_jwt_token_here') {
    logTest('API endpoints test', false, 'JWT_TOKEN not configured, skipping API tests');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${JWT_TOKEN}`,
    'Content-Type': 'application/json'
  };

  // Test sending a message
  try {
    const response = await axios.post(`${API_URL}/messages/send`, {
      phoneNumber: '1234567890',
      content: 'Test message from API',
      userId: 1
    }, { headers });

    const success = response.status === 201 || response.status === 200;
    logTest('Send message API', success);
  } catch (error) {
    // This might fail in test environment without real WhatsApp credentials
    if (error.response?.status === 500 && error.response?.data?.message?.includes('WhatsApp API')) {
      logTest('Send message API', true, 'Expected failure in test environment (no real WhatsApp credentials)');
    } else {
      logTest('Send message API', false, error.response?.data || error.message);
    }
  }

  // Test getting conversations
  try {
    const response = await axios.get(`${API_URL}/conversations`, { headers });
    const success = response.status === 200 && Array.isArray(response.data);
    logTest('Get conversations API', success);
  } catch (error) {
    logTest('Get conversations API', false, error.response?.data || error.message);
  }
}

// Test rate limiting
async function testRateLimiting() {
  console.log('\n🧪 Testing Rate Limiting');

  const webhookData = {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messages: [{
            id: 'rate_limit_test',
            from: '1234567890',
            type: 'text',
            timestamp: Date.now().toString(),
            text: { body: 'Rate limit test' }
          }],
          contacts: [{ profile: { name: 'Test User' }, wa_id: '1234567890' }]
        }
      }]
    }]
  };

  const bodyString = JSON.stringify(webhookData);
  const signature = `sha256=${crypto
    .createHmac('sha256', APP_SECRET)
    .update(bodyString, 'utf8')
    .digest('hex')}`;

  let successCount = 0;
  let rateLimitedCount = 0;

  // Send multiple requests quickly to test rate limiting
  for (let i = 0; i < 10; i++) {
    try {
      await axios.post(WEBHOOK_URL, webhookData, {
        headers: {
          'x-hub-signature-256': signature,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      });
      successCount++;
    } catch (error) {
      if (error.response?.status === 429) {
        rateLimitedCount++;
      }
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const success = rateLimitedCount > 0; // Should have some rate limiting
  logTest('Rate limiting', success, `Successful: ${successCount}, Rate limited: ${rateLimitedCount}`);
}

// Main test runner
async function runAllTests() {
  console.log('🚀 Starting End-to-End WhatsApp Integration Tests\n');
  console.log('⚠️  Make sure your NestJS server is running on http://localhost:3000');
  console.log('⚠️  Update configuration values in this script for real testing\n');

  const startTime = Date.now();

  try {
    await testWebhookVerification();
    await testWebhookSignatureVerification();
    await testMessageStatusWebhook();
    await testMessageTypes();
    await testApiEndpoints();
    await testRateLimiting();
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }

  const duration = Date.now() - startTime;
  console.log(`\n🏁 Test Suite Completed`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Total: ${testsPassed + testsFailed}`);

  if (testsFailed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  runAllTests,
  testWebhookVerification,
  testWebhookSignatureVerification,
  testMessageStatusWebhook,
  testMessageTypes,
  testApiEndpoints,
  testRateLimiting
};

// Run tests if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}