/**
 * Script to re-index test emails
 * 
 * Usage:
 * 1. Clear embeddings for specific emails (force re-index)
 * 2. Let auto-indexing service re-process them with new code
 * 3. Verify subject/sender are now correct
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailcustomize';

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('emailmetadatas');

    // Option 1: Clear embeddings for first 10 emails (for quick test)
    console.log('\n📝 Option 1: Clear embeddings for first 10 emails');
    
    // First, find the first 10 emails with embeddings
    const emailsToUpdate = await collection
      .find({ embedding: { $exists: true } })
      .limit(10)
      .project({ _id: 1 })
      .toArray();
    
    if (emailsToUpdate.length === 0) {
      console.log('⚠️  No emails with embeddings found');
    } else {
      const ids = emailsToUpdate.map(e => e._id);
      
      // Now update only those emails
      const result1 = await collection.updateMany(
        { _id: { $in: ids } },
        { $unset: { embedding: '' } }
      );
      console.log(`✅ Cleared ${result1.modifiedCount} embeddings`);
    }

    // Option 2: Clear all embeddings (for full re-index)
    // Uncomment if you want to re-index everything
    
    console.log('\n📝 Option 2: Clear ALL embeddings (full re-index)');
    const result2 = await collection.updateMany(
      { embedding: { $exists: true } },
      { $unset: { embedding: '' } }
    );
    console.log(`✅ Cleared ${result2.modifiedCount} embeddings`);
   

    // Show sample of cleared emails
    console.log('\n📊 Sample of emails that will be re-indexed:');
    const samples = await collection
      .find({ embedding: { $exists: false } })
      .limit(5)
      .project({ emailId: 1, subject: 1, from: 1, _id: 0 })
      .toArray();
    
    console.table(samples);

    console.log('\n✅ Done! Auto-indexing service will re-process these emails.');
    console.log('💡 Check backend logs for: "[AutoIndexingService] 📦 Processing batch..."');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
