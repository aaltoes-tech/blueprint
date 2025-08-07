import { Pinecone } from '@pinecone-database/pinecone';

if (!process.env.PINECONE_API_KEY) {
  throw new Error('PINECONE_API_KEY is not set');
}

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

export const summaryIndex = pinecone.index('my-doc-summaries');
export const chunkIndex = pinecone.index('my-doc-chunks');
export const questionsIndex = pinecone.index('my-doc-questions');

export default pinecone;