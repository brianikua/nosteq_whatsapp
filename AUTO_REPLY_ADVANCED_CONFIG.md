# Auto-Reply Feature - Advanced Configuration

## Overview
This document covers advanced configuration options and customization for the auto-reply feature.

## Environment Variables (Optional)

Add these to your `.env` file to customize auto-reply behavior:

```env
# Enable/disable auto-replies globally
AUTO_REPLY_ENABLED=true

# Rate limiting per customer (0 = unlimited)
AUTO_REPLY_MAX_PER_CUSTOMER_PER_HOUR=100
AUTO_REPLY_MAX_PER_HOUR=1000

# Delay between auto-reply and message (milliseconds, 0 = no delay)
AUTO_REPLY_DELAY_MS=100

# Enable logging of auto-reply activities
AUTO_REPLY_LOG_ENABLED=true
AUTO_REPLY_LOG_LEVEL=debug
```

## Code Customization

### 1. Custom Keyword Matching Logic

Edit `src/auto-replies/auto-replies.service.ts`:

```typescript
// Current: Simple substring matching
private matchesKeyword(messageContent: string, rule: AutoReply): boolean {
  const keyword = rule.caseSensitive ? rule.keyword : rule.keyword.toLowerCase();
  const content = rule.caseSensitive ? messageContent : messageContent.toLowerCase();

  if (rule.matchType === KeywordMatchType.EXACT) {
    return content === keyword;
  } else if (rule.matchType === KeywordMatchType.PARTIAL) {
    return content.includes(keyword);
  }
  return false;
}

// Customize to: Regex matching
private matchesKeyword(messageContent: string, rule: AutoReply): boolean {
  try {
    const flags = rule.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(rule.keyword, flags);
    return regex.test(messageContent);
  } catch (error) {
    // Fallback to simple matching if regex is invalid
    return messageContent.toLowerCase().includes(rule.keyword.toLowerCase());
  }
}
```

### 2. Custom Auto-Reply Delay/Cooldown

Edit `src/whatsapp/whatsapp.service.ts` - `handleAutoReplies()` method:

```typescript
private async handleAutoReplies(
  conversationId: number,
  messageContent: string,
  customerPhoneNumber: string,
): Promise<void> {
  try {
    const matchingRules = await this.autoRepliesService.findMatchingRules(
      messageContent,
      conversationId,
    );

    if (matchingRules.length === 0) return;

    for (const rule of matchingRules) {
      try {
        // Add delay between processing rules
        await new Promise(resolve => 
          setTimeout(resolve, parseInt(process.env.AUTO_REPLY_DELAY_MS || '100'))
        );

        let replyContent = '';
        // ... rest of the logic
      } catch (error) {
        console.error(`Error processing rule ${rule.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in handleAutoReplies:', error);
  }
}
```

### 3. Rate Limiting Per Customer

Create a new file `src/auto-replies/auto-reply-rate-limiter.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Message } from '../messages/entities/message.entity';

@Injectable()
export class AutoReplyRateLimiter {
  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  async canSendAutoReply(
    customerId: number,
    limit: number = 100,
    hourWindow: number = 1,
  ): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - hourWindow * 60 * 60 * 1000);

    const autoReplyCount = await this.messageRepository.count({
      where: {
        customerId,
        direction: 'outbound',
        createdAt: LessThan(oneHourAgo),
      },
    });

    return autoReplyCount < limit;
  }
}
```

Use in service:
```typescript
// In handleAutoReplies()
const canReply = await this.rateLimiter.canSendAutoReply(customerId);
if (!canReply) {
  console.warn(`Rate limit exceeded for customer ${customerId}`);
  return;
}
```

### 4. Variable Replacement in Custom Replies

Extend custom replies to support customer data:

```typescript
private async replaceVariables(
  content: string,
  customer: Customer,
): Promise<string> {
  let result = content;

  // Replace common variables
  result = result.replace('{{customer_name}}', customer.name);
  result = result.replace('{{phone_number}}', customer.phoneNumber);
  result = result.replace('{{current_time}}', new Date().toLocaleTimeString());
  result = result.replace('{{current_date}}', new Date().toLocaleDateString());

  return result;
}

