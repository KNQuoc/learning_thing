from contextlib import asynccontextmanager
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

# Configure paths
BASE_DIR = "data"
CHAT_HISTORY_DIR = os.path.join(BASE_DIR, "chat_history")
os.makedirs(BASE_DIR, exist_ok=True)
os.makedirs(CHAT_HISTORY_DIR, exist_ok=True)

# Initialize embeddings
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# Dictionary to store vector stores for each folder
vector_stores: Dict[str, FAISS] = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.
    Handles startup and shutdown events.
    """
    # Startup: Load vector stores
    print("Starting up: Loading vector stores...")
    for folder in os.listdir(BASE_DIR):
        folder_path = os.path.join(BASE_DIR, folder)
        vectorstore_path = os.path.join(folder_path, "vectorstore")
        if os.path.exists(vectorstore_path):
            try:
                vector_stores[folder] = FAISS.load_local(vectorstore_path, embeddings)
                print(f"Successfully loaded vector store for folder {folder}")
            except Exception as e:
                print(f"Error loading vector store for folder {folder}: {e}")
    
    yield  # Server is running
    
    # Shutdown: Clean up resources
    print("Shutting down: Cleaning up resources...")
    vector_stores.clear()

# Create FastAPI app with lifespan
app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_folder_path(folder_id: str) -> str:
    folder_path = os.path.join(BASE_DIR, folder_id)
    os.makedirs(folder_path, exist_ok=True)
    return folder_path

def save_chat_history(chat_id: str, history: list):
    """Save chat history to disk"""
    history_path = os.path.join(CHAT_HISTORY_DIR, f"{chat_id}.json")
    with open(history_path, 'w') as f:
        json.dump(history, f)

def load_chat_history(chat_id: str) -> list:
    """Load chat history from disk"""
    history_path = os.path.join(CHAT_HISTORY_DIR, f"{chat_id}.json")
    if os.path.exists(history_path):
        with open(history_path, 'r') as f:
            return json.load(f)
    return []

def process_document(file_path: str):
    print(f"Starting to process document: {file_path}")  # Debug log
    
    try:
        ext = os.path.splitext(file_path)[1].lower()
        print(f"File extension: {ext}")  # Debug log
        
        if ext == '.txt':
            loader = TextLoader(file_path)
        elif ext == '.pdf':
            try:
                loader = PyPDFLoader(file_path)
                print("Successfully created PDF loader")  # Debug log
            except Exception as e:
                print(f"Error creating PDF loader: {str(e)}")  # Debug log
                raise ValueError(f"Error loading PDF: {str(e)}")
        elif ext in ['.doc', '.docx']:
            loader = Docx2txtLoader(file_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")

        try:
            print("Loading document content")  # Debug log
            documents = loader.load()
            print(f"Successfully loaded document with {len(documents)} pages/sections")  # Debug log
        except Exception as e:
            print(f"Error loading document content: {str(e)}")  # Debug log
            raise ValueError(f"Error loading document content: {str(e)}")

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
        
        try:
            print("Splitting document into chunks")  # Debug log
            chunks = text_splitter.split_documents(documents)
            print(f"Successfully split into {len(chunks)} chunks")  # Debug log
            return chunks
        except Exception as e:
            print(f"Error splitting document: {str(e)}")  # Debug log
            raise ValueError(f"Error splitting document: {str(e)}")

    except Exception as e:
        print(f"Error in process_document: {str(e)}")  # Debug log
        import traceback
        print(f"Traceback: {traceback.format_exc()}")  # Debug log
        raise

@app.post("/upload/{folder_id}")
async def upload_file(folder_id: str, file: UploadFile = File(...)):
    saved_file_path = None
    try:
        print(f"Starting file upload for folder: {folder_id}")
        print(f"File details - Filename: {file.filename}, Content-Type: {file.content_type}")

        # Create folder-specific paths
        folder_path = get_folder_path(folder_id)
        uploads_path = os.path.join(folder_path, "uploads")
        vectorstore_path = os.path.join(folder_path, "vectorstore")
        os.makedirs(uploads_path, exist_ok=True)
        os.makedirs(vectorstore_path, exist_ok=True)

        # Check if file already exists
        file_path = os.path.join(uploads_path, file.filename)
        if os.path.exists(file_path):
            raise HTTPException(
                status_code=400, 
                detail=f"File {file.filename} already exists in this folder"
            )

        # Save uploaded file
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_file_path = file_path
            print(f"File saved successfully to: {file_path}")
        except Exception as e:
            print(f"Error saving file: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

        # Process the document
        try:
            chunks = process_document(file_path)
            print(f"Document processed successfully into {len(chunks)} chunks")
        except Exception as e:
            print(f"Error processing document: {str(e)}")
            # Clean up saved file if processing fails
            if saved_file_path and os.path.exists(saved_file_path):
                os.remove(saved_file_path)
            raise HTTPException(status_code=400, detail=f"Error processing document: {str(e)}")
        
        # Update vector store
        try:
            if folder_id not in vector_stores:
                print("Creating new vector store")
                vector_stores[folder_id] = FAISS.from_documents(chunks, embeddings)
            else:
                print("Adding to existing vector store")
                vector_stores[folder_id].add_documents(chunks)

            print("Saving vector store to disk")
            vector_stores[folder_id].save_local(vectorstore_path)
            print("Vector store saved successfully")
            
        except Exception as e:
            print(f"Error with vector store: {str(e)}")
            # Clean up file if vectorization fails
            if saved_file_path and os.path.exists(saved_file_path):
                os.remove(saved_file_path)
            raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

        return {
            "filename": file.filename,
            "chunks": len(chunks),
            "folder_id": folder_id
        }

    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Unexpected error during upload: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        # Clean up file on unexpected errors
        if saved_file_path and os.path.exists(saved_file_path):
            os.remove(saved_file_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat/{folder_id}")
async def chat(folder_id: str, request: dict):
    try:
        message = request["message"]
        session_id = request.get("session_id")
        context = ""
        docs = []
        
        # Try to load vector store and get context if available
        if folder_id not in vector_stores:
            vectorstore_path = os.path.join(get_folder_path(folder_id), "vectorstore")
            if os.path.exists(vectorstore_path):
                vector_stores[folder_id] = FAISS.load_local(vectorstore_path, embeddings)
        
        # If vector store exists, get relevant documents
        if folder_id in vector_stores:
            docs = vector_stores[folder_id].similarity_search(message, k=3)
            context = "\n\n".join([doc.page_content for doc in docs])
            context_section = f"""Context information from {folder_id} is below.
