# endpoints/chat.py

from fastapi import APIRouter
from fastapi.exceptions import HTTPException

chat_router = APIRouter()

@chat_router.post("/generate/")
async def generate_text(prompt: str):
    if not prompt:
        raise HTTPException(status_code=422, detail="Prompt is required")
    
    # Here you would call your Qwen model
    response = "This is a generated response based on the prompt."  # Placeholder for actual model interaction
    
    return {"prompt": prompt, "response": response}
