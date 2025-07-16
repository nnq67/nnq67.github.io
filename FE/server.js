const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');

const app = express();
const port = 7777;

app.use(express.json());
app.use(cors());
app.use(express.static('public'));

const driver = neo4j.driver(
  'bolt://localhost:7690', // URI Neo4j của bạn - Hãy đảm bảo nó chính xác
  neo4j.auth.basic('neo4j', '12345678') // Thông tin đăng nhập Neo4j của bạn
);

// Middleware kiểm tra kết nối Neo4j
app.use(async (req, res, next) => {
  try {
    await driver.verifyConnectivity();
    next();
  } catch (error) {
    console.error('Lỗi kết nối Neo4j:', error);
    res.status(500).json({ success: false, error: 'Không thể kết nối đến cơ sở dữ liệu' });
  }
});

// Route đăng ký người dùng
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;
  // CẢNH BÁO QUAN TRỌNG: Trong thực tế, hãy băm mật khẩu trước khi lưu!
  const session = driver.session();
  try {
    // Kiểm tra xem username đã tồn tại chưa
    const existingUser = await session.run(
      'MATCH (u:User {username: $username}) RETURN u',
      { username }
    );
    if (existingUser.records.length > 0) {
      return res.json({ success: false, error: 'Tên người dùng đã tồn tại' });
    }

    // Step 1: Get the highest user_id currently in use
    const result = await session.run(`
      MATCH (u:User)
      RETURN MAX(u.user_id) AS max_id
    `);

    const maxId = result.records[0].get('max_id');
    // Step 2: Generate the next user_id as "u#" (e.g., u1, u2, u3, etc.)
    // Đảm bảo logic này đủ mạnh cho môi trường đa luồng nếu cần
    const newUserId = maxId === null ? 'u1' : `u${parseInt(maxId.slice(1)) + 1}`;

    // Tạo người dùng mới với user_id đã được tạo
    await session.run(`
      CREATE (u:User {user_id: $user_id, username: $username, password: $password})
    `, { user_id: newUserId, username, password });

    res.json({ success: true, user_id: newUserId });

  } catch (err) {
    console.error('Lỗi đăng ký:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// Route đăng nhập người dùng
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const session = driver.session();
  try {
    const result = await session.run(
      'MATCH (u:User {username: $username, password: $password}) RETURN u',
      { username, password }
    );

    if (result.records.length > 0) {
      const user = result.records[0].get('u');
      const user_id = user.properties.user_id;
      const name = user.properties.name || username; // Sử dụng username nếu không có thuộc tính 'name'
      // const username = user.properties.username; // Đã có từ đầu

      res.json({ success: true, user_id, name, username });
    } else {
      res.json({ success: false, error: 'Thông tin đăng nhập không hợp lệ' });
    }
  } catch (err) {
    console.error('Lỗi đăng nhập:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    await session.close();
  }
});

// Route để lấy sách đề xuất
// LƯU Ý: Frontend (script.js cho trang chủ) có thể đang gọi /recommend?username=...
// Route này là /recommendations và hiện đang ưu tiên user_id. Cần thống nhất!
// Thêm route mới này vào file server.js của bạn

app.get('/home-sections', async (req, res) => {
  const { user_id } = req.query; // Lấy user_id từ query params (nếu người dùng đã đăng nhập)
  const session = driver.session();

  try {
    const recommendations = {};

    // Hàm helper để chuyển đổi bản ghi Neo4j sang đối tượng sách mong muốn
    // Bạn cần đảm bảo các truy vấn Cypher trả về đủ các trường này
    const mapRecordToBookObject = (record, customFields = {}) => {
      const book = {
        id: record.get('bookId'), // Hoặc 'id' tùy theo alias trong Cypher
        title: record.get('title'),
        cover: record.get('cover') || 'default.jpg', // Cung cấp ảnh default nếu không có
        author: record.get('authorName') || 'N/A',
        category: record.get('categoryName') || 'N/A',
        rating: record.get('rating') // Sẽ xử lý kiểu số của Neo4j sau
      };
      // Xử lý các trường kiểu số từ Neo4j (có thể là object {low, high})
      if (book.rating && book.rating.low !== undefined) {
        book.rating = book.rating.toNumber();
      } else if (book.rating === null || book.rating === undefined) {
        book.rating = 'N/A';
      }
      // Thêm các trường tùy chỉnh như likeCount, averageRating
      for (const key in customFields) {
        let value = record.get(customFields[key]);
        if (value && value.low !== undefined) {
          value = value.toNumber();
        }
        book[key] = value || (key === 'likeCount' ? 0 : 'N/A');
      }
      return book;
    };



    // === BÀI TOÁN 1: Gợi ý dựa trên thể loại sách người dùng đã THÍCH ===

    if (user_id) {
      const query1 = `
        MATCH (u:User {user_id: $userId})-[:LIKES]->(:Book)-[:IN_CATEGORY]->(c:Category),
              (rec:Book)-[:IN_CATEGORY]->(c)
        WHERE NOT (u)-[:LIKES]->(rec) AND NOT (u)-[:RATED]->(rec) // Không gợi ý sách đã thích hoặc đã đánh giá
        OPTIONAL MATCH (rec)-[:WRITTEN_BY]->(author:Author)
        OPTIONAL MATCH (rec)<-[likeRel:LIKES]-(:User) // Đếm số lượt thích cho sách gợi ý
        WITH rec, author, c, COUNT(DISTINCT likeRel) AS likeCount
        RETURN rec.book_id AS bookId, rec.title AS title, rec.cover AS cover, rec.description AS description,
               author.name AS authorName, c.name AS categoryName, rec.rating AS rating, likeCount
        ORDER BY likeCount DESC, rec.rating DESC
        LIMIT 10
      `;
      const result1 = await session.run(query1, { userId: user_id });
      recommendations.byLikedCategory = result1.records.map(r => mapRecordToBookObject(r, {
          likeCount: 'likeCount',
          description: 'description' // Thêm description nếu cần
      }));
    } else {
      // Fallback nếu người dùng chưa đăng nhập: có thể lấy sách phổ biến theo thể loại
      recommendations.byLikedCategory = []; // Hoặc logic fallback khác
    }

    // === BÀI TOÁN 2: Gợi ý dựa trên tác giả sách người dùng đã THÍCH ===

    if (user_id) {
      const query2 = `
        MATCH (u:User {user_id: $userId})-[:LIKES]->(:Book)-[:WRITTEN_BY]->(author:Author),
              (rec:Book)-[:WRITTEN_BY]->(author)
        WHERE NOT (u)-[:LIKES]->(rec) AND NOT (u)-[:RATED]->(rec)
        OPTIONAL MATCH (rec)-[:IN_CATEGORY]->(c:Category)
        OPTIONAL MATCH (rec)<-[likeRel:LIKES]-(:User)
        WITH rec, author, c, COUNT(DISTINCT likeRel) AS likeCount
        WHERE likeCount > 0
        RETURN rec.book_id AS bookId, rec.title AS title, rec.cover AS cover, rec.description AS description,
               author.name AS authorName, c.name AS categoryName, rec.rating AS rating, likeCount
        ORDER BY likeCount DESC, rec.rating DESC
        LIMIT 10
      `;
      const result2 = await session.run(query2, { userId: user_id });
      recommendations.byLikedAuthor = result2.records.map(r => mapRecordToBookObject(r, {
        likeCount: 'likeCount',
        description: 'description'
      }));
    } else {

      recommendations.byLikedAuthor = []; // Hoặc logic fallback khác
    }

    // === BÀI TOÁN 3: Sách có điểm đánh giá cao (>= 4.2) mà người dùng chưa tương tác ===
    // (Lưu ý: Schema của bạn có (:User)-[:RATED{score, comment}]->(:Book))
const query3Params = {};
let query3WhereClause = "WHERE bookAvgScore >= 4.2"; // Ngưỡng điểm có thể điều chỉnh

if (user_id) {
  query3Params.userId = user_id;
  // Conditions for not already rated or liked by the user
  // Chúng ta sẽ đặt điều kiện này vào một mệnh đề WHERE riêng hoặc trong mệnh đề WHERE chính sau khi user đã được MATCH
  // For now, let's just make sure the MATCH happens first.
}

const query3 = `
  MATCH (book:Book)<-[r:RATED]-(:User)
  WITH book, avg(r.score) AS bookAvgScore
  WHERE bookAvgScore >= 4.2 // Điều kiện lọc sách có điểm trung bình cao

  ${user_id ? `
  MATCH (u:User {user_id: $userId}) // MATCH user nếu có user_id
  WHERE NOT (u)-[:RATED]->(book) AND NOT (u)-[:LIKES]->(book) // Điều kiện lọc sách chưa tương tác
  ` : ""}

  OPTIONAL MATCH (book)-[:WRITTEN_BY]->(author:Author)
  OPTIONAL MATCH (book)-[:IN_CATEGORY]->(c:Category)
  RETURN DISTINCT book.book_id AS bookId, book.title AS title, book.cover AS cover, book.description AS description,
         author.name AS authorName, c.name AS categoryName, book.rating AS rating, bookAvgScore AS averageRating
  ORDER BY bookAvgScore DESC, book.rating DESC
  LIMIT 5
`;
const result3 = await session.run(query3, query3Params);
recommendations.topRatedUninteracted = result3.records.map(r => mapRecordToBookObject(r, {
  averageRating: 'averageRating',
  description: 'description'
}));
    // === BÀI TOÁN 4: Tác giả nổi bật và sách hàng đầu của họ ===
    const query4 = `
      MATCH (author:Author)<-[:WRITTEN_BY]-(book:Book)<-[r_rated:RATED]-(:User)
      WITH author, book, avg(r_rated.score) AS bookAvgScore
      OPTIONAL MATCH (book)-[:IN_CATEGORY]->(book_cat:Category)
      WITH author, book, bookAvgScore, book_cat.name AS bookCategoryName

      WITH author, collect({
          bookNode: book, 
          score: bookAvgScore, 
          categoryName: bookCategoryName
      }) AS booksInfo, avg(bookAvgScore) AS rawAuthorAvg

      WITH author, booksInfo, toFloat(round(rawAuthorAvg * 100)) / 100 AS authorAvgScore
      WHERE authorAvgScore IS NOT NULL // Đảm bảo tác giả có điểm trung bình
      ORDER BY authorAvgScore DESC
      LIMIT 5

      UNWIND booksInfo AS info
      WITH author, authorAvgScore, 
           info.bookNode AS recBook, 
           info.score AS bookCalculatedAvgScore,
           info.categoryName AS recBookCategoryName
      ORDER BY authorAvgScore DESC, bookCalculatedAvgScore DESC

      WITH author, authorAvgScore, head(collect({
          bookId: recBook.book_id,
          title: recBook.title,
          cover: recBook.cover,
          description: recBook.description,
          rating: bookCalculatedAvgScore,
          category: recBookCategoryName
      })) AS topBookDetails
      WHERE topBookDetails.bookId IS NOT NULL

      RETURN author.author_id AS authorId, author.name AS authorName, authorAvgScore,
             topBookDetails.bookId AS bookId, topBookDetails.title AS title,
             topBookDetails.cover AS cover, topBookDetails.description AS description,
             topBookDetails.rating AS rating,
             topBookDetails.category AS topBookCategory  
    `;
    const result4 = await session.run(query4);
    recommendations.topAuthorsAndBooks = result4.records.map(r => {
      let authorAvgScore = r.get('authorAvgScore');
      if (authorAvgScore && typeof authorAvgScore === 'object' && neo4j.integer.isInteger(authorAvgScore)) {
        authorAvgScore = authorAvgScore.toNumber();
      } else if (typeof authorAvgScore === 'number') {
        authorAvgScore = parseFloat(authorAvgScore.toFixed(2));
      } else {
        authorAvgScore = 'N/A'; // Hoặc giá trị mặc định khác nếu avg là null
      }

      let topBookRating = r.get('rating'); // rating này là bookCalculatedAvgScore
      if (topBookRating && typeof topBookRating === 'object' && neo4j.integer.isInteger(topBookRating)) {
        topBookRating = topBookRating.toNumber();
      } else if (typeof topBookRating === 'number') {
        topBookRating = parseFloat(topBookRating.toFixed(2));
      } else { 
        topBookRating = 'N/A'; 
      }

      return {
        authorId: r.get('authorId'),
        authorName: r.get('authorName') || 'N/A',
        authorAvgScore: authorAvgScore,
        topBook: {
          id: r.get('bookId'),
          title: r.get('title'),
          description: r.get('description') || 'N/A',
          cover: r.get('cover') || 'default.jpg',
          rating: topBookRating,
          category: r.get('topBookCategory') || 'N/A'
        }
      };
    });

    res.json(recommendations);

  } catch (error) {
    console.error('Lỗi lấy các mục đề xuất cho trang chủ:', error);
    res.status(500).json({ error: 'Không thể lấy dữ liệu đề xuất', details: error.message });
  } finally {
    if (session) {
      await session.close();
    }
  }
});

// Route tìm kiếm sách
app.get('/search-books', async (req, res) => {
  const { query: searchTerm } = req.query;
  if (!searchTerm) {
    return res.json([]); // Trả về mảng rỗng nếu không có query
}
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (book:Book) // Bắt đầu với Book node
      WHERE toLower(book.title) CONTAINS toLower($searchTermValue) // $searchTermValue từ req.query.query
      OPTIONAL MATCH (book)-[:WRITTEN_BY]->(author:Author) // Tác giả có thể có hoặc không
      RETURN book.book_id AS id,      // QUAN TRỌNG: Trả về book_id AS id
          book.title AS title,
          author.name AS author,   // Sẽ là null nếu không có tác giả
          book.category AS category,
          book.cover AS cover,     // Trả về cover
          book.rating AS rating    // Trả về rating
      LIMIT 40`,
      { searchTermValue: searchTerm } 
    );
    const books = result.records.map(record => {
    const book = record.toObject();
    // Đảm bảo rating là số hoặc null/N/A, không phải đối tượng Neo4j Integer
    if (book.rating && typeof book.rating === 'object' && book.rating.low !== undefined) {
        book.rating = book.rating.toNumber();
    } else if (book.rating === null || book.rating === undefined) {
        book.rating = 'N/A';
    }
    // Đảm bảo các trường khác có giá trị mặc định nếu null
    book.author = book.author || 'N/A';
    book.category = book.category || 'N/A';
    book.cover = book.cover; // Giữ nguyên, frontend sẽ xử lý default
    return book;
  });
    res.json(books);
  } catch (error) { // <--- KHỐI CATCH ĐỂ XỬ LÝ LỖI
    console.error('Lỗi khi tìm kiếm sách:', error);
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ khi tìm kiếm sách', details: error.message });
  } finally { // <--- KHỐI FINALLY ĐỂ LUÔN ĐÓNG SESSION
    if (session) {
      await session.close(); // Đóng session
    }
  }
});

// --- ENDPOINT: THÍCH/BỎ THÍCH MỘT CUỐN SÁCH ---
app.post('/api/like-book', async (req, res) => {
    const { identifier, identifierType, bookId } = req.body;
    // 'bookId' ở đây là giá trị mà frontend gửi lên (dựa trên thuộc tính 'id' nó nhận được).
    // Giá trị này sẽ tương ứng với thuộc tính 'book_id' của sách trong database.

    if (!identifier || !bookId || !identifierType) {
        return res.status(400).json({ message: 'Thiếu thông tin user identifier, identifier type hoặc bookId' });
    }

    const session = driver.session();
    try {
        let userMatchClause = '';
        if (identifierType === 'userId') {
            userMatchClause = `(u:User {user_id: $identifierValue})`;
        } else if (identifierType === 'username') {
            userMatchClause = `(u:User {username: $identifierValue})`;
        } else {
            await session.close();
            return res.status(400).json({ message: 'Identifier type không hợp lệ.' });
        }

        // Book node được khớp bằng thuộc tính 'book_id' trong database
        const bookMatchClause = `(b:Book {book_id: $bookIdValue})`; 

        const checkQuery = `
            MATCH ${userMatchClause}-[r:LIKES]->${bookMatchClause}
            RETURN r
        `;
        // $bookIdValue ở đây chính là giá trị 'bookId' (tương ứng book_id) từ frontend
        const checkResult = await session.run(checkQuery, { identifierValue: identifier, bookIdValue: bookId });

        let status;
        if (checkResult.records.length > 0) {
            // Đã thích -> Bỏ thích
            const unlikeQuery = `
                MATCH ${userMatchClause}-[r:LIKES]->${bookMatchClause}
                DELETE r
            `;
            await session.run(unlikeQuery, { identifierValue: identifier, bookIdValue: bookId });
            status = 'unliked';
        } else {
            // Chưa thích -> Thích
            const likeQuery = `
                MERGE ${userMatchClause} // Đảm bảo User node tồn tại
                MERGE ${bookMatchClause} // Đảm bảo Book node tồn tại (sử dụng book_id để MERGE)
                WITH u, b
                MERGE (u)-[r:LIKES]->(b) // Tạo mối quan hệ LIKES
                ON CREATE SET r.liked_at = timestamp() // (Tùy chọn) Thêm thời gian khi thích
            `;
            await session.run(likeQuery, { identifierValue: identifier, bookIdValue: bookId });
            status = 'liked';
        }

        res.status(200).json({
            message: `Hành động thành công: ${status}`,
            status: status,
        });

    } catch (error) {
        console.error('Lỗi Neo4j khi xử lý like/unlike:', error);
        res.status(500).json({ message: 'Lỗi server khi tương tác với Neo4j', details: error.message });
    } finally {
        await session.close();
    }
});

// --- ENDPOINT: LẤY DANH SÁCH SÁCH ĐÃ THÍCH CỦA USER ---
app.get('/api/get-user-liked-books', async (req, res) => {
    const { identifier, identifierType } = req.query;

    if (!identifier || !identifierType) {
        return res.status(400).json({ message: 'Thiếu thông tin user identifier hoặc identifier type' });
    }

    const session = driver.session();
    try {
        let userMatchClause = '';
        if (identifierType === 'userId') {
            userMatchClause = `(u:User {user_id: $identifierValue})`;
        } else if (identifierType === 'username') {
            userMatchClause = `(u:User {username: $identifierValue})`;
        } else {
            await session.close();
            return res.status(400).json({ message: 'Identifier type không hợp lệ.' });
        }

        // Trả về 'book_id' của sách đã thích, nhưng đặt bí danh là 'bookId' cho frontend
        const query = `
            MATCH ${userMatchClause}-[:LIKES]->(b:Book)
            RETURN b.book_id AS bookId 
        `;
        
        const result = await session.run(query, { identifierValue: identifier });
        // Frontend sẽ nhận được một mảng các giá trị book_id (được đặt tên là bookId trong JSON)
        const likedBookIds = result.records.map(record => record.get('bookId'));
        res.status(200).json({ likedBookIds: likedBookIds });

    } catch (error) {
        console.error('Lỗi Neo4j khi lấy sách đã thích:', error);
        res.status(500).json({ message: 'Lỗi server khi lấy sách đã thích', details: error.message });
    } finally {
        await session.close();
    }
});


app.listen(port, () => {
  console.log(`Server đang chạy trên http://localhost:${port}/login.html`);

  // Đóng driver Neo4j khi ứng dụng dừng
  process.on('SIGINT', async () => {
  console.log('Server đang tắt. Đóng kết nối Neo4j...');
  await driver.close();
  process.exit(0);
  });
});