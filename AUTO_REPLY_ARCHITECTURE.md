# Auto-Reply Feature Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       WhatsApp Customer                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Sends Message: "Hello, I need help"
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WhatsApp Cloud API                            │
│                  (meta.com webhook)                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Webhook POST
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│              WhatsAppController.handleWebhook()                  │
│                    (POST /webhook)                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │ Delegates to
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│           WhatsAppService.handleIncomingMessage()                │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. Extract message from webhook payload                 │   │
│  │ 2. Find or create Customer record                       │   │
│  │ 3. Find or create Conversation record                   │   │
│  │ 4. Save Message to database                             │   │
│  │ 5. Call handleAutoReplies()  ◄──────── NEW!             │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│     WhatsAppService.handleAutoReplies() [NEW FEATURE]            │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Call AutoRepliesService.findMatchingRules()              │   │
│  │   - Gets all active rules for conversation              │   │
│  │   - Includes global + conversation-specific rules       │   │
│  │   - Filters by keyword matching                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
    Match Found?              No Match
        │                        │
        ▼                        ▼
    ┌────────┐           End Processing
    │ Loop   │            (Normal Message)
    │ Rules  │
    └────┬───┘
         │
         ▼
   For each rule:
   ┌──────────────────────────────────┐
   │ Get reply content:               │
   │ - If custom: use customReply     │
   │ - If template: fetch template    │
   │   and replace variables          │
   └─────────────┬────────────────────┘
                 │
                 ▼
   ┌──────────────────────────────────┐
   │ Send auto-reply via:             │
   │ WhatsAppService.sendMessage()     │
   │ (Uses WhatsApp Cloud API)         │
   └─────────────┬────────────────────┘
                 │
                 ▼
   ┌──────────────────────────────────┐
   │ Increment reply count:            │
   │ AutoRepliesService.               │
   │ incrementReplyCount(ruleId)       │
   │ (For statistics)                  │
   └──────────────────────────────────┘
```

## Database Schema Integration

```
┌──────────────────────────────────────────────────────────────────┐
│                      Database (MySQL)                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐   ┌─────────────┐   ┌──────────────┐           │
│  │  customers   │   │conversation │   │  messages    │           │
│  ├──────────────┤   ├─────────────┤   ├──────────────┤           │
│  │ id           │   │ id          │   │ id           │           │
│  │ phoneNumber◄─┼───│ customerId  │   │ conversationId           │
│  │ name         │   │ status      │   │ content      │           │
│  │ lastMessageAt│   │ assignedUser│   │ direction    │           │
│  └──────────────┘   └─────────────┘   └──────────────┘           │
│                                                                    │
│        ▲                                                           │
│        │                                                           │
│        └────────────────┐                                         │
│                         │                                         │
│                    ┌─────────────────────┐                        │
│                    │  AUTO_REPLIES [NEW] │ ◄──── NEW TABLE        │
│                    ├─────────────────────┤                        │
│                    │ id                  │                        │
│                    │ conversationId (FK) │                        │
│                    │ keyword             │                        │
│                    │ matchType           │                        │
│                    │ replyType           │                        │
│                    │ customReply         │                        │
│                    │ templateId (FK)     │                        │
│                    │ isActive            │                        │
│                    │ caseSensitive       │                        │
│                    │ replyCount          │                        │
│                    │ createdAt           │                        │
│                    │ updatedAt           │                        │
│                    └─────────────────────┘                        │
│                             △                                     │
│                             │                                     │
│                   ┌─────────────────────┐                        │
│                   │    templates        │                        │
│                   ├─────────────────────┤                        │
│                   │ id                  │                        │
│                   │ templateName        │                        │
│                   │ content             │                        │
│                   │ variables           │                        │
│                   │ status              │                        │
│                   └─────────────────────┘                        │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

## Module Dependency Injection

```
┌─────────────────────────────────────────────────────────────┐
│                     AppModule                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐      ┌──────────────────────────────┐  │
│  │ TypeOrmModule   │      │ Imports:                     │  │
│  ├─────────────────┤      ├──────────────────────────────┤  │
│  │ Entities:       │      │ ✓ AuthModule                 │  │
│  │ • User          │      │ ✓ UsersModule                │  │
│  │ • Customer      │      │ ✓ CustomersModule            │  │
│  │ • Conversation  │      │ ✓ ConversationsModule        │  │
│  │ • Message       │      │ ✓ MessagesModule             │  │
│  │ • Template      │      │ ✓ WhatsAppModule             │  │
│  │ • AutoReply ◄───┼──┐   │ ✓ TemplatesModule            │  │
│  │                 │  │   │ ✓ AutoRepliesModule ◄─ NEW   │  │
│  └─────────────────┘  │   │ ✓ UploadModule               │  │
│                       │   └──────────────────────────────┘  │
│  ┌────────────────────┴──────────────────┐                  │
│  │                                        │                  │
│  ▼                                        ▼                  │
│ ┌────────────────────────┐  ┌─────────────────────────┐    │
│ │ WhatsAppModule         │  │ AutoRepliesModule [NEW] │    │
│ ├────────────────────────┤  ├─────────────────────────┤    │
│ │ Imports:               │  │ Imports:                │    │
│ │ • TypeOrmModule        │  │ • TypeOrmModule         │    │
│ │ • AutoRepliesModule◄───┼──┤   [AutoReply, Template] │    │
│ │                        │  │                         │    │
│ │ Providers:             │  │ Providers:              │    │
│ │ • WhatsAppService      │  │ • AutoRepliesService    │    │
│ │   ├─ Depends on:       │  │                         │    │
│ │   └─ AutoRepliesService◄──┤ Controllers:            │    │
│ │                        │  │ • AutoRepliesController │    │
│ │ Controllers:           │  │                         │    │
│ │ • WhatsAppController   │  │ Exports:                │    │
│ │                        │  │ • AutoRepliesService    │    │
│ └────────────────────────┘  └─────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## API Route Structure

```
HTTP Server
├── POST /webhook
│   └── WhatsAppController.handleWebhook()
│       └── WhatsAppService.handleIncomingMessage()
│           └── WhatsAppService.handleAutoReplies() [NEW]
│
└── /auto-replies [NEW ROUTES]
    ├── POST    Create new rule
    ├── GET     List all rules
    ├── GET /:id    Get specific rule
    ├── PUT /:id    Update rule
    └── DELETE /:id Delete rule
    ├── GET /statistics Get statistics
