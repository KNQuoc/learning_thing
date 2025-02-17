from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
import os
import aiohttp
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain.text_splitter import RecursiveCharacterTextSplitter
import shutil
import asyncio
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure paths
BASE_DIR = "data"
os.makedirs(BASE_DIR, exist_ok=True)

# Initialize embeddings
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Dictionary to store vector stores for each folder
vector_stores: Dict[str, FAISS] = {}

def get_folder_path(folder_id: str) -> str:
    folder_path = os.path.join(BASE_DIR, folder_id)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path

def process_document(file_path: str):
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.txt':
        loader = TextLoader(file_path)
    elif ext == '.pdf':
        loader = PyPDFLoader(file_path)
    elif ext in ['.doc', '.docx']:
        loader = Docx2txtLoader(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    documents = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        length_function=len
    )
    return text_splitter.split_documents(documents)

@app.post("/upload/{folder_id}")
async def upload_file(folder_id: str, file: UploadFile = File(...)):
    try:
        # Create folder-specific paths
        folder_path = get_folder_path(folder_id)
        uploads_path = os.path.join(folder_path, "uploads")
        vectorstore_path = os.path.join(folder_path, "vectorstore")
        os.makedirs(uploads_path, exist_ok=True)
        os.makedirs(vectorstore_path, exist_ok=True)

        # Save uploaded file
        file_path = os.path.join(uploads_path, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Process the document
        chunks = process_document(file_path)

        # Update or create vector store for this folder
        if folder_id not in vector_stores:
            vector_stores[folder_id] = FAISS.from_documents(chunks, embeddings)
            vector_stores[folder_id].save_local(vectorstore_path)
        else:
            vector_stores[folder_id].add_documents(chunks)
            vector_stores[folder_id].save_local(vectorstore_path)

        return {
            "filename": file.filename,
            "chunks": len(chunks),
            "folder_id": folder_id
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/{folder_id}")
async def chat(folder_id: str, request: dict):
    try:
        message = request["message"]
        
        # Load vector store for this folder if not already loaded
        if folder_id not in vector_stores:
            vectorstore_path = os.path.join(get_folder_path(folder_id), "vectorstore")
            if os.path.exists(vectorstore_path):
                vector_stores[folder_id] = FAISS.load_local(vectorstore_path, embeddings)
            else:
                raise HTTPException(status_code=400, detail="No documents have been uploaded to this folder yet")

        # Get relevant documents from this folder's vector store
        docs = vector_stores[folder_id].similarity_search(message, k=3)
        context = "\n\n".join([doc.page_content for doc in docs])

        # Construct prompt with context
        prompt = f"""Context information from {folder_id} is below.
---------------------
{context}
---------------------
You are a helpful teaching assistant. Your primary goal is to guide learners by providing clear, thorough, and well-structured explanations. Every time that you are given a file to analyze, maek sure to read the entire file and use that in your context before making any thoughts. Always understand the context from top to bottom before making any thoughts.
Given the context information, please answer the following question: {message}

"""

        # Send to LM Studio
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost:1234/v1/chat/completions",
                json={
                    "messages": [
                        {"role": "system", "content": "You are a helpful teaching assistant. Your primary goal is to guide learners by providing clear, thorough, and well-structured explanations. Every time that you are given a file to analyze, maek sure to read the entire file and use that in your context before making any thoughts. Always understand the context from top to bottom before making any thoughts."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.7
                }
            ) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Model API error")
                
                result = await response.json()
                return {
                    "response": result["choices"][0]["message"]["content"],
                    "sources": [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
                }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/folders/{folder_id}/documents")
async def get_folder_documents(folder_id: str):
    try:
        uploads_path = os.path.join(get_folder_path(folder_id), "uploads")
        if not os.path.exists(uploads_path):
            return {"documents": []}
        
        documents = [f for f in os.listdir(uploads_path) if os.path.isfile(os.path.join(uploads_path, f))]
        return {"documents": documents}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str):
    try:
        # Remove from vector stores if exists
        if folder_id in vector_stores:
            del vector_stores[folder_id]
        
        # Remove folder directory and all contents
        folder_path = get_folder_path(folder_id)
        if os.path.exists(folder_path):
            shutil.rmtree(folder_path)
        
        return {"message": "Folder deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    try:
        return {"message": "Chat deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))