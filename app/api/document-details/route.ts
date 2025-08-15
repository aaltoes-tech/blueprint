import { NextRequest, NextResponse } from 'next/server';
import { getIndexes } from '@/lib/pinecone';

export async function POST(request: NextRequest) {
  try {
    const { docId, isPrivate } = await request.json();
    
    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    console.log('Fetching details for document:', docId);
    console.log('Using private access:', isPrivate);

    // Get appropriate indexes based on private access
    const { summaryIndex, questionsIndex } = getIndexes(isPrivate);

    // Use correct field names for each index
    const [summaryResults, questionResults] = await Promise.all([
      summaryIndex.query({
        vector: new Array(1536).fill(0), 
        topK: 1,
        includeMetadata: true,
        filter: { id: docId }, // Summaries use "id" field
      }).catch(error => {
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          throw new Error('Private document access is not implemented yet. Please contact administrator to set up private indexes.');
        }
        throw error;
      }),
      questionsIndex.query({
        vector: new Array(1536).fill(0),
        topK: 1, 
        includeMetadata: true,
        filter: { doc_id: docId }, // Questions use "doc_id" field
      }).catch(error => {
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          throw new Error('Private document access is not implemented yet. Please contact administrator to set up private indexes.');
        }
        throw error;
      })
    ]);

    console.log('Summary results:', summaryResults.matches?.length);
    console.log('Question results:', questionResults.matches?.length);

    const summaryMatch = summaryResults.matches?.[0];
    const questionMatch = questionResults.matches?.[0];
    
    console.log('Full summary match:', JSON.stringify(summaryMatch, null, 2));
    console.log('Full question match:', JSON.stringify(questionMatch, null, 2));

    if (!summaryMatch && !questionMatch) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Extract summary text (summaries are stored as the main document text, not in metadata)
    const summary = summaryMatch?.metadata?.text || 
                   summaryMatch?.metadata?.content || 
                   summaryMatch?.metadata?.page_content ||
                   'No summary available';
    
    console.log('Summary match metadata keys:', Object.keys(summaryMatch?.metadata || {}));
    console.log('Summary text length:', String(summary).length);
    
    // Extract questions list
    const questionsText = String(questionMatch?.metadata?.questions_text || '');
    const questions = questionsText ? questionsText.split('\n').filter((q: string) => q.trim()) : [];

    // Get document metadata
    const metadata = summaryMatch?.metadata || questionMatch?.metadata || {};

    const documentDetails = {
      id: docId,
      name: String(metadata.name || 'Untitled Document'),
      summary: String(summary),
      questions: questions,
      year: String(metadata.year || 'unknown'),
    };

    console.log('Returning document details:', {
      name: documentDetails.name,
      summaryLength: documentDetails.summary.length,
      questionsCount: documentDetails.questions.length
    });

    return NextResponse.json(documentDetails);

  } catch (error: any) {
    console.error('Document details error:', error);
    
    // Check if this is our custom "not implemented" error
    if (error.message?.includes('not implemented yet')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}