// Use when sending auto-reply
let replyContent = rule.customReply;
replyContent = await this.replaceVariables(replyContent, customer);
await this.sendMessage(customerPhoneNumber, replyContent);
```

### 5. Conditional Auto-Replies

Create advanced conditional logic:

```typescript
// New enum for rule conditions
enum ConditionType {
  ALWAYS = 'always',
  BUSINESS_HOURS = 'business_hours',
  WORKING_DAYS = 'working_days',
  ONCE_PER_DAY = 'once_per_day',
}

// Update AutoReply entity
@Entity('auto_replies')
export class AutoReply {
  // ... existing properties
  
  @Column({
    type: 'enum',
    enum: ConditionType,
    default: ConditionType.ALWAYS,
  })
  condition: ConditionType;

  @Column({ nullable: true })
  businessHoursStart: string; // "09:00"

  @Column({ nullable: true })
  businessHoursEnd: string; // "17:00"

  @Column({ nullable: true })
  businessHoursTimezone: string; // "America/New_York"
}

// Add validation method
private isConditionMet(rule: AutoReply): boolean {
  if (rule.condition === ConditionType.ALWAYS) {
    return true;
  }

  if (rule.condition === ConditionType.BUSINESS_HOURS) {
    return this.isWithinBusinessHours(
      rule.businessHoursStart,
      rule.businessHoursEnd,
      rule.businessHoursTimezone,
    );
  }

  if (rule.condition === ConditionType.WORKING_DAYS) {
    const today = new Date().getDay();
    return today !== 0 && today !== 6; // Not Sunday or Saturday
  }

  return true;
}
```

### 6. Priority-Based Rule Processing

Modify rule selection to support priorities:

```typescript
// Add to AutoReply entity
@Column({ default: 0 })
priority: number;

// In service, sort by priority
async findMatchingRules(
  messageContent: string,
  conversationId: number,
): Promise<AutoReply[]> {
  const rules = await this.autoReplyRepository.find({
    where: [...],
    order: { priority: 'DESC', createdAt: 'DESC' },
  });

  return rules.filter(rule => this.matchesKeyword(messageContent, rule));
}

// Only send first/highest priority auto-reply
for (const rule of matchingRules.slice(0, 1)) {
  // Send auto-reply
}
```

### 7. Webhook for Custom Processing

Add a webhook notification when auto-reply is sent:

```typescript
private async notifyWebhook(
  ruleId: number,
  customerId: number,
  messageContent: string,
  replyContent: string,
): Promise<void> {
  try {
    const webhookUrl = process.env.AUTO_REPLY_WEBHOOK_URL;
    if (!webhookUrl) return;

    await axios.post(webhookUrl, {
      event: 'auto_reply_sent',
      ruleId,
      customerId,
      messageContent,
      replyContent,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Error notifying webhook:', error);
  }
}
```

### 8. Analytics Enhancement

Create detailed analytics:

```typescript
@Entity('auto_reply_analytics')
export class AutoReplyAnalytics {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ruleId: number;

  @Column()
  customerId: number;

  @Column({ type: 'text' })
  inboundMessage: string;

  @Column({ type: 'text' })
  autoReplyMessage: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ nullable: true })
  responseTime: number; // ms

  @Column({ default: false })
  customerResponded: boolean;

  @Column({ nullable: true })
  customerResponseTime: number; // seconds until customer replied
}
```

### 9. A/B Testing Different Replies

Create rule variants for testing:

```typescript
@Column({ nullable: true })
variantId: string; // For A/B testing

@Column({ nullable: true })
variantLabel: string; // "variant_a" or "variant_b"

