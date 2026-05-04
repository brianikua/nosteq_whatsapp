# Auto-Reply Feature - Quick Start Guide

## What You Got

This auto-reply feature includes:
- ✅ Backend API endpoints to manage auto-reply rules
- ✅ Automatic keyword detection and response triggering
- ✅ Support for both custom and template-based replies
- ✅ Global and conversation-specific rules
- ✅ Statistics tracking
- ✅ Full database integration

## 5-Minute Setup

### Step 1: Run Database Migration
```bash
# Execute the SQL migration
mysql -u root -p whatsapp_gateway < migrations/001-create-auto-replies-table.sql
```

### Step 2: Restart Your Application
```bash
npm run start:dev
```

### Step 3: Create Your First Auto-Reply Rule
```bash
curl -X POST http://localhost:3000/auto-replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "keyword": "hello",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "Hi there! Thanks for contacting us 👋",
    "caseSensitive": false
  }'
```

### Step 4: Test It
1. Open WhatsApp and message your business number with "hello"
2. You should receive the auto-reply automatically!

## Common Tasks

### Create Global Rule (applies to all conversations)
```bash
curl -X POST http://localhost:3000/auto-replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "keyword": "help",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "Sure! How can I assist you?"
  }'
```

### Get All Rules
```bash
curl -X GET http://localhost:3000/auto-replies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Statistics
```bash
curl -X GET http://localhost:3000/auto-replies/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update a Rule
```bash
curl -X PUT http://localhost:3000/auto-replies/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "customReply": "Updated response message"
  }'
```

### Delete a Rule
```bash
curl -X DELETE http://localhost:3000/auto-replies/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Frontend Integration

The auto-reply tab should appear in the conversation settings. Here's where to add it:

1. In your conversation component/modal
2. Add a new tab: "Auto-Reply"
3. Use the API endpoints above to manage rules
4. Show real-time statistics

See `AUTO_REPLY_DOCUMENTATION.md` for a complete React example.

## File Structure Created

```
src/
├── auto-replies/
│   ├── entities/
│   │   └── auto-reply.entity.ts
│   ├── dto/
│   │   └── auto-reply.dto.ts
│   ├── auto-replies.service.ts
│   ├── auto-replies.controller.ts
│   └── auto-replies.module.ts
```

## Files Modified

- `src/app.module.ts` - Added AutoRepliesModule
- `src/whatsapp/whatsapp.service.ts` - Integrated auto-reply logic
- `src/whatsapp/whatsapp.module.ts` - Added dependencies

## What Happens When Customer Sends a Message

1. Message arrives via WhatsApp webhook
2. Message is saved to database
3. System checks for matching auto-reply rules
4. If match found, auto-reply is sent automatically
5. Reply count incremented for statistics

## Next Steps

1. ✅ Run the database migration
2. ✅ Test with curl commands above
3. ✅ Build frontend tab in conversation settings
4. ✅ Monitor statistics to optimize rules
5. ✅ Train team on using the feature

## Need Help?

Check these files:
- API Documentation: `AUTO_REPLY_DOCUMENTATION.md`
- Database Schema: `migrations/001-create-auto-replies-table.sql`
- Service Logic: `src/auto-replies/auto-replies.service.ts`
- API Integration: `src/whatsapp/whatsapp.service.ts`

## Rate Limiting

Consider adding rate limiting to avoid sending too many auto-replies:
- Currently: First matching rule sends (one per message)
- Future: Add cooldown period per customer
- Future: Add max replies per hour limit