---------------------
{context}
---------------------"""
        else:
            context_section = ""

        # Load existing chat history if available
        chat_history = []
        if session_id:
            chat_history = load_chat_history(session_id)
            
        # Add the new user message to history
        chat_history.append({"role": "user", "content": message})

        # Construct prompt with optional context and chat history
        messages = [
            {"role": "system", "content": "You are a helpful teaching assistant. Your primary goal is to guide learners by providing clear, thorough, and well-structured explanations."},
        ]
        
        # Add context if available
        if context_section:
            messages.append({"role": "system", "content": context_section})
        
        # Add chat history and new message
        messages.extend(chat_history)

        # Send to LM Studio
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://localhost:1234/v1/chat/completions",
                json={
                    "messages": messages,
                    "temperature": 0.7
                }
            ) as response:
                if response.status != 200:
                    raise HTTPException(status_code=response.status, detail="Model API error")
                
                result = await response.json()
                assistant_message = result["choices"][0]["message"]["content"]
                
                # Add assistant's response to history and save
                chat_history.append({"role": "assistant", "content": assistant_message})
                if session_id:
                    save_chat_history(session_id, chat_history)
                
                return {
                    "response": assistant_message,
                    "sources": [{"content": doc.page_content, "metadata": doc.metadata} for doc in docs]
                }

    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
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
        print(f"Attempting to delete folder: {folder_id}")  # Debug log
        
        # Remove from vector stores if exists
        if folder_id in vector_stores:
            print(f"Removing vector store from memory for folder {folder_id}")
            del vector_stores[folder_id]
        
        # Get folder paths
        folder_path = get_folder_path(folder_id)
        uploads_path = os.path.join(folder_path, "uploads")
        vectorstore_path = os.path.join(folder_path, "vectorstore")
        
        # Delete specific files first
        if os.path.exists(uploads_path):
            print(f"Deleting files in uploads directory: {uploads_path}")
            for filename in os.listdir(uploads_path):
                file_path = os.path.join(uploads_path, filename)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        print(f"Deleted file: {filename}")
                except Exception as e:
                    print(f"Error deleting file {filename}: {e}")
        
        # Delete vector store directory
        if os.path.exists(vectorstore_path):
            print(f"Deleting vector store directory: {vectorstore_path}")
            shutil.rmtree(vectorstore_path, ignore_errors=True)
        
        # Delete uploads directory
        if os.path.exists(uploads_path):
            print(f"Deleting uploads directory: {uploads_path}")
            shutil.rmtree(uploads_path, ignore_errors=True)
        
        # Finally delete the main folder
        if os.path.exists(folder_path):
            print(f"Deleting main folder: {folder_path}")
            shutil.rmtree(folder_path, ignore_errors=True)
        
        return {
            "message": "Folder and all contents deleted successfully",
            "folder_id": folder_id
        }
        
    except Exception as e:
        print(f"Error during folder deletion: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete folder: {str(e)}"
        )

@app.delete("/folders/{folder_id}/files/{filename}")
async def delete_file(folder_id: str, filename: str):
    try:
        # Get the file path
        folder_path = get_folder_path(folder_id)
        uploads_path = os.path.join(folder_path, "uploads")
        file_path = os.path.join(uploads_path, filename)
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=404,
                detail=f"File {filename} not found in folder {folder_id}"
            )
        
        # Delete the file
        os.remove(file_path)
        
        # Rebuild vector store without the deleted file
        remaining_files = [f for f in os.listdir(uploads_path) if os.path.isfile(os.path.join(uploads_path, f))]
        
        if remaining_files:
            # Process remaining documents and rebuild vector store
            all_chunks = []
            for remaining_file in remaining_files:
                file_path = os.path.join(uploads_path, remaining_file)
                chunks = process_document(file_path)
                all_chunks.extend(chunks)
            
            # Rebuild vector store
            vectorstore_path = os.path.join(folder_path, "vectorstore")
            vector_stores[folder_id] = FAISS.from_documents(all_chunks, embeddings)
            vector_stores[folder_id].save_local(vectorstore_path)
        else:
            # If no files remain, remove the vector store
            if folder_id in vector_stores:
                del vector_stores[folder_id]
            vectorstore_path = os.path.join(folder_path, "vectorstore")
            if os.path.exists(vectorstore_path):
                shutil.rmtree(vectorstore_path, ignore_errors=True)
        
        return {
            "message": f"File {filename} deleted successfully",
            "remaining_files": remaining_files
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"Error deleting file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete file: {str(e)}"
        )

@app.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str):
    try:
        # Delete chat history file if it exists
        history_path = os.path.join(CHAT_HISTORY_DIR, f"{chat_id}.json")
        if os.path.exists(history_path):
            os.remove(history_path)
        return {"message": "Chat deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))