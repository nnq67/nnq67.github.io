document.addEventListener('DOMContentLoaded', () => {
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchResultsContainer = document.getElementById('search-results');
  const siteTitle = document.getElementById('site-title');

  if (siteTitle) {
    siteTitle.addEventListener('click', () => {
      window.location.href = 'home.html';
    });
  }

  // --- HÀM XỬ LÝ KHI THÍCH MỘT CUỐN SÁCH ---
  async function handleLikeBook(bookId, likeButtonElement) {
    console.count("handleLikeBookExecution");
    console.trace("handleLikeBook was called from:");

    const userId = localStorage.getItem('user_id');
    const username = localStorage.getItem('username');
    const userIdentifier = userId || username;

    if (!userIdentifier) {
      alert('Bạn cần đăng nhập để có thể thích sách!');
      // Cân nhắc chuyển hướng đến trang đăng nhập nếu cần
      // window.location.href = 'login.html';
      return;
    }
    const identifierType = userId ? 'userId' : 'username';

    console.log(`Attempting to like book (search page): ${bookId} by user: ${userIdentifier} (type: ${identifierType})`);

    try {
      const response = await fetch('http://localhost:7777/api/like-book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: userIdentifier,
          identifierType: identifierType,
          bookId: bookId // bookId này phải là ID duy nhất của sách (ví dụ: book.id)
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `Lỗi HTTP! Status: ${response.status}` }));
        throw new Error(errorData.message || `Lỗi HTTP! Status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Phản hồi từ server (like book - search page):', result);

      if (likeButtonElement) {
        if (result.status === 'liked') {
          likeButtonElement.classList.add('liked');
          likeButtonElement.innerHTML = '❤️'; // Tim đỏ
        } else if (result.status === 'unliked') {
          likeButtonElement.classList.remove('liked');
          likeButtonElement.innerHTML = '🤍'; // Tim trắng
        } else {
          // Fallback nếu server không trả về status cụ thể
          likeButtonElement.classList.toggle('liked');
          likeButtonElement.innerHTML = likeButtonElement.classList.contains('liked') ? '❤️' : '🤍';
        }
      }
    } catch (error) {
      console.error('Lỗi khi thực hiện hành động thích sách (search page):', error);
      alert('Đã xảy ra lỗi khi thích sách: ' + error.message);
    }
  }

  // --- HÀM LẤY VÀ CÀI ĐẶT TRẠNG THÁI THÍCH BAN ĐẦU ---
  async function fetchAndSetInitialLikeStatus(bookIds) {
    const userId = localStorage.getItem('user_id');
    const username = localStorage.getItem('username');
    const userIdentifier = userId || username;

    if (!userIdentifier || !Array.isArray(bookIds) || bookIds.length === 0) {
      return;
    }
    const identifierType = userId ? 'userId' : 'username';

    try {
      // Endpoint này cần được tạo ở backend, ví dụ: /api/get-user-liked-books
      // Nó sẽ trả về một mảng các bookId mà người dùng đã thích
      const response = await fetch(`http://localhost:7777/api/get-user-liked-books?identifier=${encodeURIComponent(userIdentifier)}&identifierType=${identifierType}`);
      if (!response.ok) {
        console.error('Không thể lấy trạng thái thích của sách (search page).');
        return;
      }
      const likedData = await response.json(); // Giả sử backend trả về { likedBookIds: [...] }

      if (Array.isArray(likedData.likedBookIds)) {
        bookIds.forEach(bookId => {
          // Quan trọng: Đảm bảo bookId không phải là null hoặc undefined
          if (bookId) {
            const likeButton = document.querySelector(`.like-button[data-book-id="${bookId}"]`);
            if (likeButton && likedData.likedBookIds.includes(bookId)) {
              likeButton.classList.add('liked');
              likeButton.innerHTML = '❤️';
            }
          }
        });
      }
    } catch (error) {
      console.error('Lỗi khi lấy trạng thái thích ban đầu (search page):', error);
    }
  }

  // Hàm để hiển thị sách trong phần tử chứa đã chỉ định
  function displayBooks(books, containerElement) {
    containerElement.innerHTML = ''; // Xóa nội dung cũ

    if (!Array.isArray(books) || books.length === 0) {
      containerElement.innerHTML = '<p>Không tìm thấy sách nào.</p>';
      return;
    }

    const displayedBookIds = []; // Thu thập ID sách để kiểm tra trạng thái thích

    books.forEach(book => {
      const bookCard = document.createElement('div');
      bookCard.classList.add('book-card'); // Thêm class để tạo kiểu
      
      // QUAN TRỌNG: Đảm bảo 'book' object từ API tìm kiếm có thuộc tính 'id'
      // API /search-books cần trả về trường 'id' cho mỗi cuốn sách.
      const bookIdentifier = book.id; 
      
      if (!bookIdentifier) {
          // Nếu không có ID, nút tim sẽ không được hiển thị cho sách này.
          console.warn('Sách không có thuộc tính "id" trong kết quả tìm kiếm:', book);
      } else {
        displayedBookIds.push(bookIdentifier); // Thêm vào danh sách nếu có ID hợp lệ
      }

      const imagePath = book.cover ? `images/${book.cover}.jpg` : 'images/default.jpg';
      
      // Điền dữ liệu vào thẻ sách
      bookCard.innerHTML = `
        <img src="${imagePath}" alt="${book.title}" title="${book.title}" onerror="this.onerror=null; this.src='images/default.jpg';">
        <h3>${book.title || 'Không có tiêu đề'}</h3>
        <p><strong>Tác giả:</strong> ${book.author || 'N/A'}</p>
        <p><strong>Rate:</strong> ${book.rating || 'N/A'}</p>
        ${bookIdentifier ? // Chỉ hiển thị nút tim nếu có bookIdentifier (ID sách)
          `<button class="like-button" data-book-id="${bookIdentifier}" aria-label="Thích sách này">
              🤍 </button>` : ''
        }
      `;
      containerElement.appendChild(bookCard);

      // Thêm event listener cho nút tim nếu có bookIdentifier
      if (bookIdentifier) {
        const likeButton = bookCard.querySelector('.like-button');
        if (likeButton) {
          likeButton.addEventListener('click', (event) => {
            console.count("LikeButtonClick"); // Đếm số lần listener này được kích hoạt
            console.log("Clicked button element:", likeButton); // Log chính phần tử nút được click
            event.stopPropagation(); // Ngăn sự kiện click của card (nếu có)
            handleLikeBook(bookIdentifier, likeButton); // Gọi hàm xử lý like
          });
        }
      }
    });

    // Sau khi hiển thị tất cả sách, lấy trạng thái thích ban đầu
    if (displayedBookIds.length > 0) {
      fetchAndSetInitialLikeStatus(displayedBookIds);
    }
  }

  // Hàm để thực hiện tìm kiếm sách
  async function performSearch(query) {
    if (!query) {
      searchResultsContainer.innerHTML = '<p>Vui lòng nhập tên sách vào ô tìm kiếm.</p>';
      return;
    }

    searchResultsContainer.innerHTML = '<p>Đang tìm kiếm sách...</p>';

    try {
      // Gọi API tìm kiếm sách trên cổng 7777, sử dụng tham số 'query'
      const response = await fetch(`http://localhost:7777/search-books?query=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`Lỗi HTTP! status: ${response.status}`);
      }
      const books = await response.json();
      displayBooks(books, searchResultsContainer); // Hiển thị kết quả tìm kiếm
    } catch (error) {
      console.error('Lỗi khi tìm kiếm sách:', error);
      searchResultsContainer.innerHTML = '<p>Không thể tìm kiếm sách. Vui lòng thử lại sau.</p>';
    }
  }

  // Xử lý việc gửi biểu mẫu tìm kiếm trên trang search.html
  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Ngăn chặn hành vi gửi biểu mẫu mặc định

    const query = searchInput.value.trim();
    // Cập nhật URL để phản ánh từ khóa tìm kiếm mới (tùy chọn)
    window.history.pushState({}, '', `search.html?query=${encodeURIComponent(query)}`);
    performSearch(query);
  });

  // Khi trang search.html tải, kiểm tra URL để xem có từ khóa tìm kiếm không
  const urlParams = new URLSearchParams(window.location.search);
  const initialQuery = urlParams.get('query');

  if (initialQuery) {
    searchInput.value = initialQuery; // Điền từ khóa vào ô tìm kiếm
    performSearch(initialQuery); // Thực hiện tìm kiếm ngay lập tức
  } else {
    searchResultsContainer.innerHTML = '<p>Nhập tên sách vào ô tìm kiếm để bắt đầu.</p>';
  }
});