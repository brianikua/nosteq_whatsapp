# Auto-Reply Feature - Setup Verification Checklist

Use this checklist to verify your auto-reply feature is properly installed and configured.

## ✅ Pre-Setup Checklist

Before you start, make sure you have:

- [ ] SSH/Remote access to your server or local development environment
- [ ] Database client installed (mysql, MySQL Workbench, or similar)
- [ ] Your JWT token for API testing
- [ ] Access to WhatsApp Business Account (to test)
- [ ] NestJS application running

---

## ✅ Installation Verification

### 1. Backend Files Created
```bash
# Check if auto-replies module exists
ls -la src/auto-replies/
```
You should see:
- [ ] `auto-reply.entity.ts`
- [ ] `auto-reply.dto.ts`
- [ ] `auto-replies.service.ts`
- [ ] `auto-replies.controller.ts`
- [ ] `auto-replies.module.ts`
- [ ] `entities/` directory
- [ ] `dto/` directory

### 2. Files Modified
```bash
# Verify modifications
grep -n "AutoRepliesModule" src/app.module.ts
grep -n "handleAutoReplies" src/whatsapp/whatsapp.service.ts
grep -n "AutoRepliesModule" src/whatsapp/whatsapp.module.ts
```
Should find matches:
- [ ] App module imports AutoRepliesModule
- [ ] App module has AutoReply entity
- [ ] WhatsApp service has handleAutoReplies method
- [ ] WhatsApp module imports AutoRepliesModule

### 3. Database Migration File
```bash
# Check migration exists
ls -la migrations/001-create-auto-replies-table.sql
```
File should exist:
- [ ] `migrations/001-create-auto-replies-table.sql`

### 4. Documentation Files
```bash
# Check documentation
ls -la AUTO_REPLY*.md
```
Files should exist:
- [ ] `AUTO_REPLY_README.md`
- [ ] `AUTO_REPLY_QUICKSTART.md`
- [ ] `AUTO_REPLY_DOCUMENTATION.md`
- [ ] `AUTO_REPLY_ARCHITECTURE.md`
- [ ] `AUTO_REPLY_IMPLEMENTATION_COMPLETE.md`
- [ ] `AUTO_REPLY_ADVANCED_CONFIG.md`

---

## ✅ Database Setup

### 1. Run Migration
```bash
# Execute migration
mysql -u root -p whatsapp_gateway < migrations/001-create-auto-replies-table.sql
```
Response should be clean without errors.
- [ ] Migration executed successfully

### 2. Verify Table Created
```bash
# Connect to database and check
mysql -u root -p
> use whatsapp_gateway;
> SHOW TABLES LIKE 'auto_replies';
```
Should show:
- [ ] `auto_replies` table exists

### 3. Verify Table Structure
```bash
mysql> DESC auto_replies;
```
Should have these columns:
- [ ] `id` (INT, PK, AUTO_INCREMENT)
- [ ] `conversation_id` (INT, nullable, FK)
- [ ] `keyword` (LONGTEXT)
- [ ] `match_type` (ENUM: exact, partial)
- [ ] `reply_type` (ENUM: custom, template)
- [ ] `custom_reply` (LONGTEXT, nullable)
- [ ] `template_id` (INT, nullable)
- [ ] `is_active` (BOOLEAN, default: true)
- [ ] `case_sensitive` (BOOLEAN, default: false)
- [ ] `reply_count` (INT, default: 0)
- [ ] `created_at` (TIMESTAMP)
- [ ] `updated_at` (TIMESTAMP)

### 4. Verify Indexes
```bash
mysql> SHOW INDEXES FROM auto_replies;
```
Should have indexes on:
- [ ] `conversation_id`
- [ ] `keyword`

---

## ✅ Application Startup

### 1. Clean Build
```bash
# Stop any running processes
npm run build
```
Should complete without errors:
- [ ] Build successful
- [ ] No TypeScript compilation errors

### 2. Start Application
```bash
npm run start:dev
```
Look for in logs:
- [ ] No errors about AutoRepliesModule
- [ ] No errors about AutoReply entity
- [ ] Database connection established
- [ ] Server listening on port 3000

### 3. Verify Module Loading
```bash
# Check logs for module initialization
grep -i "auto.reply" logs/application.log
# Or watch startup logs
tail -f logs/application.log | grep -i auto
```
Should see:
- [ ] Auto-replies module initialized
- [ ] AutoReply entity loaded
- [ ] No dependency injection errors

---

## ✅ API Testing

### 1. Test Authentication
```bash
curl -X GET http://localhost:3000/auto-replies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Should return:
- [ ] Status 200
- [ ] Empty array `[]`

### 2. Test Create Endpoint
```bash
curl -X POST http://localhost:3000/auto-replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "keyword": "test",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "Test reply"
  }'
```
Should return:
- [ ] Status 201
- [ ] Response with `id` field
- [ ] All fields echoed back

### 3. Test Read Endpoint
```bash
curl -X GET http://localhost:3000/auto-replies \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Should return:
- [ ] Status 200
- [ ] Array with at least one rule

### 4. Test Statistics Endpoint
```bash
curl -X GET http://localhost:3000/auto-replies/statistics \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Should return:
- [ ] Status 200
- [ ] JSON with stats (totalRules, activeRules, etc.)

### 5. Test Update Endpoint
```bash
curl -X PUT http://localhost:3000/auto-replies/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"customReply": "Updated"}'
```
Should return:
- [ ] Status 200
- [ ] Updated rule with new content

### 6. Test Delete Endpoint
```bash
curl -X DELETE http://localhost:3000/auto-replies/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
Should return:
- [ ] Status 200
- [ ] Success message

---

