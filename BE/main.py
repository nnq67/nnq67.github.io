from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from neo4j import GraphDatabase
from fastapi.middleware.cors import CORSMiddleware
import uuid
from passlib.context import CryptContext
from typing import List, Optional

# --- Neo4j Connection ---
URI = "bolt://localhost:7690"
AUTH = ("neo4j", "12345678")  # Thông tin đăng nhập Neo4j của bạn
driver = GraphDatabase.driver(URI, auth=AUTH)

# --- Password Hashing Context ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# --- FastAPI App Initialization ---
app = FastAPI(title="Book API", version="1.1.0") # Đã cập nhật phiên bản

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:7777"],  # Điều chỉnh nếu URL frontend của bạn khác
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class UserRequest(BaseModel):
    username: str
    password: str

class UserCreateResponse(BaseModel):
    message: str
    user_id: str
    username: str

class UserLoginResponse(BaseModel):
    message: str
    user_id: str
    username: str

class BookResponse(BaseModel):
    id: str # Tương ứng với book_id
    title: str
    description: Optional[str] = None # Mô tả sách
    cover: Optional[str] = None
    author: Optional[str] = None # Tên tác giả
    category: Optional[str] = None # Tên thể loại (đã đổi từ genre)
    rating: Optional[float] = None

# --- API Endpoints ---

@app.post("/signup", response_model=UserCreateResponse, tags=["Xác thực"])
def signup(user: UserRequest):
    """
    Đăng ký người dùng mới.
    Mã hóa mật khẩu và lưu trữ người dùng với user_id duy nhất.
    """
    with driver.session(database="neo4j") as session:
        existing_user = session.run("MATCH (u:User {username: $username}) RETURN u", username=user.username).single()
        if existing_user:
            raise HTTPException(status_code=400, detail="Tên người dùng đã tồn tại")

        user_id = str(uuid.uuid4()) # Tạo user_id duy nhất
        hashed_password = get_password_hash(user.password)

        session.run(
            "CREATE (u:User {user_id: $user_id, username: $username, password: $password})",
            user_id=user_id, username=user.username, password=hashed_password
        )
        return {"message": "Người dùng được tạo thành công", "user_id": user_id, "username": user.username}

@app.post("/login", response_model=UserLoginResponse, tags=["Xác thực"])
def login(user: UserRequest):
    """
    Đăng nhập người dùng hiện tại.
    Xác minh tên người dùng và mật khẩu (đã mã hóa).
    """
    with driver.session(database="neo4j") as session:
        db_user_node = session.run("MATCH (u:User {username: $username}) RETURN u", username=user.username).single()
        
        if not db_user_node:
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không hợp lệ")

        db_user_properties = db_user_node['u']
        stored_password = db_user_properties.get("password")
        user_id = db_user_properties.get("user_id")

        if not stored_password or not verify_password(user.password, stored_password):
            raise HTTPException(status_code=401, detail="Tên đăng nhập hoặc mật khẩu không hợp lệ")

        return {
            "message": f"Chào mừng, {user.username}!",
            "user_id": user_id,
            "username": user.username,
        }

def user_has_interacted(username: str, session) -> bool:
    """
    Hàm hỗ trợ kiểm tra xem người dùng đã có tương tác (LIKES hoặc RATED) với sách nào chưa.
    """
    # Kiểm tra LIKES hoặc RATED
    result = session.run("""
        MATCH (u:User {username: $username})
        WHERE (u)-[:LIKES]->(:Book) OR (u)-[:RATED]->(:Book)
        RETURN count(u) > 0 AS interacted
    """, username=username)
    record = result.single()
    return record["interacted"] if record else False

@app.get("/recommend", response_model=List[BookResponse], tags=["Sách"])
def recommend(username: str):
    """
    Gợi ý sách.
    - Nếu người dùng đã tương tác (thích/đánh giá) sách, gợi ý các sách cùng thể loại.
    - Ngược lại, trả về các sách phổ biến chung.
    """
    with driver.session(database="neo4j") as session:
        books_data = []
        user_interacted = user_has_interacted(username, session)

        if user_interacted:
            # Gợi ý cá nhân hóa dựa trên thể loại của sách đã thích/đánh giá
            # Giả định: Book-[:IN_CATEGORY]->Category, Book-[:WRITTEN_BY]->Author
            query = """
            MATCH (u:User {username: $username})-[:LIKES|RATED]->(b1:Book)-[:IN_CATEGORY]->(c:Category)<-[:IN_CATEGORY]-(b2:Book)
            WHERE NOT (u)-[:LIKES]->(b2) AND NOT (u)-[:RATED]->(b2) AND b1 <> b2
            OPTIONAL MATCH (b2)-[:WRITTEN_BY]->(a:Author)
            WITH b2, a, c, COUNT(DISTINCT b1) AS common_source_books
            RETURN DISTINCT b2.book_id AS id, b2.title AS title, b2.description AS description, b2.cover AS cover,
                           a.name AS author, c.name AS category, b2.rating AS rating
            ORDER BY common_source_books DESC, b2.rating DESC
            LIMIT 10
            """
            result = session.run(query, username=username)
        else:
            # Fallback: sách phổ biến chung
            query = """
            MATCH (b:Book)
            OPTIONAL MATCH (b)-[:WRITTEN_BY]->(a:Author)
            OPTIONAL MATCH (b)-[:IN_CATEGORY]->(c:Category)
            RETURN b.book_id AS id, b.title AS title, b.description AS description, b.cover AS cover,
                   a.name AS author, c.name AS category, b.rating AS rating
            ORDER BY b.rating DESC, rand() // Thêm một chút ngẫu nhiên
            LIMIT 10
            """
            result = session.run(query) # Không cần username cho truy vấn này

        for row in result:
            books_data.append(BookResponse(**row))
        return books_data

@app.get("/search", response_model=List[BookResponse], tags=["Sách"])
def search_books(q: str):
    """
    Tìm kiếm sách theo tiêu đề (không phân biệt chữ hoa chữ thường, khớp một phần).
    Trả về thông tin chi tiết của sách.
    """
    with driver.session(database="neo4j") as session:
        query = """
            MATCH (b:Book)
            WHERE toLower(b.title) CONTAINS toLower($search_query)
            OPTIONAL MATCH (b)-[:WRITTEN_BY]->(a:Author)
            OPTIONAL MATCH (b)-[:IN_CATEGORY]->(c:Category)
            RETURN b.book_id AS id, b.title AS title, b.description AS description, b.cover AS cover,
                   a.name AS author, c.name AS category, b.rating AS rating
            LIMIT 20
        """
        result = session.run(query, search_query=q)
        books_data = []
        for row in result:
            books_data.append(BookResponse(**row))
        return books_data

# --- Application Shutdown Event ---
@app.on_event("shutdown")
def shutdown_event():
    print("Đóng kết nối Neo4j driver.")
    driver.close()

# Để chạy ứng dụng này:
# 1. Lưu dưới dạng file Python (ví dụ: main.py)
# 2. Đảm bảo Neo4j đang chạy và có thể truy cập.
# 3. Cài đặt các dependencies: pip install fastapi uvicorn neo4j pydantic passlib[bcrypt]
# 4. Chạy bằng Uvicorn: uvicorn main:app --reload
