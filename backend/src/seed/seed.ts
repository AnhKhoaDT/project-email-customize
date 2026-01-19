// Load environment variables FIRST
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { User } from '../users/schemas/user.schema';
import { EmailMetadata } from '../mail/schemas/email-metadata.schema';
import { KanbanConfig, KanbanColumn } from '../mail/schemas/kanban-config.schema';

/**
 * Database Seeder for Mail Project
 * Creates sample users, emails, and kanban configurations
 * 
 * Usage: npm run seed
 */

// Sample data configuration
const SAMPLE_USERS = [
    {
        email: 'demo@example.com',
        name: 'Demo User',
        password: 'Demo123!',
        phone: '+84901234567',
        address: 'Ho Chi Minh City, Vietnam',
    },
    {
        email: 'alice@example.com',
        name: 'Alice Johnson',
        password: 'Alice123!',
        phone: '+84902345678',
        address: 'Hanoi, Vietnam',
    },
    {
        email: 'bob@example.com',
        name: 'Bob Smith',
        password: 'Bob123!',
        phone: '+84903456789',
        address: 'Da Nang, Vietnam',
    },
];

// Sample email templates
const EMAIL_TEMPLATES = [
    {
        subject: 'Welcome to our platform!',
        from: 'support@company.com',
        snippet: 'Thank you for joining us. Here are some tips to get started...',
        labelIds: ['INBOX'],
        hasAttachment: false,
    },
    {
        subject: 'Your weekly report is ready',
        from: 'analytics@company.com',
        snippet: 'Here is your weekly performance summary. Total views: 1,234...',
        labelIds: ['INBOX', 'STARRED'],
        hasAttachment: true, // Report PDF attached
    },
    {
        subject: 'Meeting reminder: Team Sync',
        from: 'calendar@company.com',
        snippet: 'Reminder: Team sync meeting tomorrow at 10 AM...',
        labelIds: ['INBOX', 'IMPORTANT'],
        hasAttachment: false,
    },
    {
        subject: 'Invoice #12345',
        from: 'billing@company.com',
        snippet: 'Your invoice for this month is attached. Amount due: $99...',
        labelIds: ['INBOX'],
        hasAttachment: true, // Invoice PDF attached
    },
    {
        subject: 'Project update: Q1 2026',
        from: 'project-manager@company.com',
        snippet: 'Great progress this quarter! Here are the highlights...',
        labelIds: ['INBOX', 'STARRED'],
        hasAttachment: false,
    },
    {
        subject: 'Security alert: New login detected',
        from: 'security@company.com',
        snippet: 'We detected a new login from Chrome on Windows...',
        labelIds: ['INBOX', 'IMPORTANT'],
        hasAttachment: false,
    },
    {
        subject: 'Newsletter: Tech trends 2026',
        from: 'newsletter@techblog.com',
        snippet: 'Top 10 technology trends to watch this year...',
        labelIds: ['INBOX'],
        hasAttachment: false,
    },
    {
        subject: 'Re: Question about API integration',
        from: 'developer@partner.com',
        snippet: 'Thanks for your question. Here is how to integrate our API...',
        labelIds: ['SENT'],
        hasAttachment: true, // API documentation attached
    },
    {
        subject: 'Draft: Proposal for new feature',
        from: 'me@example.com',
        snippet: 'I propose we add a new feature to improve user experience...',
        labelIds: ['DRAFT'],
        hasAttachment: true, // Proposal document attached
    },
    {
        subject: 'Spam: You won a million dollars!',
        from: 'scam@spam.com',
        snippet: 'Congratulations! Click here to claim your prize...',
        labelIds: ['SPAM'],
        hasAttachment: false,
    },
    {
        subject: 'Old newsletter from 2020',
        from: 'old@newsletter.com',
        snippet: 'This is an old email that should be archived...',
        labelIds: ['ARCHIVE'],
        hasAttachment: false,
    },
    {
        subject: 'Deleted email',
        from: 'deleted@example.com',
        snippet: 'This email was moved to trash...',
        labelIds: ['TRASH'],
        hasAttachment: false,
    },
    {
        subject: 'Important: Action required',
        from: 'urgent@company.com',
        snippet: 'Please review and approve the attached document by EOD...',
        labelIds: ['INBOX', 'STARRED', 'IMPORTANT'],
        hasAttachment: true, // Important document attached
    },
    {
        subject: 'Team lunch this Friday',
        from: 'hr@company.com',
        snippet: 'Join us for team lunch at the Italian restaurant downtown...',
        labelIds: ['INBOX'],
        hasAttachment: false,
    },
    {
        subject: 'Code review request',
        from: 'senior-dev@company.com',
        snippet: 'Could you please review my pull request #456?',
        labelIds: ['INBOX', 'STARRED'],
        hasAttachment: true, // Code diff attached
    },
];