## ✅ Integration Testing

### 1. Database Entry Verified
```bash
# Check that rule was created
mysql> SELECT * FROM auto_replies;
```
Should show:
- [ ] At least one row
- [ ] All columns populated correctly

### 2. Test WhatsApp Integration
1. Create a test auto-reply rule:
```bash
curl -X POST http://localhost:3000/auto-replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "keyword": "hello",
    "matchType": "partial",
    "replyType": "custom",
    "customReply": "Hi! This is an auto-reply."
  }'
```
- [ ] Rule created successfully

2. Send a WhatsApp message to your business number with "hello"
- [ ] Auto-reply received within 5 seconds
- [ ] Auto-reply content matches what you configured

3. Check statistics:
```bash
curl -X GET http://localhost:3000/auto-replies/statistics \
  -H "Authorization: Bearer TOKEN"
```
- [ ] `reply_count` increased by 1
- [ ] Statistics reflect the sent auto-reply

---

## ✅ Code Quality Checks

### 1. TypeScript Compilation
```bash
npx tsc --noEmit
```
Should show:
- [ ] No TypeScript errors
- [ ] No compilation warnings (optional)

### 2. Linting
```bash
npm run lint
```
Should show:
- [ ] No critical errors in auto-replies code
- [ ] Code follows project conventions

### 3. Code Import Check
```bash
# Verify imports work
node -e "const m = require('./src/auto-replies/auto-replies.module'); console.log('Imports OK')"
```
Should output:
- [ ] "Imports OK"
- [ ] No module not found errors

---

## ✅ Performance Checks

### 1. Database Query Speed
```bash
# Measure keyword matching query
mysql> SELECT COUNT(*) FROM auto_replies WHERE is_active = 1;
```
Should complete:
- [ ] Instantly (< 100ms)
- [ ] Without errors

### 2. API Response Time
```bash
# Time the GET request
time curl -X GET http://localhost:3000/auto-replies \
  -H "Authorization: Bearer TOKEN" > /dev/null 2>&1
```
Should complete in:
- [ ] Less than 500ms
- [ ] No timeout errors

---

## ✅ Documentation Review

### 1. Main README
```bash
# Open in editor
cat AUTO_REPLY_README.md | head -20
```
Should contain:
- [ ] Quick start instructions
- [ ] Links to other documentation
- [ ] Table of contents

### 2. Quick Start Guide
```bash
# Verify it has step-by-step instructions
grep -i "step" AUTO_REPLY_QUICKSTART.md | head -5
```
Should have:
- [ ] Database setup step
- [ ] Application restart step
- [ ] API test step

### 3. Complete Documentation
```bash
# Verify API documentation exists
grep -i "endpoint" AUTO_REPLY_DOCUMENTATION.md | head -3
```
Should contain:
- [ ] API endpoint documentation
- [ ] Frontend integration example
- [ ] React component code

---

## ✅ Troubleshooting

If you encounter issues, check:

### Application Won't Start
- [ ] Run `npm install` to ensure dependencies installed
- [ ] Check that port 3000 is not in use
- [ ] Verify database connection settings in `.env`
- [ ] Check for TypeScript errors with `npx tsc --noEmit`

### Database Migration Failed
- [ ] Verify MySQL server is running
- [ ] Check database credentials
- [ ] Ensure database `whatsapp_gateway` exists
- [ ] Try running migration manually in MySQL client

### API Returns 401
- [ ] Verify JWT token is valid
- [ ] Token might be expired - get a new one
- [ ] Check Authorization header format: `Bearer TOKEN`

### Auto-Replies Not Sending
- [ ] Verify rule is active (`is_active = 1`)
- [ ] Check keyword matches message content
- [ ] Verify WhatsApp webhook is configured correctly
- [ ] Check server logs for errors: `tail -f logs/application.log`

### Database Table Not Created
- [ ] Run migration: `mysql -u root -p < migrations/001-create-auto-replies-table.sql`
- [ ] Verify with: `SHOW TABLES LIKE 'auto_replies';`

---

## ✅ Production Readiness Checklist

Before deploying to production:

- [ ] Database backup created
- [ ] Migration tested on staging environment
- [ ] API endpoints tested with production tokens
- [ ] Error logging configured
- [ ] Performance tested with realistic data volume
- [ ] Security review completed
- [ ] Rate limiting configured (if needed)
- [ ] Team trained on usage
- [ ] Documentation reviewed
- [ ] Rollback plan documented

---

## ✅ Post-Setup Tasks

### 1. Create Frontend Component
- [ ] Design UI for auto-reply tab
- [ ] Implement React/Vue/Angular component
- [ ] Integrate with existing conversation settings

### 2. Setup Monitoring
- [ ] Configure logging for auto-replies
- [ ] Setup alerts for errors
- [ ] Track statistics

### 3. Team Training
- [ ] Document how to create rules
- [ ] Train support team on feature
- [ ] Create user guide

### 4. Testing in Production
- [ ] Create test rules
- [ ] Verify auto-replies work
- [ ] Monitor statistics
- [ ] Collect user feedback

---

## ✅ Sign-Off

When everything checks out, mark complete:

- [ ] All backend files present
- [ ] Database migration successful
- [ ] Application starts without errors
- [ ] API endpoints respond correctly
- [ ] Auto-replies trigger properly
- [ ] Statistics tracking works
- [ ] Documentation complete
- [ ] Team trained
- [ ] Ready for production deployment

---

## 📞 Support

If any checks fail:
1. Review the relevant documentation file
2. Check server logs for error details
3. Verify all installation steps were completed
4. Run the test script: `./auto-reply-tests.sh TOKEN`

**Status**: Ready for deployment ✅
