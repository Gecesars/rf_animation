from fastapi import FastAPI
from pydantic import BaseModel

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="API de Teste com FastAPI")

# Configuração CORS (permite acesso do frontend)
origins = [
    "http://localhost:5173",  # Vite
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)





# Modelo de request/response
class Item(BaseModel):
    id: int
    name: str
    value: float

# Cria a aplicação
app = FastAPI(title="API de Teste com FastAPI")

# Rota raiz
@app.get("/")
def read_root():
    return {"message": "Servidor FastAPI está rodando 🚀"}

# Exemplo de GET
@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "query": q}

# Exemplo de POST
@app.post("/items/")
def create_item(item: Item):
    return {"status": "ok", "item": item}
