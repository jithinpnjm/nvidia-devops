with open('docs/volume-02/04-fastapi-microservices-masterclass.md', 'r') as f:
    content = f.read()

new_section = """
## 2.5. Building Your First Complete FastAPI Application

For those entirely new to FastAPI, you need to understand how the pieces fit together into a runnable file. Here is a complete, deployable script. 

### The Complete Code (`main.py`)
```python
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# 1. Initialize the application
app = FastAPI(title="GPU Fleet API", version="1.0.0")

# 2. Define your Data Template (Pydantic)
# This guarantees that whoever calls our API provides exactly this structure.
class GPURequest(BaseModel):
    gpu_type: str
    count: int

# 3. Create a mock database (In production, this would be Postgres or Redis)
fleet_db = []

# 4. Define an endpoint (The @ decorator binds the URL to the function)
@app.post("/allocate")
async def allocate_gpus(request: GPURequest):
    # If the user sends a string instead of an int for 'count', FastAPI automatically 
    # rejects it before this function even runs!
    
    if request.count > 8:
        # We manually raise an HTTP error if business logic fails
        raise HTTPException(status_code=400, detail="Cannot request more than 8 GPUs")
        
    allocation_record = {"assigned_type": request.gpu_type, "assigned_count": request.count}
    fleet_db.append(allocation_record)
    
    return {"message": "GPUs allocated", "data": allocation_record}

@app.get("/inventory", response_model=List[dict])
async def get_inventory():
    return fleet_db

# 5. The Execution Block
if __name__ == "__main__":
    # uvicorn is the ASGI web server that runs FastAPI
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### How to Run and Test This
1. Save the file as `main.py`.
2. Install the dependencies: `pip install fastapi uvicorn pydantic`
3. Run the script: `python main.py`
4. FastAPI automatically generates a beautiful interactive documentation UI. Open your browser and go to `http://localhost:8000/docs` to test your API visually without writing a single `curl` command.
"""

content = content.replace("## 3. Architecture: WSGI vs. ASGI", new_section + "\n\n## 3. Architecture: WSGI vs. ASGI")

with open('docs/volume-02/04-fastapi-microservices-masterclass.md', 'w') as f:
    f.write(content)
