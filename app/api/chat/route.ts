import { NextRequest } from 'next/server';
import openai from '@/lib/openai';

interface Chunk {
  content: string;
  metadata: {
    name: string;
    year: string;
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { question, chunks }: { question: string; chunks: Chunk[] } = await request.json();
    
    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No relevant documents found' }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Build context from chunks with links (optimized for faster processing)
    const contextBlocks = chunks.map(chunk => {
      const text = chunk.content;
      const year = chunk.metadata.year || 'unknown';
      const name = chunk.metadata.name || 'Untitled';
      const link = chunk.metadata.link;
      // Shorter context format for faster LLM processing
      const label = `[${name}|${year}${link ? `|${link}` : ''}]`;
      return `${label}: ${text}`;
    });

    // Remove duplicates and limit context size for speed
    const uniqueContextBlocks = Array.from(new Set(contextBlocks)).slice(0, 12); // Limit to 12 chunks max
    const context = uniqueContextBlocks.join('\n\n---\n\n');

    const prompt = `You are a helpful assistant for Aaltoes. To answer the question, you use only the provided documents and always cite the source, make them clickable: [Document Name](link).
    Use only the provided documents. Make sure to reference at least 5 sources and more if the is hard.

Context:
${context}

Question: ${question}

Answer:`;

    // Create streaming response
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0,
    });

    // Create a ReadableStream to handle the OpenAI stream
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
              // Send the content as Server-Sent Events format
              const data = `data: ${JSON.stringify({ content })}\n\n`;
              controller.enqueue(new TextEncoder().encode(data));
            }
          }
          // Send end signal
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}