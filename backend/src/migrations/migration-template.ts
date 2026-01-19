import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

/**
 * Migration Template
 * 
 * Purpose: [Describe what this migration does]
 * Date: [YYYY-MM-DD]
 * Author: [Your name]
 * 
 * Changes:
 * - [List of changes]
 * 
 * Affected Collections:
 * - [collection_name]
 */

// Load environment variables
dotenv.config();

async function runMigration() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI is missing in .env file');
        process.exit(1);
    }

    console.log('🔌 Connecting to MongoDB...');

    try {
        // Connect to MongoDB
        await mongoose.connect(uri);
        console.log('✅ Connected.');

        // Get collection
        // NOTE: Mongoose converts class names to lowercase + 's'
        // Example: EmailMetadata -> emailmetadatas
        const collectionName = 'your_collection_name';
        const collection = mongoose.connection.collection(collectionName);

        // =========================================================
        // MIGRATION LOGIC
        // =========================================================
        console.log('🚀 Starting migration...');

        // Example: Update documents
        const result = await collection.updateMany(
            { /* your filter */ },
            { /* your update operation */ }
        );

        console.log(`   👉 Modified ${result.modifiedCount} documents.`);

        // Example: Rename field
        // const renameResult = await collection.updateMany(
        //   { oldFieldName: { $exists: true } },
        //   { $rename: { 'oldFieldName': 'newFieldName' } }
        // );

        // Example: Add new field with default value
        // const addFieldResult = await collection.updateMany(
        //   { newField: { $exists: false } },
        //   { $set: { newField: 'defaultValue' } }
        // );

        // Example: Remove field
        // const removeFieldResult = await collection.updateMany(
        //   { oldField: { $exists: true } },
        //   { $unset: { oldField: '' } }
        // );

        console.log('🎉 Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('👋 Disconnected.');
        process.exit(0);
    }
}

// Run migration
runMigration();
