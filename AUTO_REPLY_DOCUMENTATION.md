# Auto-Reply Feature Documentation

## Overview
The Auto-Reply feature allows you to automatically respond to customers when they send messages containing specific keywords. This is useful for:
- Quick acknowledgment of order inquiries
- Providing instant business hours information
- Answering frequently asked questions
- Sending automated confirmations

## Features

### 1. **Keyword Matching**
- **Exact Match**: Message content must exactly match the keyword (case-sensitive optional)
- **Partial Match**: Keyword can appear anywhere in the message
- **Case Sensitivity**: Toggle case-sensitive matching per rule

### 2. **Reply Types**
- **Custom Reply**: Send a custom text message
- **Template-Based Reply**: Use existing templates from your templates library

### 3. **Scope**
- **Global Rules**: Apply to all conversations
- **Conversation-Specific Rules**: Apply only to a specific conversation

### 4. **Statistics**
Track auto-reply effectiveness with:
- Total rules created
- Active/inactive rules count
- Total auto-replies sent
- Top-performing rules

## API Endpoints

### Create Auto-Reply Rule
```
POST /auto-replies
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "keyword": "hello",
  "matchType": "partial",        // or "exact"
  "replyType": "custom",         // or "template"
  "customReply": "Hi! Thanks for reaching out. How can I help?",
  "templateId": null,            // Leave null for custom replies
  "caseSensitive": false,
  "conversationId": null         // Leave null for global rules
}
```

### Get All Auto-Reply Rules
```
GET /auto-replies?conversationId=123
Authorization: Bearer <JWT_TOKEN>
```

### Get Statistics
```
GET /auto-replies/statistics?conversationId=123
Authorization: Bearer <JWT_TOKEN>
```

### Update Auto-Reply Rule
```
PUT /auto-replies/:id
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>

{
  "keyword": "updated keyword",
  "isActive": true,
  "customReply": "Updated response"
}
```

### Delete Auto-Reply Rule
```
DELETE /auto-replies/:id
Authorization: Bearer <JWT_TOKEN>
```

## Setup Instructions

### 1. Database Migration
Run the migration script to create the `auto_replies` table:

```bash
mysql -u your_username -p your_database < migrations/001-create-auto-replies-table.sql
```

Or manually execute the SQL from `migrations/001-create-auto-replies-table.sql` in your database client.

### 2. Restart Application
After running the migration, restart your NestJS application:

```bash
npm run start:dev
```

The TypeORM synchronization will detect the new entity if you have `synchronize: true` in development mode.

## Frontend Implementation

To add the auto-reply tab to your frontend within conversation settings:

### Example React Implementation

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

export const AutoReplyTab = ({ conversationId }) => {
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({
    keyword: '',
    matchType: 'partial',
    replyType: 'custom',
    customReply: '',
    templateId: null,
    caseSensitive: false,
  });

  useEffect(() => {
    fetchRules();
  }, [conversationId]);

  const fetchRules = async () => {
    try {
      const response = await axios.get(`/auto-replies?conversationId=${conversationId}`);
      setRules(response.data);
    } catch (error) {
      console.error('Error fetching rules:', error);
    }
  };

  const handleCreate = async () => {
    try {
      await axios.post('/auto-replies', {
        ...newRule,
        conversationId,
      });
      setNewRule({
        keyword: '',
        matchType: 'partial',
        replyType: 'custom',
        customReply: '',
        templateId: null,
        caseSensitive: false,
      });
      fetchRules();
    } catch (error) {
      console.error('Error creating rule:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/auto-replies/${id}`);
      fetchRules();
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };

  const handleToggleActive = async (id, isActive) => {
    try {
      await axios.put(`/auto-replies/${id}`, { isActive: !isActive });
      fetchRules();
    } catch (error) {
      console.error('Error updating rule:', error);
    }
  };

  return (
    <div className="auto-reply-tab">
      <h3>Auto-Reply Rules</h3>

      {/* Create New Rule Form */}
      <div className="new-rule-form">
        <input
          type="text"
          placeholder="Enter keyword"
          value={newRule.keyword}
          onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
        />

        <select
          value={newRule.matchType}
          onChange={(e) => setNewRule({ ...newRule, matchType: e.target.value })}
        >
          <option value="partial">Partial Match</option>
          <option value="exact">Exact Match</option>
        </select>

        <select
          value={newRule.replyType}
          onChange={(e) => setNewRule({ ...newRule, replyType: e.target.value })}
        >
          <option value="custom">Custom Reply</option>
          <option value="template">Use Template</option>
        </select>

        {newRule.replyType === 'custom' ? (
          <textarea
            placeholder="Enter auto-reply message"
            value={newRule.customReply}
            onChange={(e) => setNewRule({ ...newRule, customReply: e.target.value })}
          />
        ) : (
          <select
            onChange={(e) => setNewRule({ ...newRule, templateId: parseInt(e.target.value) })}
          >
            <option value="">Select Template</option>
            {/* Load templates from your templates API */}
          </select>
        )}

        <label>
          <input
            type="checkbox"
            checked={newRule.caseSensitive}
            onChange={(e) => setNewRule({ ...newRule, caseSensitive: e.target.checked })}
          />
          Case Sensitive
        </label>

        <button onClick={handleCreate}>Add Rule</button>
      </div>

      {/* Existing Rules List */}
      <div className="rules-list">
        {rules.map((rule) => (
          <div key={rule.id} className="rule-item">
            <div className="rule-info">
              <strong>Keyword:</strong> {rule.keyword}
              <br />
              <strong>Type:</strong> {rule.matchType}
              <br />
              <strong>Reply Count:</strong> {rule.replyCount}
            </div>

            <div className="rule-actions">
              <button
                onClick={() => handleToggleActive(rule.id, rule.isActive)}
                className={rule.isActive ? 'btn-disable' : 'btn-enable'}
              >
                {rule.isActive ? 'Disable' : 'Enable'}
              </button>
              <button onClick={() => handleDelete(rule.id)} className="btn-delete">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

## Examples

### Example 1: FAQ Auto-Reply
**Keyword**: "pricing"
**Match Type**: Partial
**Reply Type**: Custom
**Reply**: "We have flexible pricing plans! Visit our website or contact our sales team for more details."

### Example 2: Business Hours
**Keyword**: "open hours"
**Match Type**: Exact
**Reply Type**: Custom
**Reply**: "We're open Monday-Friday 9AM-6PM EST. Weekend support available."

### Example 3: Order Confirmation
**Keyword**: "order"
**Match Type**: Partial
**Reply Type**: Template
**Template**: Use your "Order Confirmation" template

## Best Practices

1. **Keep Keywords Simple**: Use common, single-word keywords for better matching
2. **Test Your Rules**: Create rules for a specific conversation first before making them global
3. **Use Templates**: For consistent messaging, use templates instead of custom replies
4. **Monitor Statistics**: Regularly check which rules are most effective
5. **Avoid Overlap**: Be careful with overlapping keywords - first matching rule will reply
6. **Case Sensitivity**: Leave unchecked for broader matching, check for precise keywords

## Troubleshooting

### Auto-replies not being sent
1. Ensure the rule is marked as `isActive: true`
2. Check that the keyword matches your test message
3. Verify the rule is either global or linked to the correct conversation
4. Check application logs for any error messages

### Too many auto-replies
1. Use exact match instead of partial match
2. Make keywords more specific
3. Consider the order of rules

## Support
For issues or questions, check the application logs with:
```bash
# View logs
tail -f logs/application.log

# Search for auto-reply errors
grep "Auto-reply" logs/application.log
```