// Track which variant was sent
async recordAnalytics(
  ruleId: number,
  customerId: number,
  message: string,
  reply: string,
  rule: AutoReply,
): Promise<void> {
  const analytics = this.analyticsRepository.create({
    ruleId,
    customerId,
    inboundMessage: message,
    autoReplyMessage: reply,
    variantId: rule.variantId,
  });
  await this.analyticsRepository.save(analytics);
}
```

### 10. Cache Active Rules for Performance

Add in-memory caching:

```typescript
import { CacheModule, CacheService } from '@nestjs/cache-manager';

// In auto-replies.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([AutoReply, Template]),
    CacheModule.register(),
  ],
  // ...
})
export class AutoRepliesModule {}

// In auto-replies.service.ts
constructor(
  private cacheService: CacheService,
  // ...
) {}

async findMatchingRules(
  messageContent: string,
  conversationId: number,
): Promise<AutoReply[]> {
  // Try cache first
  const cacheKey = `rules_${conversationId}`;
  const cachedRules = await this.cacheService.get(cacheKey);
  
  if (cachedRules) {
    return cachedRules.filter(r => this.matchesKeyword(messageContent, r));
  }

  // Get from database
  const rules = await this.autoReplyRepository.find({...});

  // Cache for 5 minutes
  await this.cacheService.set(cacheKey, rules, 300000);

  return rules.filter(r => this.matchesKeyword(messageContent, r));
}

// Invalidate cache on update
async update(id: number, dto: UpdateAutoReplyDto): Promise<AutoReply> {
  const rule = await this.findById(id);
  Object.assign(rule, dto);
  await this.autoReplyRepository.save(rule);

  // Invalidate cache for all conversations
  await this.cacheService.reset();

  return rule;
}
```

## Feature Flags

Use feature flags to enable/disable advanced features:

```env
AUTO_REPLY_ENABLED=true
AUTO_REPLY_RATE_LIMITING_ENABLED=false
AUTO_REPLY_BUSINESS_HOURS_ENABLED=false
AUTO_REPLY_VARIABLES_ENABLED=false
AUTO_REPLY_WEBHOOKS_ENABLED=false
AUTO_REPLY_CACHING_ENABLED=true
AUTO_REPLY_ANALYTICS_ENABLED=false
```

## Performance Tuning

### Database Indexes
```sql
-- Add these indexes for better performance
CREATE INDEX idx_auto_reply_active ON auto_replies(is_active);
CREATE INDEX idx_auto_reply_keyword ON auto_replies(keyword(100), is_active);
CREATE INDEX idx_auto_reply_conversation ON auto_replies(conversation_id, is_active);
CREATE INDEX idx_auto_reply_priority ON auto_replies(priority DESC, conversation_id);
```

### Query Optimization
```typescript
// Load only active rules
findMatchingRules() {
  return this.autoReplyRepository.find({
    where: { isActive: true },
    select: ['id', 'keyword', 'matchType', 'caseSensitive', 'customReply', 'templateId'],
  });
}
```

## Monitoring & Logging

```typescript
// Add to service
private logger = new Logger('AutoReplies');

async handleAutoReplies() {
  const startTime = Date.now();
  
  try {
    // ... auto-reply logic
    
    const duration = Date.now() - startTime;
    this.logger.log(`Auto-reply processed in ${duration}ms`);
  } catch (error) {
    this.logger.error(`Auto-reply error: ${error.message}`);
  }
}
```

## Testing Advanced Features

```typescript
// Unit test for custom matching
describe('CustomKeywordMatching', () => {
  it('should match regex patterns', () => {
    const rule = { keyword: '^order[0-9]+$', matchType: 'regex' };
    expect(service.matchesKeyword('order123', rule)).toBe(true);
  });
});

// Integration test
describe('AutoReplyWithVariables', () => {
  it('should replace {{customer_name}} variable', async () => {
    const customer = { name: 'John' };
    const result = await service.replaceVariables(
      'Hello {{customer_name}}!',
      customer,
    );
    expect(result).toBe('Hello John!');
  });
});
```

---

These customizations allow you to extend the auto-reply system with advanced features tailored to your specific needs.