```

## Keyword Matching Algorithm

```
┌────────────────────────────────────────────┐
│   Input: Message Content & Match Rules     │
└────────────────────────┬───────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │ For each active rule:         │
         └───────────┬───────────────────┘
                     │
            ┌────────▼────────┐
            │  MatchType?     │
            └────────┬────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
         ▼                       ▼
      EXACT               PARTIAL
         │                       │
         │                       ▼
         │          Case Sensitive?
         │          ┌───────┬───────┐
         │          │       │       │
         │          ▼       ▼       ▼
         │         YES     NO    (default)
         │          │       │       │
         │    ┌─────┘       │       └──────┐
         │    │             │              │
         ▼    ▼             ▼              ▼
    Compare  msg ===  msg.lower() === msg.lower() ===
    with     kw       kw.lower()   kw.lower()
    Case                     │         │
    Preserved        No sensitivity  (Ignore case)
         │             │             │
         ├─────────────┴─────────────┘
         │                    ▼
         │          ┌─────────────────┐
         │          │ Check if keyword│
         │          │ appears in msg  │
         │          └────────┬────────┘
         │                   │
         ▼                   ▼
      EXACT           PARTIAL MATCH
      MATCH           (substring)
         │                   │
         └───────────┬───────┘
                     │
                     ▼
         ┌─────────────────────┐
         │   Match Found! ✓    │
         │   Add to results    │
         └─────────────────────┘
```

## Auto-Reply Execution Flow

```
When matching rule is found:

┌──────────────────────────────────────┐
│   Rule found with ID: 5              │
│   ReplyType: CUSTOM                  │
│   CustomReply: "Your message"        │
└──────────┬───────────────────────────┘
           │
           ▼
      ┌────────────────┐
      │ Determine      │
      │ Reply Content  │
      └────┬───────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
  CUSTOM      TEMPLATE
    │             │
    │             ▼
    │      ┌────────────────────┐
    │      │ Fetch from         │
    │      │ Template table     │
    │      │ by templateId      │
    │      └────────┬───────────┘
    │              │
    │              ▼
    │      ┌────────────────────┐
    │      │ Replace variables  │
    │      │ {{variable_name}}  │
    │      │ with actual values │
    │      └────────┬───────────┘
    │              │
    └──────┬───────┘
           │
           ▼
    ┌────────────────────────────────┐
    │ Send via WhatsApp Cloud API     │
    │ WhatsAppService.sendMessage()   │
    │ - Phone Number: from customer   │
    │ - Content: reply message        │
    └────────────┬───────────────────┘
                 │
                 ▼
    ┌────────────────────────────────┐
    │ Update Statistics              │
    │ Increment reply_count for rule │
    │ by 1                           │
    └────────────────────────────────┘
```

## Frontend Tab Location

```
Conversation View
│
├─ Header (Customer Info)
│
├─ Message Display
│
├─ Settings/Options [Tab Navigation]
│  ├─ Tab: "Details"
│  │  └─ Conversation details
│  │
│  ├─ Tab: "Participants" 
│  │  └─ List of participants
│  │
│  ├─ Tab: "Auto-Reply" ◄──── NEW!
│  │  │
│  │  ├─ Rules List
│  │  │  ├─ Rule 1: "hello" → "Hi there!"
│  │  │  ├─ Rule 2: "help" → "How can I assist?"
│  │  │  └─ Statistics section
│  │  │
│  │  ├─ Create New Rule Form
│  │  │  ├─ Keyword input
│  │  │  ├─ Match type (exact/partial)
│  │  │  ├─ Reply type (custom/template)
│  │  │  ├─ Reply content input
│  │  │  └─ Save button
│  │  │
│  │  └─ Statistics Panel
│  │     ├─ Total rules: 5
│  │     ├─ Active: 4
│  │     ├─ Total replies: 234
│  │     └─ Top rules
│  │
│  └─ Tab: "Settings"
│     └─ More options...
│
└─ Message Input Area
```

## Performance Considerations

```
Query Optimization:
├─ Index on (keyword, is_active)
├─ Index on (conversation_id)
└─ Lazy load templates

Caching Strategy:
├─ Cache active rules in memory
├─ Invalidate on update/delete
└─ Refresh every N seconds

Concurrency:
├─ Handle multiple simultaneous messages
├─ Queue auto-replies if needed
└─ Use database locks for consistency
```

---

This architecture ensures:
✅ Clean separation of concerns
✅ Scalable keyword matching
✅ Real-time auto-reply triggering
✅ Comprehensive statistics tracking
✅ Easy frontend integration
