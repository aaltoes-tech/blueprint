'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, FileText, Calendar, ExternalLink, Loader2, X, LogOut, Sun, Moon } from 'lucide-react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useTheme } from '@/components/theme-provider';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  const { data: session, status } = useSession();
  const { theme, setTheme } = useTheme();
  const [question, setQuestion] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [streamedResponse, setStreamedResponse] = useState('');
  const [searchData, setSearchData] = useState<SearchResponse | null>(null);
  const [documentDetails, setDocumentDetails] = useState<DocumentDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [topK, setTopK] = useState<number>(25);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const responseRef = useRef<HTMLDivElement>(null);

  // Load saved settings from localStorage on mount
  useEffect(() => {
    const savedTopK = localStorage.getItem('blueprint-topk');
    const savedIsPrivate = localStorage.getItem('blueprint-private');

    if (savedTopK && topKOptions.includes(parseInt(savedTopK))) {
      setTopK(parseInt(savedTopK));
    }
    
    if (savedIsPrivate !== null && savedIsPrivate !== undefined) {
      setIsPrivate(savedIsPrivate === 'true');
    }

    // Clean up any previously saved years data
    localStorage.removeItem('blueprint-selected-years');
  }, []);

  // Available years in the database
  const availableYears = ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'];
  
  // Available topK options
  const topKOptions = [10, 25, 50, 100];

  // Wrapper functions to save to localStorage
  const updateTopK = (newTopK: number) => {
    setTopK(newTopK);
    localStorage.setItem('blueprint-topk', newTopK.toString());
  };

  const updateIsPrivate = (newIsPrivate: boolean) => {
    setIsPrivate(newIsPrivate);
    localStorage.setItem('blueprint-private', newIsPrivate.toString());
  };

  // Toggle year selection
  const toggleYear = (year: string) => {
    setSelectedYears(prev => 
      prev.includes(year) 
        ? prev.filter(y => y !== year)
        : [...prev, year]
    );
  };

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
    
    // Check if user is logged in
    if (!session) {
      setShowLoginModal(true);
      return;
    }

    setIsSearching(true);
    setDocuments([]);
    setStreamedResponse('');
    setSearchData(null);

    try {
      // Step 1: Search for relevant documents
      const searchResponse = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, selectedYears, topK }),
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

  if (status === "loading") {
    return (
      <main className="h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Full-width Header */}
      <div className="w-full bg-background">
        <div className="flex items-center justify-between py-4 lg:py-6 px-4 lg:px-6 mt-4">
            {/* Logo - Left side with padding from border */}
            <div className="flex items-center">
              <img 
                src={theme === 'dark' ? "https://www.aaltoes.com/bank/aaltoes_white.svg" : "https://www.aaltoes.com/bank/aaltoes_dark.svg"}
                alt="Aaltoes" 
                className="h-6 lg:h-7"
              />
            </div>
            
            {/* Centered Title */}
            <div className="absolute left-1/2 transform -translate-x-1/2">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-1">
                BLUEPRINT
              </h1>
            </div>

            {/* Theme Toggle and Auth Button - Right side with padding from border */}
            <div className="flex items-center gap-2">
              {/* Theme Toggle Button */}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs font-mono w-10"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light' ? (
                  <Moon className="w-3 h-3" />
                ) : (
                  <Sun className="w-3 h-3" />
                )}
              </Button>
              
              {/* Auth Button */}
              {session ? (
                <Button
                  variant="default"
                  size="sm"
                  className={`h-auto px-2 py-1 text-xs font-mono w-14 ${
                    theme === 'dark' ? 'bg-background text-foreground border border-border' : ''
                  }`}
                  onClick={() => signOut()}
                >
                  Logout
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className={`h-auto px-2 py-1 text-xs font-mono w-14 ${
                    theme === 'dark' ? 'bg-background text-foreground border border-border' : ''
                  }`}
                  onClick={() => signIn('google')}
                >
                  Login
                </Button>
              )}
            </div>
        </div>
      </div>

      {/* Content Container */}
      <div className="max-w-6xl mx-auto w-full p-4 lg:p-6 flex flex-col overflow-hidden" style={{height: 'calc(100vh - 280px)'}}>

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
                              className="text-primary underline decoration-1 underline-offset-2 inline-flex items-center gap-1"
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
                          className="p-2 lg:p-3"
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
                                  className="h-auto px-2 py-1 text-xs font-mono"
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
                                            <FileText className="w-5 h-5 text-muted-foreground" />
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
                                            <Search className="w-5 h-5 text-muted-foreground" />
                                            <h3 className="text-lg font-medium">
                                              Questions Answered ({documentDetails.questions.length})
                                            </h3>
                                          </div>
                                          <div className="grid gap-3">
                                            {documentDetails.questions.map((question, idx) => (
                                              <div 
                                                key={idx}
                                                className="bg-card border rounded-lg p-4"
                                              >
                                                <p className="text-sm leading-relaxed">
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
                                className="h-auto px-2 py-1 text-xs font-mono"
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
            {session ? (
              <>
                <h3 className="text-base font-medium text-foreground mb-1">
                  Hi {session.user?.name?.split(' ')[0] || 'there'}, ask about Aaltoes
                </h3>
                <p className="text-muted-foreground text-sm">
                  Search through board decisions, budgets, and documents
                </p>
              </>
            ) : (
              <>
                <h3 className="text-base font-medium text-foreground mb-1">
                  Ask about Aaltoes
                </h3>
                <p className="text-muted-foreground text-sm">
                  Search through board decisions, budgets, and documents
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Login Required Modal */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="mb-6">
              <h2 className="text-lg font-mono mb-4">BLUEPRINT</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Provides access to Aaltoes knowledge base.<br/>
                <span className="font-medium">Exclusively for Aaltoes members.</span>
              </p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                variant="default"
                className={`h-auto px-2 py-1 text-xs font-mono w-28 ${
                  theme === 'dark' ? 'bg-background text-foreground border border-border' : ''
                }`}
                onClick={() => {
                  setShowLoginModal(false);
                  window.open('https://www.aaltoes.com/get-involved', '_blank');
                }}
              >
                Get involved
              </Button>
              <Button
                variant="default"
                className={`h-auto px-2 py-1 text-xs font-mono w-28 ${
                  theme === 'dark' ? 'bg-background text-foreground border border-border' : ''
                }`}
                onClick={() => {
                  setShowLoginModal(false);
                  signIn('google');
                }}
              >
                Login
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search Input - Fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-background z-10">
        <div className="max-w-6xl mx-auto p-4 lg:p-6">
          {/* Year Selection and TopK */}
          <div className="mb-4">
            {/* Mobile: Compact horizontal scroll */}
            <div className="sm:hidden">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Top-k:</span>
                  <Select value={topK.toString()} onValueChange={(value) => updateTopK(parseInt(value))}>
                    <SelectTrigger className="w-16 h-8 text-xs font-mono touch-manipulation">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {topKOptions.map((k) => (
                        <SelectItem key={k} value={k.toString()} className="text-sm font-mono h-10">
                          {k}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium text-muted-foreground">Private:</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Switch
                          checked={isPrivate}
                          onCheckedChange={updateIsPrivate}
                          disabled={session?.user?.role !== 'ADMIN'}
                          className="disabled:cursor-default disabled:opacity-100 data-[state=unchecked]:!bg-gray-500 data-[state=checked]:bg-primary"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-xs">
                          Private documents may contain sensitive information and are available only for the board.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground shrink-0">Board:</span>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {availableYears.map((year) => (
                    <Button
                      key={year}
                      variant="outline"
                      size="sm"
                      className={`text-xs h-8 px-2 font-mono border shrink-0 touch-manipulation ${
                        selectedYears.includes(year)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-border'
                      }`}
                      onClick={() => toggleYear(year)}
                    >
                      {year}
                    </Button>
                  ))}
                  {selectedYears.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedYears([])}
                      className="h-8 w-8 p-0 font-mono shrink-0 touch-manipulation"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            
            {/* Desktop: Single line */}
            <div className="hidden sm:flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-muted-foreground mr-1">Top-k:</span>
              <Select value={topK.toString()} onValueChange={(value) => updateTopK(parseInt(value))}>
                <SelectTrigger className="w-16 h-6 text-xs font-mono mr-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {topKOptions.map((k) => (
                    <SelectItem key={k} value={k.toString()} className="text-xs font-mono h-8">
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 mr-4">
                <span className="text-sm font-medium text-muted-foreground mr-1">Private:</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Switch
                        checked={isPrivate}
                        onCheckedChange={updateIsPrivate}
                        disabled={session?.user?.role !== 'ADMIN'}
                        className="disabled:cursor-default disabled:opacity-100 data-[state=unchecked]:!bg-gray-500 data-[state=checked]:bg-primary"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs max-w-xs">
                        Private documents may contain sensitive information and are available only for the board.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-sm font-medium text-muted-foreground mr-1">Board:</span>
              {availableYears.map((year) => (
                <Button
                  key={year}
                  variant="outline"
                  size="sm"
                  className={`text-xs h-6 px-2 font-mono border ${
                    selectedYears.includes(year)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border'
                  }`}
                  onClick={() => toggleYear(year)}
                >
                  {year}
                </Button>
              ))}
              {selectedYears.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedYears([])}
                  className="h-6 w-6 p-0 font-mono"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          
          <div className="relative">
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={session ? "Ask about Aaltoes board decisions, budgets, or projects..." : "Please login to ask questions..."}
              rows={3}
              className={`resize-none text-sm lg:text-base pr-16 ${!session ? 'opacity-60' : ''}`}
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !question.trim() || !session}
              variant={theme === 'dark' ? 'secondary' : 'default'}
              className="absolute bottom-2 right-2 h-10 w-10 p-0 font-mono"
              size="sm"
            >
              {isSearching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Search className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}