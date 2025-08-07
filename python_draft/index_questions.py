import os
import pickle
import pandas as pd
import tiktoken
from uuid import uuid4
from dotenv import load_dotenv
from pinecone import Pinecone as PineconeClient
from langchain_openai import OpenAIEmbeddings

# ——— ENV and config ———
load_dotenv()
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY")
DIMENSION        = 1536  # for text-embedding-ada-002
BACKUP_PATH      = "questions_backup.pkl"
INDEX_NAME       = "my-doc-questions"
MAX_DOC_BYTES    = 3_500_000  # Pinecone limit is 4MB (safe margin)

# ——— Load question backup ———
with open(BACKUP_PATH, "rb") as f:
    data = pickle.load(f)
print(f"[Load] {len(data['doc_id'])} documents loaded from question backup.")

# ——— Load meta_map ———
df = pd.read_csv("files_index_safe.csv")
meta_df = df[df['mimeType'].isin([
    'application/vnd.google-apps.document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])]
meta_map = meta_df.set_index("id").to_dict(orient="index")

# ——— Pinecone setup (v3) ———
pc = PineconeClient(api_key=PINECONE_API_KEY)
if INDEX_NAME not in [i.name for i in pc.list_indexes()]:
    pc.create_index(
        name=INDEX_NAME,
        dimension=DIMENSION,
        metric="cosine",
        spec={"cloud": "aws", "region": "us-east-1"},
    )
index = pc.Index(INDEX_NAME)

# ——— Embedding model ———
embedder = OpenAIEmbeddings(model="text-embedding-ada-002", api_key=OPENAI_API_KEY)

# ——— Prepare and upsert per document ———
uploaded = 0
skipped = 0

for doc_id, questions in zip(data["doc_id"], data["questions"]):
    clean_questions = [q.strip() for q in questions if q.strip()]
    if not clean_questions:
        continue

    joined_text = "\n".join(clean_questions)
    text_bytes = len(joined_text.encode("utf-8"))
    if text_bytes > MAX_DOC_BYTES:
        print(f"[Skip] {doc_id} too large ({text_bytes} bytes)")
        skipped += 1
        continue

    meta = meta_map.get(doc_id, {})
    full_meta = {
        "doc_id": doc_id,
        "doc_type": "question_list",
        "num_questions": len(clean_questions),
        "questions_text": joined_text,
        **meta
    }

    try:
        vec = embedder.embed_documents([joined_text])[0]
        index.upsert([{
            "id": str(uuid4()),
            "values": vec,
            "metadata": full_meta
        }])
        uploaded += 1
    except Exception as e:
        print(f"[Error] {doc_id} — {e}")
        skipped += 1

# ——— Report ———
print(f"[Done] Uploaded {uploaded} documents to '{INDEX_NAME}', skipped {skipped} oversized or failed.")