// Sample Kanban configurations
const KANBAN_CONFIGS = [
    {
        columns: [
            {
                id: 'col_inbox',
                name: 'Inbox',
                order: 0,
                gmailLabel: 'INBOX',
                gmailLabelName: 'Inbox',
                color: '#3B82F6',
                isVisible: true,
            },
            {
                id: 'col_todo',
                name: 'To Do',
                order: 1,
                gmailLabel: 'STARRED',
                gmailLabelName: 'Starred',
                color: '#EF4444',
                isVisible: true,
            },
            {
                id: 'col_in_progress',
                name: 'In Progress',
                order: 2,
                gmailLabel: 'IMPORTANT',
                gmailLabelName: 'Important',
                color: '#F59E0B',
                isVisible: true,
            },
            {
                id: 'col_done',
                name: 'Done',
                order: 3,
                gmailLabel: 'ARCHIVE',
                gmailLabelName: 'Archive',
                color: '#10B981',
                isVisible: true,
            },
        ],
        showInbox: true,
        defaultSort: 'date',
        syncStrategy: 'optimistic' as const,
        enableAutoSync: true,
    },
];

async function seed() {
    console.log('🌱 Starting database seeding...\n');

    const app = await NestFactory.createApplicationContext(AppModule);

    try {
        // Get models
        const userModel = app.get<Model<User>>(getModelToken(User.name));
        const emailMetadataModel = app.get<Model<EmailMetadata>>(
            getModelToken(EmailMetadata.name),
        );
        const kanbanConfigModel = app.get<Model<KanbanConfig>>(
            getModelToken(KanbanConfig.name),
        );

        // Clear existing data (optional - comment out if you want to keep existing data)
        console.log('🗑️  Clearing existing data...');
        await userModel.deleteMany({});
        await emailMetadataModel.deleteMany({});
        await kanbanConfigModel.deleteMany({});
        console.log('✅ Existing data cleared\n');

        // Create users
        console.log('👥 Creating sample users...');
        const createdUsers = [];

        for (const userData of SAMPLE_USERS) {
            const passwordHash = await bcrypt.hash(userData.password, 10);
            const user = await userModel.create({
                email: userData.email,
                name: userData.name,
                passwordHash,
                phone: userData.phone,
                address: userData.address,
                isSemanticSearchIndexed: false,
            });
            createdUsers.push(user);
            console.log(`  ✓ Created user: ${user.email}`);
        }
        console.log(`✅ Created ${createdUsers.length} users\n`);

        // Create emails for each user
        console.log('📧 Creating sample emails...');
        let totalEmails = 0;

        for (const user of createdUsers) {
            const userEmails = [];

            for (let i = 0; i < EMAIL_TEMPLATES.length; i++) {
                const template = EMAIL_TEMPLATES[i];
                const emailId = `email_${user._id}_${i + 1}`;
                const threadId = `thread_${user._id}_${i + 1}`;

                // Determine kanban column based on labels
                let kanbanColumnId = 'col_inbox'; // Default to inbox
                let cachedColumnName = 'Inbox';

                if (template.labelIds.includes('STARRED')) {
                    kanbanColumnId = 'col_todo';
                    cachedColumnName = 'To Do';
                } else if (template.labelIds.includes('IMPORTANT')) {
                    kanbanColumnId = 'col_in_progress';
                    cachedColumnName = 'In Progress';
                } else if (template.labelIds.includes('ARCHIVE')) {
                    kanbanColumnId = 'col_done';
                    cachedColumnName = 'Done';
                } else if (template.labelIds.includes('INBOX')) {
                    kanbanColumnId = 'col_inbox';
                    cachedColumnName = 'Inbox';
                }

                const email = await emailMetadataModel.create({
                    userId: user._id.toString(),
                    emailId,
                    threadId,
                    labelIds: template.labelIds,
                    kanbanColumnId,
                    cachedColumnName,
                    subject: template.subject,
                    from: template.from,
                    snippet: template.snippet,
                    hasAttachment: template.hasAttachment || false,
                    receivedDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date within last 30 days
                    syncStatus: {
                        state: 'SYNCED',
                        retryCount: 0,
                    },
                    isSnoozed: false,
                });

                userEmails.push(email);
                totalEmails++;
            }

            console.log(`  ✓ Created ${userEmails.length} emails for ${user.email}`);
        }
        console.log(`✅ Created ${totalEmails} total emails\n`);

        // Create Kanban configurations
        console.log('📋 Creating Kanban configurations...');
        for (const user of createdUsers) {
            const config = KANBAN_CONFIGS[0]; // Use the same config for all users
            await kanbanConfigModel.create({
                userId: user._id.toString(),
                columns: config.columns,
                showInbox: config.showInbox,
                defaultSort: config.defaultSort,
                syncStrategy: config.syncStrategy,
                enableAutoSync: config.enableAutoSync,
                lastModified: new Date(),
            });
            console.log(`  ✓ Created Kanban config for ${user.email}`);
        }
        console.log(`✅ Created ${createdUsers.length} Kanban configurations\n`);

        // Summary
        console.log('🎉 Seeding completed successfully!\n');
        console.log('📊 Summary:');
        console.log(`  - Users: ${createdUsers.length}`);
        console.log(`  - Emails: ${totalEmails}`);
        console.log(`  - Kanban configs: ${createdUsers.length}`);
        console.log('\n📝 Sample credentials:');
        SAMPLE_USERS.forEach((user) => {
            console.log(`  - ${user.email} / ${user.password}`);
        });
        console.log('\n✨ You can now login with any of these accounts!\n');
    } catch (error) {
        console.error('❌ Error during seeding:', error);
        throw error;
    } finally {
        await app.close();
    }
}

// Run the seeder
seed()
    .then(() => {
        console.log('👋 Seeder finished. Exiting...');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Seeder failed:', error);
        process.exit(1);
    });
