#!/bin/bash

# Auto-Reply Feature - Test Script
# This script helps test the auto-reply API endpoints
# Usage: bash auto-reply-tests.sh <your-jwt-token>

JWT_TOKEN=$1
API_URL="http://localhost:3000"

if [ -z "$JWT_TOKEN" ]; then
    echo "Usage: bash auto-reply-tests.sh <your-jwt-token>"
    echo ""
    echo "Example:"
    echo "  bash auto-reply-tests.sh eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    exit 1
fi

echo "🚀 Starting Auto-Reply API Tests..."
echo "API URL: $API_URL"
echo "JWT Token: ${JWT_TOKEN:0:20}..."
echo ""

# Test 1: Create a global auto-reply rule
echo "📝 Test 1: Creating a global auto-reply rule..."
RULE_1=$(curl -s -X POST "$API_URL/auto-replies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "keyword": "hello",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "Hi! Welcome to our support. How can I help you today?",
    "caseSensitive": false
  }')

echo "$RULE_1" | jq '.'
RULE_1_ID=$(echo "$RULE_1" | jq -r '.id')
echo "✅ Rule created with ID: $RULE_1_ID"
echo ""

# Test 2: Create another rule for "help" keyword
echo "📝 Test 2: Creating another auto-reply rule..."
RULE_2=$(curl -s -X POST "$API_URL/auto-replies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "keyword": "help",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "I am here to help! What do you need assistance with?",
    "caseSensitive": false
  }')

echo "$RULE_2" | jq '.'
RULE_2_ID=$(echo "$RULE_2" | jq -r '.id')
echo "✅ Rule created with ID: $RULE_2_ID"
echo ""

# Test 3: Get all auto-reply rules
echo "📊 Test 3: Fetching all auto-reply rules..."
curl -s -X GET "$API_URL/auto-replies" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Rules fetched"
echo ""

# Test 4: Get statistics
echo "📈 Test 4: Fetching statistics..."
curl -s -X GET "$API_URL/auto-replies/statistics" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Statistics fetched"
echo ""

# Test 5: Get a specific rule
echo "🔍 Test 5: Fetching specific rule..."
curl -s -X GET "$API_URL/auto-replies/$RULE_1_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Rule fetched"
echo ""

# Test 6: Update a rule
echo "✏️  Test 6: Updating a rule..."
curl -s -X PUT "$API_URL/auto-replies/$RULE_1_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "customReply": "Hello! Welcome to our updated support team. We are excited to help you!"
  }' | jq '.'
echo "✅ Rule updated"
echo ""

# Test 7: Create a conversation-specific rule
echo "📝 Test 7: Creating a conversation-specific rule..."
curl -s -X POST "$API_URL/auto-replies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "keyword": "urgent",
    "matchType": "exact",
    "replyType": "custom",
    "customReply": "This is marked as urgent! Our team will respond immediately.",
    "caseSensitive": false,
    "conversationId": 1
  }' | jq '.'
echo "✅ Conversation-specific rule created"
echo ""

# Test 8: Test case-sensitive matching
echo "📝 Test 8: Creating a case-sensitive rule..."
curl -s -X POST "$API_URL/auto-replies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "keyword": "VIP",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "VIP customer detected! Thank you for your loyalty.",
    "caseSensitive": true
  }' | jq '.'
echo "✅ Case-sensitive rule created"
echo ""

# Test 9: Test exact match
echo "📝 Test 9: Creating an exact match rule..."
RULE_9=$(curl -s -X POST "$API_URL/auto-replies" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "keyword": "pricing",
    "matchType": "exact",
    "replyType": "custom",
    "customReply": "Our pricing is very competitive. Visit our website for details.",
    "caseSensitive": false
  }')

echo "$RULE_9" | jq '.'
RULE_9_ID=$(echo "$RULE_9" | jq -r '.id')
echo "✅ Exact match rule created with ID: $RULE_9_ID"
echo ""

# Test 10: Disable a rule
echo "🔇 Test 10: Disabling a rule..."
curl -s -X PUT "$API_URL/auto-replies/$RULE_9_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "isActive": false
  }' | jq '.'
echo "✅ Rule disabled"
echo ""

# Test 11: Get statistics for specific conversation
echo "📈 Test 11: Fetching statistics for conversation 1..."
curl -s -X GET "$API_URL/auto-replies/statistics?conversationId=1" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Statistics fetched for conversation"
echo ""

# Test 12: Delete a rule
echo "🗑️  Test 12: Deleting a rule..."
curl -s -X DELETE "$API_URL/auto-replies/$RULE_9_ID" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Rule deleted"
echo ""

# Test 13: Final statistics check
echo "📊 Test 13: Final statistics check..."
curl -s -X GET "$API_URL/auto-replies/statistics" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.'
echo "✅ Final statistics fetched"
echo ""

echo "🎉 All tests completed!"
echo ""
echo "Next steps:"
echo "1. Test manually by sending WhatsApp messages with keywords"
echo "2. Verify auto-replies are being sent"
echo "3. Check reply counts in statistics"
echo "4. Build the frontend UI"
