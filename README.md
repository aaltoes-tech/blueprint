# BLUEPRINT

AI-powered knowledge discovery for Aaltoes documents.

## What it does

Ask questions about Aaltoes and get AI answers based on real documents. The app finds relevant documents, shows them to you, and streams an AI response in real-time.

## Features

- **Smart search**: Finds documents using AI similarity matching
- **Year filtering**: Automatically filters by mentioned years (2018-2025)
- **Real-time responses**: Streams AI answers as they're generated
- **Document links**: Direct links to Google Drive documents
- **Mobile friendly**: Works great on phones and desktops

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add your API keys**
   Create `.env.local`:
   ```env
   OPENAI_API_KEY=your_openai_api_key
   PINECONE_API_KEY=your_pinecone_api_key
   ```

3. **Run the app**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   Visit [http://localhost:3000](http://localhost:3000)

## How it works

![Uploading image.png…]()


1. You ask a question about Aaltoes
2. App searches document database using AI
3. Shows you relevant documents with links
4. AI generates answer based on those documents
5. Response streams in real-time with clickable links

## Tech stack

- **Next.js** - Web framework
- **OpenAI GPT-4** - AI responses
- **Pinecone** - Document search
- **Tailwind CSS** - Styling

## Requirements

- Node.js 18+
- OpenAI API key
- Pinecone account with Aaltoes documents

That's it! 🚀
