/**
 * Script to verify email subject/sender data quality
 * 
 * Checks for:
 * - "Unknown sender" / empty from field
 * - "(No subject)" / empty subject field
 * - Emails with vs without embeddings
 */

import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/emailcustomize';

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db();
    const collection = db.collection('emailmetadatas');

    // Total counts
    const total = await collection.countDocuments();
    const withEmbedding = await collection.countDocuments({ embedding: { $exists: true } });
    const withoutEmbedding = await collection.countDocuments({ embedding: { $exists: false } });

    console.log('\n📊 Overall Statistics:');
    console.log(`Total emails: ${total}`);
    console.log(`With embeddings: ${withEmbedding}`);
    console.log(`Without embeddings: ${withoutEmbedding}`);

    // Check data quality issues
    const unknownSenders = await collection.countDocuments({
      $or: [
        { from: 'Unknown sender' },
        { from: '' },
        { from: null },
        { from: { $exists: false } }
      ]
    });

    const noSubjects = await collection.countDocuments({
      $or: [
        { subject: '(No subject)' },
        { subject: '' },
        { subject: null },
        { subject: { $exists: false } }
      ]
    });

    console.log('\n⚠️  Data Quality Issues:');
    console.log(`Unknown/missing senders: ${unknownSenders}`);
    console.log(`No/missing subjects: ${noSubjects}`);

    // Sample bad data
    console.log('\n📝 Sample emails with issues:');
    const badSamples = await collection
      .find({
        $or: [
          { from: { $in: ['Unknown sender', '', null] } },
          { subject: { $in: ['(No subject)', '', null] } }
        ]
      })
      .limit(5)
      .project({ 
        emailId: 1, 
        subject: 1, 
        from: 1, 
        hasEmbedding: { $cond: { if: { $gt: [{ $size: { $ifNull: ['$embedding', []] } }, 0] }, then: true, else: false } },
        _id: 0 
      })
      .toArray();

    console.table(badSamples);

    // Sample good data (after re-index)
    console.log('\n✅ Sample emails with good data:');
    const goodSamples = await collection
      .find({
        from: { $nin: ['Unknown sender', '', null], $exists: true },
        subject: { $nin: ['(No subject)', '', null], $exists: true }
      })
      .limit(5)
      .project({ 
        emailId: 1, 
        subject: 1, 
        from: 1,
        hasEmbedding: { $cond: { if: { $gt: [{ $size: { $ifNull: ['$embedding', []] } }, 0] }, then: true, else: false } },
        _id: 0 
      })
      .toArray();

    console.table(goodSamples);

    // Recommendation
    console.log('\n💡 Recommendations:');
    if (unknownSenders > 0 || noSubjects > 0) {
      console.log('⚠️  You have emails with missing data.');
      console.log('✅ Run: npx ts-node scripts/re-index-test-emails.ts');
      console.log('   This will clear some embeddings and let auto-indexing re-fetch data.');
    } else {
      console.log('✅ All emails have proper subject/sender data!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();
