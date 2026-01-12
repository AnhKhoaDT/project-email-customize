# Database Seed Data

This directory contains scripts to populate the database with sample data for testing and demonstration.

## 📋 What Gets Seeded

The seed script creates:

### 1. **Sample Users** (3 accounts)
- `demo@example.com` / `Demo123!`
- `alice@example.com` / `Alice123!`
- `bob@example.com` / `Bob123!`

### 2. **Sample Emails** (15 emails per user)
- **Inbox emails**: Welcome messages, reports, reminders
- **Starred emails**: Important project updates
- **Sent emails**: Replies to questions
- **Drafts**: Unfinished proposals
- **Spam**: Fake promotional emails
- **Archive**: Old newsletters
- **Trash**: Deleted emails

### 3. **Kanban Configurations**
Each user gets a default Kanban board with 4 columns:
- **Inbox** (Blue) - Mapped to Gmail INBOX
- **To Do** (Red) - Mapped to Gmail STARRED
- **In Progress** (Orange) - Mapped to Gmail IMPORTANT
- **Done** (Green) - Mapped to Gmail ARCHIVE

## 🚀 How to Run

### Prerequisites
1. Make sure MongoDB is running
2. Make sure `.env` file is configured with correct `MONGODB_URI`

### Run the Seeder

```bash
# From the backend directory
cd backend

# Run the seed script
npm run seed
```

### Expected Output

```
🌱 Starting database seeding...

🗑️  Clearing existing data...
✅ Existing data cleared

👥 Creating sample users...
  ✓ Created user: demo@example.com
  ✓ Created user: alice@example.com
  ✓ Created user: bob@example.com
✅ Created 3 users

📧 Creating sample emails...
  ✓ Created 15 emails for demo@example.com
  ✓ Created 15 emails for alice@example.com
  ✓ Created 15 emails for bob@example.com
✅ Created 45 total emails

📋 Creating Kanban configurations...
  ✓ Created Kanban config for demo@example.com
  ✓ Created Kanban config for alice@example.com
  ✓ Created Kanban config for bob@example.com
✅ Created 3 Kanban configurations

🎉 Seeding completed successfully!

📊 Summary:
  - Users: 3
  - Emails: 45
  - Kanban configs: 3

📝 Sample credentials:
  - demo@example.com / Demo123!
  - alice@example.com / Alice123!
  - bob@example.com / Bob123!

✨ You can now login with any of these accounts!
```

## ⚠️ Important Notes

### Data Clearing
By default, the seed script **clears all existing data** before seeding:
```typescript
await userModel.deleteMany({});
await emailMetadataModel.deleteMany({});
await kanbanConfigModel.deleteMany({});
```

If you want to **keep existing data** and only add sample data, comment out these lines in `seed.ts`.

### Gmail Integration
The seeded emails are **metadata only** - they don't exist in real Gmail accounts. To test with real Gmail:
1. Login with a real Gmail account via OAuth
2. The app will sync real emails from Gmail
3. The seed data is useful for testing the UI and database queries

## 🔧 Customization

You can customize the seed data by editing `src/seed/seed.ts`:

### Add More Users
```typescript
const SAMPLE_USERS = [
  {
    email: 'yourname@example.com',
    name: 'Your Name',
    password: 'YourPassword123!',
    phone: '+84901234567',
    address: 'Your City',
  },
  // ... add more
];
```

### Add More Email Templates
```typescript
const EMAIL_TEMPLATES = [
  {
    subject: 'Your custom subject',
    from: 'sender@example.com',
    snippet: 'Email preview text...',
    labelIds: ['INBOX', 'STARRED'],
  },
  // ... add more
];
```

### Customize Kanban Columns
```typescript
const KANBAN_CONFIGS = [
  {
    columns: [
      {
        id: 'col_custom',
        name: 'Custom Column',
        order: 0,
        gmailLabel: 'CUSTOM_LABEL',
        color: '#FF6B6B',
        isVisible: true,
      },
      // ... add more columns
    ],
  },
];
```

## 📚 Use Cases

### 1. Development
- Quick setup for new developers
- Consistent test data across team
- No need to manually create accounts

### 2. Testing
- Test email filtering and search
- Test Kanban drag-and-drop
- Test different user scenarios

### 3. Demonstration
- Show features to stakeholders
- Create screenshots for documentation
- Demo the app without real Gmail data

## 🐛 Troubleshooting

### Error: "Cannot connect to MongoDB"
- Check if MongoDB is running: `mongosh` or `mongo`
- Verify `MONGODB_URI` in `.env` file
- Check network/firewall settings

### Error: "Duplicate key error"
- The seed script tries to clear data first
- If it fails, manually clear the database:
  ```bash
  mongosh
  use mail-project-db
  db.users.deleteMany({})
  db.emailmetadata.deleteMany({})
  db.kanbanconfigs.deleteMany({})
  ```

### Emails not showing in UI
- Make sure backend is running: `npm run dev`
- Check browser console for errors
- Verify API endpoints are working

## 📝 Database Schema

The seed script populates these collections:

### `users`
```typescript
{
  email: string;
  name: string;
  passwordHash: string;
  phone?: string;
  address?: string;
  googleRefreshToken?: string;
  isSemanticSearchIndexed: boolean;
}
```

### `emailmetadata`
```typescript
{
  userId: string;
  emailId: string;
  threadId: string;
  labelIds: string[];
  cachedColumnId?: string;
  cachedColumnName?: string;
  subject?: string;
  from?: string;
  snippet?: string;
  receivedDate?: Date;
  syncStatus: { state: string; retryCount: number };
  isSnoozed: boolean;
}
```

### `kanbanconfigs`
```typescript
{
  userId: string;
  columns: Array<{
    id: string;
    name: string;
    order: number;
    gmailLabel?: string;
    color?: string;
    isVisible: boolean;
  }>;
  showInbox: boolean;
  defaultSort: string;
  syncStrategy: 'optimistic' | 'pessimistic';
  enableAutoSync: boolean;
}
```

## 🎯 Next Steps

After seeding:
1. Start the backend: `npm run dev`
2. Start the frontend: `cd ../frontend && npm run dev`
3. Login with: `demo@example.com` / `Demo123!`
4. Explore the seeded emails and Kanban board!

---

**Happy Testing! 🚀**
