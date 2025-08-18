from pydantic import BaseModel

class ItemSchema(BaseModel):
    id: int
    name: str
    value: float

    class Config:
        orm_mode = True
