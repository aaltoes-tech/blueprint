import os
import io
import pickle
import pandas as pd
from tqdm import tqdm
from typing import List
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from langchain_community.document_loaders import Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.chat_models import ChatOpenAI
from langchain.chains.summarize import load_summarize_chain
from langchain.embeddings import OpenAIEmbeddings
from dotenv import load_dotenv

# ——— Load environment variables ———
load_dotenv()

# ——— Config & Globals ———
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
backup_path = "questions_backup.pkl"
backup_every = 50

llm = ChatOpenAI(model_name="gpt-3.5-turbo", temperature=0, openai_api_key=OPENAI_API_KEY)
chain = load_summarize_chain(llm, chain_type="refine", verbose=False)
splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
embedder = OpenAIEmbeddings(model_name="text-embedding-ada-002", openai_api_key=OPENAI_API_KEY)

creds = Credentials.from_authorized_user_file("token.json", ["https://www.googleapis.com/auth/drive.readonly"])
service = build("drive", "v3", credentials=creds)

# ——— Load backup if it exists ———
if os.path.exists(backup_path):
    with open(backup_path, "rb") as f:
        out = pickle.load(f)
    print(f"[Resume] Loaded backup with {len(out['doc_id'])} documents.")
else:
    out = {"doc_id": [], "summary": [], "chunks": []}
    print("[Start] No backup found. Starting from scratch.")

already_processed = set(out["doc_id"])

# ——— Main function ———
def extract_data(file_ids: List[str]):
    failed_ids = []
    processed_count = 0

    for i, fid in enumerate(tqdm(file_ids, desc="Processing files")):
        if fid in already_processed:
            continue

        try:
            mime_type = meta_map[fid]["mimeType"]
            fh = io.BytesIO()

            # Download document
            if mime_type == 'application/vnd.google-apps.document':
                request = service.files().export_media(
                    fileId=fid,
                    mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                )
            elif mime_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                request = service.files().get_media(fileId=fid)
            else:
                raise ValueError(f"Unsupported MIME type: {mime_type}")

            downloader = MediaIoBaseDownload(fh, request)
            while not downloader.next_chunk()[1]:
                pass

            # Load and split document
            fh.seek(0)
            with open("temp.docx", "wb") as temp_f:
                temp_f.write(fh.read())

            docs = Docx2txtLoader("temp.docx").load()
            chunks = splitter.split_documents(docs)
            summary = chain.run(chunks)

            # Store result
            out["doc_id"].append(fid)
            out["summary"].append(summary)
            out["chunks"].append(chunks)

            processed_count += 1

        except Exception as e:
            print(f"[Error] {fid}: {e}")
            failed_ids.append(fid)
            continue

        # Periodic backup
        if processed_count > 0 and processed_count % backup_every == 0:
            with open(backup_path, "wb") as f:
                pickle.dump(out, f, protocol=pickle.HIGHEST_PROTOCOL)
            print(f"[Backup] Saved after {len(out['doc_id'])} total files")

    # Final backup
    with open(backup_path, "wb") as f:
        pickle.dump(out, f, protocol=pickle.HIGHEST_PROTOCOL)
    print(f"[Done] Final backup saved to {backup_path}")

    return out, failed_ids

# ——— Entry Point ———
if __name__ == "__main__":
    df = pd.read_csv("files_index_safe.csv")
    meta_df = df[df['mimeType'].isin([
        'application/vnd.google-apps.document',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ])]
    file_ids = meta_df["id"].tolist()
    meta_map = meta_df.set_index("id").to_dict(orient="index")

    data, failed = extract_data(file_ids)

    if failed:
        print(f"[Summary] {len(failed)} files failed:")
        for fid in failed:
            print(f" - {fid}")
