'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, FileText, Calendar, ExternalLink, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface Document {
  id: string;
  name: string;
  year: string;
  score: number;
  numQuestions?: number;
  link?: string;
}

interface SearchResponse {
  years: string[];
  documents: Document[];
  chunks: any[];
  question: string;
}

interface DocumentDetails {
  id: string;
  name: string;
  summary: string;
  questions: string[];
}

export default function Home() {
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [documentDetails, setDocumentDetails] = useState<DocumentDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);



  // Auto-scroll to bottom of response as it streams
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [streamedResponse]);

  // Fetch document details (summary and questions)
  const fetchDocumentDetails = async (docId: string) => {
    setIsLoadingDetails(true);
    try {
      const response = await fetch('/api/document-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch document details');
      }

      const details = await response.json();
      setDocumentDetails(details);
    } catch (error) {
      console.error('Error fetching document details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSearch = async () => {
    if (!question.trim()) return;

    setIsSearching(true);
    setDocuments([]);
    setStreamedResponse('');
    setSearchData(null);

    try {
      // Step 1: Search for relevant documents
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!searchResponse.ok) {
        throw new Error('Search failed');
      }

      const searchResult: SearchResponse = await searchResponse.json();
      setDocuments(searchResult.documents);
      setSearchData(searchResult);
      setIsSearching(false);

      // Step 2: Stream the LLM response
      if (searchResult.chunks.length > 0) {
        setIsStreaming(true);
        
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            question: searchResult.question, 
            chunks: searchResult.chunks 
          }),
        });

        if (!chatResponse.ok) {
          throw new Error('Chat failed');
        }

        const reader = chatResponse.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  setIsStreaming(false);
                  return;
                }
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    setStreamedResponse(prev => prev + parsed.content);
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } else {
        setStreamedResponse('I could not find any documents related to your question.');
      }
    } catch (error) {
      console.error('Error:', error);
      setStreamedResponse('An error occurred while processing your question.');
    } finally {
      setIsSearching(false);
      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <main className="h-screen bg-background flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full p-4 lg:p-6 flex flex-col overflow-hidden" style={{height: 'calc(100vh - 8rem)'}}>
        {/* Header - Fixed height */}
        <div className="flex-shrink-0 pt-4 lg:pt-6 pb-4 lg:pb-6">
          <div className="relative flex items-center mb-6">
            {/* Logo - Left corner */}
            <div className="absolute left-0 top-0">
              <img 
                src="https://www.aaltoes.com/bank/aaltoes_dark.svg" 
                alt="Aaltoes" 
                className="h-6 lg:h-7"
              />
            </div>
            
            {/* Centered Title */}
            <div className="w-full text-center">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-1">
                BLUEPRINT
              </h1>
            </div>
          </div>
        </div>

        {/* Search Animation - Fixed height */}
        {isSearching && (
          <div className="flex-shrink-0 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
              </div>
              <span className="text-muted-foreground text-sm">Searching...</span>
            </div>
          </div>
        )}

        {/* Years detected - Fixed height */}
        {searchData?.years && searchData.years.length > 0 && (
          <div className="flex-shrink-0 mb-4">
            <Badge variant="secondary" className="gap-2">
              <Calendar className="w-3 h-3" />
              Years: {searchData.years.join(', ')}
            </Badge>
          </div>
        )}

        {/* Results Container - Takes remaining height */}
        {(streamedResponse || isStreaming || documents.length > 0) && (
          <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-8 min-h-0 overflow-hidden">
            {/* AI Response - Main column (top on mobile, left on desktop) */}
            {(streamedResponse || isStreaming) && (
              <div className="flex-[3] lg:max-w-4xl min-h-0">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-4 flex-shrink-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      Response
                      {isStreaming && (
                        <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-pulse" />
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 flex-1 flex flex-col overflow-hidden">
                    <div
                      ref={responseRef}
                      className="prose prose-neutral prose-sm max-w-none overflow-y-auto flex-1 min-h-0 pl-4 pr-6 py-4"
                    >
                      <ReactMarkdown 
                        className="leading-relaxed"
                        components={{
                          h1: ({ children }) => <h1 className="text-lg font-semibold mb-3 mt-6 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-medium mb-2 mt-5 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-medium mb-2 mt-4 first:mt-0">{children}</h3>,
                          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="mb-3 pl-4 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="mb-3 pl-4 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          strong: ({ children }) => <strong className="font-medium">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          code: ({ children }) => <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                          pre: ({ children }) => <pre className="bg-muted p-3 rounded text-xs overflow-x-auto mb-3">{children}</pre>,
                          a: ({ children, href }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline decoration-1 underline-offset-2 inline-flex items-center gap-1 transition-colors"
                            >
                              {children}
                              <ExternalLink className="w-3 h-3 inline flex-shrink-0" />
                            </a>
                          ),
                        }}
                      >
                        {streamedResponse}
                      </ReactMarkdown>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Documents Sidebar - Right on desktop, bottom on mobile */}
            {documents.length > 0 && (
              <div className="flex-1 lg:w-72 lg:flex-shrink-0 min-w-0 min-h-0 flex flex-col">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-4 flex-shrink-0">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Possibly Related ({documents.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-y-auto overflow-x-hidden pt-0 flex-1">
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 lg:gap-3">
                      {documents.map((doc, index) => (
                        <Card
                          key={doc.id || index}
                          className="p-2 lg:p-3 hover:bg-muted/50 transition-colors"
                        >
                        <div className="space-y-1 lg:space-y-2 min-w-0">
                          <h3 className="font-medium text-xs lg:text-sm leading-tight break-words">
                            {doc.name}
                          </h3>
                          <div className="flex items-center gap-1 lg:gap-2 text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span className="text-xs">Board {doc.year}</span>
                            <Badge variant="outline" className="text-xs h-4 lg:h-5 px-1">
                              {(doc.score * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          <div className="flex gap-1 lg:gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-auto px-2 py-1 text-xs"
                                  onClick={() => fetchDocumentDetails(doc.id)}
                                >
                                  <FileText className="w-3 h-3 mr-1" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl w-[90vw] h-[85vh] flex flex-col">
                                <DialogHeader className="flex-shrink-0 pb-4 border-b">
                                  <DialogTitle className="text-xl font-semibold pr-8">
                                    {documentDetails?.name || doc.name}
                                  </DialogTitle>
                                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                    <Calendar className="w-4 h-4" />
                                    <span>{doc.year}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {(doc.score * 100).toFixed(0)}% match
                                    </Badge>

                                  </div>
                                </DialogHeader>
                                
                                <div className="flex-1 overflow-hidden">
                                  {isLoadingDetails ? (
                                    <div className="flex items-center justify-center h-full">
                                      <div className="text-center">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3" />
                                        <p className="text-sm text-muted-foreground">Loading document details...</p>
                                      </div>
                                    </div>
                                  ) : documentDetails ? (
                                    <div className="h-full overflow-y-auto">
                                      <div className="p-6 space-y-8">
                                        {/* Summary Section */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-4">
                                            <FileText className="w-5 h-5 text-primary" />
                                            <h3 className="text-lg font-medium">Document Summary</h3>
                                          </div>
                                          <div className="bg-gradient-to-br from-muted/50 to-muted/30 rounded-lg p-6 border">
                                            <p className="text-sm leading-relaxed text-foreground">
                                              {documentDetails.summary}
                                            </p>
                                          </div>
                                        </div>
                                        
                                        {/* Questions Section */}
                                        <div>
                                          <div className="flex items-center gap-2 mb-4">
                                            <Search className="w-5 h-5 text-primary" />
                                            <h3 className="text-lg font-medium">
                                              Questions Answered ({documentDetails.questions.length})
                                            </h3>
                                          </div>
                                          <div className="grid gap-3">
                                            {documentDetails.questions.map((question, idx) => (
                                              <div 
                                                key={idx}
                                                className="group bg-card border rounded-lg p-4 hover:shadow-md hover:border-primary/20 transition-all duration-200"
                                              >
                                                <p className="text-sm leading-relaxed group-hover:text-foreground transition-colors">
                                                  {question}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center h-full">
                                      <div className="text-center">
                                        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
                                          <ExternalLink className="w-6 h-6 text-destructive" />
                                        </div>
                                        <p className="text-sm text-muted-foreground">Failed to load document details</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                            
                            {doc.link && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto px-2 py-1 text-xs"
                                asChild
                              >
                                <a
                                  href={doc.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  Open
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}



        {/* Empty State */}
        {!isSearching && !documents.length && !streamedResponse && (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              Ask about Aaltoes
            </h3>
            <p className="text-muted-foreground text-sm">
              Search through board decisions, budgets, and documents
            </p>
          </div>
        )}
      </div>

      {/* Search Input - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t z-10">
        <div className="max-w-6xl mx-auto p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about Aaltoes board decisions, budgets, or projects..."
                rows={3}
                className="resize-none text-sm lg:text-base"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching || !question.trim()}
              className="px-4 py-3 flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Search</span>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}