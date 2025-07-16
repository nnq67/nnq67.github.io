document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button'); // Lấy nút tìm kiếm bằng ID
  const recommendedBooksContainer = document.getElementById('recommended-books'); // Có thể đã có

    //chuyển trang từ home.html về home.html
  const siteTitle = document.getElementById('site-title');
  const userId = localStorage.getItem('user_id');
    console.log('[KHỞI ĐỘNG] User ID từ localStorage:', userId); // Log để kiểm tra

  if (siteTitle) { // Luôn kiểm tra phần tử có tồn tại không trước khi thêm listener
    siteTitle.addEventListener('click', () => {
    window.location.href = 'home.html'; // Dòng này sẽ chuyển trang
  });
}

//Làm tim 
async function handleLikeBook(bookId, likeButtonElement) {
        const userId = localStorage.getItem('user_id'); // Hoặc 'username' nếu đó là định danh chính
        const username = localStorage.getItem('username'); // Giả sử bạn cũng lưu username

        // Backend của bạn sẽ cần biết định danh người dùng.
        // Gửi user_id nếu có, nếu không thì gửi username.
        const userIdentifier = userId || username;
        if (!userIdentifier) {
            alert('Bạn cần đăng nhập để có thể thích sách!');
            // Có thể chuyển hướng đến trang đăng nhập ở đây
            // window.location.href = 'login.html';
            return;
        }

        // Xác định loại định danh để backend xử lý phù hợp
        const identifierType = userId ? 'userId' : 'username';

        console.log(`Attempting to like book: ${bookId} by user: ${userIdentifier} (type: ${identifierType})`);

        try {
            // --- GỌI API BACKEND ĐỂ TẠO QUAN HỆ NEO4J ---
            // Bạn cần tạo một endpoint ở backend (ví dụ: /api/like-book)
            // Endpoint này sẽ nhận userId/username và bookId, sau đó tạo quan hệ [:LIKES]
            const response = await fetch('http://localhost:7777/api/like-book', { // <<--- ĐÂY LÀ ENDPOINT BACKEND CỦA BẠN
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    identifier: userIdentifier,
                    identifierType: identifierType, // 'userId' hoặc 'username'
                    bookId: bookId // Đây nên là một ID duy nhất của sách (ví dụ: book.id, book.isbn)
                                   // Nếu chỉ có book.title, hãy cẩn thận vì title có thể không duy nhất
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Lỗi HTTP! Status: ${response.status}` }));
                throw new Error(errorData.message || `Lỗi HTTP! Status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Phản hồi từ server (like book):', result);

            // --- CẬP NHẬT GIAO DIỆN NÚT TIM ---
            if (likeButtonElement) {
                // Ví dụ: Thay đổi trạng thái của nút tim
                // Nếu backend trả về trạng thái "liked" hoặc "unliked" thì tốt hơn
                if (result.status === 'liked') {
                    likeButtonElement.classList.add('liked');
                    likeButtonElement.innerHTML = '❤️'; // Tim đỏ (đã thích)
                } else if (result.status === 'unliked') {
                    likeButtonElement.classList.remove('liked');
                    likeButtonElement.innerHTML = '🤍'; // Tim trắng (chưa thích/bỏ thích)
                } else {
                    // Hoặc đơn giản là toggle nếu backend không trả về trạng thái cụ thể
                    likeButtonElement.classList.toggle('liked');
                    if (likeButtonElement.classList.contains('liked')) {
                        likeButtonElement.innerHTML = '❤️';
                    } else {
                        likeButtonElement.innerHTML = '🤍';
                    }
                }
            }
            // (Tùy chọn) Có thể gọi lại fetchRecommendedBooks hoặc hàm cập nhật UI khác nếu cần

        } catch (error) {
            console.error('Lỗi khi thực hiện hành động thích sách:', error);
            alert('Đã xảy ra lỗi: ' + error.message);
        }
    }
// END LÀM TIM


  // Các hàm khác của trang chủ (displayBooks, fetchRecommendedBooks) ở đây
  // ... (giữ nguyên nếu bạn đã có)
 // Hàm tạo một thẻ sách (book card) - có thể bạn đã có hàm tương tự, giờ nó được cải tiến
    function createBookCard(book, allBookIdsSet) { // allBookIdsSet là Set để thu thập ID sách
        const bookCard = document.createElement('div');
        bookCard.classList.add('book-card');

        const apiRatingValue = book.rating;
        const displayRating = (apiRatingValue !== undefined && apiRatingValue !== null && apiRatingValue !== 'N/A' && !isNaN(parseFloat(apiRatingValue)))
                          ? parseFloat(apiRatingValue).toFixed(1)
                          : 'N/A';

        const bookIdentifier = book.id;
        if (bookIdentifier && allBookIdsSet) {
            allBookIdsSet.add(bookIdentifier);
        }

        const imagePath = (book.cover && book.cover !== 'N/A' && !book.cover.toLowerCase().includes('default')) ? `images/${book.cover}.jpg` : 'images/default.jpg';
        const title = book.title || 'Không có tiêu đề';
        const author = book.author || 'N/A';
        const category = book.category || 'N/A';
        const rating = (book.rating !== undefined && book.rating !== null && book.rating !== 'N/A') ? parseFloat(book.rating).toFixed(1) : 'N/A';

        let extraInfo = '';
        if (book.likeCount !== undefined && book.likeCount !== null) {
            extraInfo += `<p><strong>Lượt thích:</strong> ${book.likeCount}</p>`;
        }
      
        bookCard.innerHTML = `
            <img src="${imagePath}" alt="${title}" title="${title}" onerror="this.onerror=null; this.src='images/default.jpg';">
            <h3>${title}</h3>
            <p><strong>Tác giả:</strong> ${author}</p>
            <p><strong>Thể loại:</strong> ${category}</p>
            <p><strong>Rate:</strong> ${displayRating}</p>
            ${extraInfo}
            ${bookIdentifier && userId ?
              `<button class="like-button" data-book-id="${bookIdentifier}" aria-label="Thích ${title}">
                  🤍
              </button>` : ''
            }
        `;

        if (bookIdentifier && userId) {
            const likeButton = bookCard.querySelector('.like-button');
            if (likeButton) {
                likeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    handleLikeBook(bookIdentifier, likeButton);
                });
            }
        }
        return bookCard;
    }

    function createBookCard1(book, allBookIdsSet) { // allBookIdsSet là Set để thu thập ID sách
      console.log('Dữ liệu sách nhận được trong createBookCard1:', JSON.stringify(book, null, 2));//ktra
        const bookCard = document.createElement('div');
        bookCard.classList.add('book-card');

        const apiRatingValue = book.rating;
        const displayRating = (apiRatingValue !== undefined && apiRatingValue !== null && apiRatingValue !== 'N/A' && !isNaN(parseFloat(apiRatingValue)))
                          ? parseFloat(apiRatingValue).toFixed(1)
                          : 'N/A';

        const bookIdentifier = book.id;
        if (bookIdentifier && allBookIdsSet) {
            allBookIdsSet.add(bookIdentifier);
        }

        const imagePath = (book.cover && book.cover !== 'N/A' && !book.cover.toLowerCase().includes('default')) ? `images/${book.cover}.jpg` : 'images/default.jpg';
        const title = book.title || 'Không có tiêu đề';
        const category = book.category || 'N/A';
        const rating = (book.rating !== undefined && book.rating !== null && book.rating !== 'N/A') ? parseFloat(book.rating).toFixed(1) : 'N/A';

        let extraInfo = '';
        if (book.likeCount !== undefined && book.likeCount !== null) {
            extraInfo += `<p><strong>Lượt thích:</strong> ${book.likeCount}</p>`;
        }
       /* if (book.averageRating !== undefined && book.averageRating !== null) {
            const avgRatingVal = (typeof book.averageRating === 'number') ? book.averageRating.toFixed(2) : book.averageRating;
            extraInfo += `<p><strong>Điểm TB:</strong> ${avgRatingVal}</p>`;
        }*/

        bookCard.innerHTML = `
            <img src="${imagePath}" alt="${title}" title="${title}" onerror="this.onerror=null; this.src='images/default.jpg';">
            <h3>${title}</h3>
            <p><strong>Thể loại:</strong> ${category}</p>
            <p><strong>Rate:</strong> ${displayRating}</p>
            ${extraInfo}
            ${bookIdentifier && userId ?
              `<button class="like-button" data-book-id="${bookIdentifier}" aria-label="Thích ${title}">
                  🤍
              </button>` : ''
            }
        `;

        if (bookIdentifier && userId) {
            const likeButton = bookCard.querySelector('.like-button');
            if (likeButton) {
                likeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    handleLikeBook(bookIdentifier, likeButton);
                });
            }
        }
        return bookCard;
    }

    // Hàm tạo thẻ cho tác giả và sách nổi bật của họ (MỚI)
    function createAuthorCard(authorItem, allBookIdsSet) {
        const authorCardWrapper = document.createElement('div');
        authorCardWrapper.classList.add('book-card', 'author-feature-card'); // Có thể dùng class book-card hoặc class riêng

        const authorName = authorItem.authorName || 'N/A';
        const authorAvgScore = (authorItem.authorAvgScore !== undefined && authorItem.authorAvgScore !== null && authorItem.authorAvgScore !== 'N/A') ? parseFloat(authorItem.authorAvgScore).toFixed(2) : 'N/A';

        authorCardWrapper.innerHTML = `
            <div class="author-info-header" style="text-align:center; margin-bottom:10px;">
                <h4>Tác giả: ${authorName}</h4>
                <p>Điểm TB Sách: ${authorAvgScore}</p>
            </div>
            <p style="text-align:center; font-weight:bold;">Sách nổi bật:</p>
        `;

        if (authorItem.topBook && authorItem.topBook.id) {
            const topBookCard = createBookCard1(authorItem.topBook, allBookIdsSet);
            authorCardWrapper.appendChild(topBookCard);
        } else {
            authorCardWrapper.innerHTML += '<p>Chưa có thông tin sách nổi bật.</p>';
        }
        return authorCardWrapper;
    }

    

    // Hàm chính để lấy và hiển thị tất cả các mục gợi ý từ /home-sections (MỚI)
    async function fetchAndDisplayHomeSections() {
        if (!recommendedBooksContainer) { // Sử dụng biến đã đổi tên
            console.error('Không tìm thấy container #recommended-books.');
            return;
        }
        recommendedBooksContainer.innerHTML = '<p style="text-align: center;">Đang tải các mục gợi ý...</p>';

        try {
            let apiUrl = 'http://localhost:7777/home-sections'; // Endpoint mới
            if (userId) {
                apiUrl += `?user_id=${encodeURIComponent(userId)}`;
            }

            const response = await fetch(apiUrl);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Lỗi HTTP! Status: ${response.status}` }));
                throw new Error(errorData.message || `Lỗi HTTP! Status: ${response.status}`);
            }
            const sectionsData = await response.json();
            console.log('Dữ liệu sectionsData NHẬN ĐƯỢC ở frontend:', JSON.stringify(sectionsData, null, 2));

            recommendedBooksContainer.innerHTML = ''; // Xóa thông báo "Đang tải..."

            const sectionDisplayTitles = { // Tiêu đề cho từng mục
                byLikedCategory: "Gợi ý sách dựa trên thể loại yêu thích",
                byLikedAuthor: "Gợi ý sách theo tác giả yêu thích",
                topRatedUninteracted: "Gợi ý sách có điểm đánh giá cao từ 4.2 điểm trở lên",
                topAuthorsAndBooks: "Gợi ý sách dựa trên các tác giả phổ biến"
            };
            const allBookIdsDisplayed = new Set(); // Set để chứa các ID sách đã hiển thị

            for (const sectionKey in sectionsData) {
                const sectionTitleText = sectionDisplayTitles[sectionKey] || sectionKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                const itemsInSection = sectionsData[sectionKey]; // Đổi tên biến cho rõ ràng
                console.log(`Section: ${sectionKey}, Số lượng items: ${Array.isArray(itemsInSection) ? itemsInSection.length : 'Không phải mảng'}`);

                let shouldDisplaySection = (Array.isArray(itemsInSection) && itemsInSection.length > 0);
                if (!userId && (sectionKey === 'byLikedCategory' || sectionKey === 'byLikedAuthor')) {
                    shouldDisplaySection = true; 
                }

                if (shouldDisplaySection) {
                    const sectionWrapper = document.createElement('div');
                    sectionWrapper.classList.add('recommendation-section-wrapper');
                    sectionWrapper.style.marginBottom = '40px';

                    const titleElement = document.createElement('h2');
                    titleElement.classList.add('section-title');
                    titleElement.style.textAlign = 'center';
                    titleElement.style.marginBottom = '20px';
                    titleElement.textContent = sectionTitleText;
                    sectionWrapper.appendChild(titleElement);

                    const bookGridElement = document.createElement('div');
                    bookGridElement.classList.add('book-grid');

                    if (Array.isArray(itemsInSection) && itemsInSection.length > 0) {
                        if (sectionKey === 'topAuthorsAndBooks') {
                            itemsInSection.forEach(authorItem => { // itemsInSection giờ là mảng các authorItem
                                const authorCard = createAuthorCard(authorItem, allBookIdsDisplayed);
                                bookGridElement.appendChild(authorCard);
                            });
                        } else {
                            itemsInSection.forEach(book => { // itemsInSection là mảng các book
                                const bookCard = createBookCard(book, allBookIdsDisplayed);
                                bookGridElement.appendChild(bookCard);
                            });
                        }
                    } else if (!userId && (sectionKey === 'byLikedCategory' || sectionKey === 'byLikedAuthor')) {
                        bookGridElement.innerHTML = '<p style="text-align:center;">Đăng nhập để xem gợi ý cá nhân hóa cho mục này.</p>';
                    } else {
                         bookGridElement.innerHTML = '<p style="text-align:center;">Hiện chưa có gợi ý nào cho mục này.</p>';
                    }
                    sectionWrapper.appendChild(bookGridElement);
                    recommendedBooksContainer.appendChild(sectionWrapper);
                }
            }

            if (allBookIdsDisplayed.size > 0 && userId) {
                fetchAndSetInitialLikeStatus(Array.from(allBookIdsDisplayed));
            }

        } catch (error) {
            console.error('Lỗi khi tải và hiển thị các mục gợi ý:', error);
            recommendedBooksContainer.innerHTML = '<p style="text-align: center;">Không thể hiển thị gợi ý. Vui lòng thử lại sau.</p>';
        }
    }

  // KẾT THÚC CÁC HÀM KHÁC

      // --- HÀM LẤY VÀ CÀI ĐẶT TRẠNG THÁI THÍCH BAN ĐẦU ---
    async function fetchAndSetInitialLikeStatus(bookIds) {
        const username = localStorage.getItem('username');
        const userId = localStorage.getItem('user_id');
        const userIdentifier = userId || username;

        if (!userIdentifier || !Array.isArray(bookIds) || bookIds.length === 0) {
            return;
        }
        const identifierType = userId ? 'userId' : 'username';

        try {
            // Bạn cần tạo endpoint này ở backend, ví dụ: /api/get-user-liked-books
            // Nó sẽ trả về một mảng các bookId mà người dùng đã thích
            const response = await fetch(`http://localhost:7777/api/get-user-liked-books?identifier=${encodeURIComponent(userIdentifier)}&identifierType=${identifierType}`);
            if (!response.ok) {
                console.error('Không thể lấy trạng thái thích của sách.');
                return;
            }
            const likedBookIds = await response.json(); // Giả sử backend trả về { likedBookIds: [...] }

            if (Array.isArray(likedBookIds.likedBookIds)) {
                bookIds.forEach(bookId => {
                    const likeButton = document.querySelector(`.like-button[data-book-id="${bookId}"]`);
                    if (likeButton && likedBookIds.likedBookIds.includes(bookId)) {
                        likeButton.classList.add('liked');
                        likeButton.innerHTML = '❤️';
                    }
                });
            }
        } catch (error) {
            console.error('Lỗi khi lấy trạng thái thích ban đầu:', error);
        }
    }

  // THÊM LOGIC CHUYỂN HƯỚNG KHI NHẤN NÚT TÌM
  searchButton.addEventListener('click', () => {
    const query = searchInput.value.trim();
    // Chuyển hướng đến search.html và truyền từ khóa tìm kiếm qua URL parameter 'query'
    window.location.href = `search.html?query=${encodeURIComponent(query)}`;
    
    
  });

  // Gọi hàm để tải sách đề xuất khi trang tải
  if (recommendedBooksContainer) { // Chỉ gọi nếu container tồn tại
      fetchAndDisplayHomeSections();
    } else {
      console.error("Không tìm thấy phần tử #recommended-books để hiển thị gợi ý.");
    }
});
