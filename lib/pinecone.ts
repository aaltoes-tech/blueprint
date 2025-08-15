import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set');
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

// Public-only indexes
export const summaryIndex = pinecone.index('my-doc-summaries');
export const chunkIndex = pinecone.index('my-doc-chunks');
export const questionsIndex = pinecone.index('my-doc-questions');

// Public + Private indexes
export const summaryPrivateIndex = pinecone.index('my-doc-summaries-private');
export const chunkPrivateIndex = pinecone.index('my-doc-chunks-private');
export const questionsPrivateIndex = pinecone.index('my-doc-questions-private');

// Helper function to get appropriate indexes based on private access
export function getIndexes(includePrivate: boolean = false) {
  if (includePrivate) {
    // Switch is ON - use private indexes
    console.log('Using private indexes (switch is ON)');
    return {
      summaryIndex: summaryPrivateIndex,
      chunkIndex: chunkPrivateIndex,
      questionsIndex: questionsPrivateIndex,
    };
  } else {
    // Switch is OFF - use normal public indexes
    console.log('Using public indexes (switch is OFF)');
    return {
      summaryIndex,
      chunkIndex,
      questionsIndex,
    };
  }
}

export default pinecone;