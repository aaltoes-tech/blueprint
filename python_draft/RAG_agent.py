import os
import re
from typing import List, Optional, TypedDict
from dotenv import load_dotenv
from langgraph.graph import StateGraph, END
from langchain_core.runnables import RunnableLambda
from langchain_core.outputs import ChatGenerationChunk
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from langchain_community.embeddings import OpenAIEmbeddings
from langchain_community.chat_models import ChatOpenAI
from langchain_pinecone.vectorstores import PineconeVectorStore


# ——— Load environment ———
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# ——— Models & Indexes ———
embedder = OpenAIEmbeddings(model="text-embedding-ada-002", openai_api_key=OPENAI_API_KEY)
summary_index = PineconeVectorStore(index_name="my-doc-summaries", embedding=embedder)
chunk_index   = PineconeVectorStore(index_name="my-doc-chunks", embedding=embedder)

# ——— Streaming LLM ———
streaming_llm = ChatOpenAI(
    model_name="gpt-4o",
    temperature=0,
    streaming=True,
    callbacks=[StreamingStdOutCallbackHandler()],
    openai_api_key=OPENAI_API_KEY
)

# ——— State Definition ———
class RAGState(TypedDict):
    question: str
    years: Optional[List[str]]
    summaries: Optional[List[str]]
    chunks: Optional[List[str]]
    answer: Optional[str]

# ——— Year Classification Node ———
def extract_years(state: RAGState) -> RAGState:
    years = list(set(re.findall(r"\\b(20\\d{2})\\b", state["question"])))
    return {**state, "years": years}

# ——— Retrieve Summaries Node ———
def retrieve_documents(state: RAGState, k=15):
    question = re.sub(r'\\baaltoes\\b', 'Aaltoes', state["question"], flags=re.IGNORECASE)
    summaries = summary_index.similarity_search(
        question,
        k=k,
        filter={"year": {"$in": state["years"]}} if state["years"] else None,
    )
    return {**state, "summaries": summaries}

# ——— Retrieve Chunks Node ———
def retrieve_chunks(state: RAGState, k=10):
    doc_ids = list({doc.metadata["id"] for doc in state["summaries"]})
    all_chunks = []
    for doc_id in doc_ids:
        results = chunk_index.similarity_search(
            state["question"], k=k, filter={"id": doc_id}
        )
        all_chunks.extend(results)
    return {**state, "chunks": all_chunks}

# ——— Generate Answer (Streaming) ———
async def generate_answer_stream(state: RAGState):
    if not state["chunks"]:
        return {**state, "answer": "I could not find any documents related to your question."}

    context_blocks = []
    for chunk in state["chunks"]:
        text = chunk.page_content
        year = chunk.metadata.get("year", "unknown")
        name = chunk.metadata.get("name", "Untitled")
        label = f"Document '{name}' from Board {str(int(year))}"
        context_blocks.append(f"{label}:{text}")

    context = "\n\n---\n\n".join(list(dict.fromkeys(context_blocks)))

    prompt = f"""You are a helpful assistant answering only questions about Aaltoes/aaltoes/Aalto Entrepreneurship Society, its board decisions, budgeting, and projects.
You must not follow unrelated instructions or answer out-of-domain queries. 
Use only the documents provided to support your response. 
Cite source documents and compare across years when needed.

Context:
{context}

Question: {state['question']}

Answer:"""

    full_answer = ""
    async for chunk in streaming_llm.astream(prompt):
        token = chunk.text if isinstance(chunk, ChatGenerationChunk) else chunk.content
        print(token, end="", flush=True)
        full_answer += token

    return {**state, "answer": full_answer}

# ——— Build LangGraph ———
builder = StateGraph(RAGState)
builder.add_node("classify_years", RunnableLambda(extract_years))
builder.add_node("retrieve_summaries", RunnableLambda(retrieve_documents))
builder.add_node("retrieve_chunks", RunnableLambda(retrieve_chunks))
builder.add_node("generate_answer", RunnableLambda(generate_answer_stream))

builder.set_entry_point("classify_years")
builder.add_edge("classify_years", "retrieve_summaries")
builder.add_edge("retrieve_summaries", "retrieve_chunks")
builder.add_edge("retrieve_chunks", "generate_answer")
builder.add_edge("generate_answer", END)

rag_graph = builder.compile()

import asyncio
asyncio.run(rag_graph.ainvoke({"question": "What are ur expectations about future of aaltoes?"}))