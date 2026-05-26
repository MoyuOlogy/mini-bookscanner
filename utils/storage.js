const BOOKS_KEY = 'books'
const PAGE_SIZE = 50
const BOOK_COVERS = [
  '/images/book-cover-01.svg',
  '/images/book-cover-02.svg',
  '/images/book-cover-03.svg',
  '/images/book-cover-04.svg',
  '/images/book-cover-05.svg',
  '/images/book-cover-06.svg',
  '/images/book-cover-07.svg',
  '/images/book-cover-08.svg',
  '/images/book-cover-09.svg',
  '/images/book-cover-10.svg',
]

let coverIndex = Math.floor(Math.random() * BOOK_COVERS.length)

function randomCover() {
  coverIndex = (coverIndex + 1) % BOOK_COVERS.length
  return BOOK_COVERS[coverIndex]
}

let useCloud = false
let booksCol = null
let openid = null
let openidFetched = false

function ensureCloud() {
  if (useCloud && booksCol) return true
  if (!wx.cloud) return false
  try {
    const db = wx.cloud.database()
    booksCol = db.collection('books')
    useCloud = true
    return true
  } catch (e) {
    useCloud = false
    return false
  }
}

function ensureCloudAsync() {
  if (useCloud && booksCol) return Promise.resolve(true)
  if (!wx.cloud) return Promise.resolve(false)
  return new Promise((resolve) => {
    let attempts = 0
    const tryInit = () => {
      attempts++
      try {
        const db = wx.cloud.database()
        booksCol = db.collection('books')
        useCloud = true
        resolve(true)
      } catch (e) {
        if (attempts < 10) {
          setTimeout(tryInit, 300)
        } else {
          useCloud = false
          resolve(false)
        }
      }
    }
    tryInit()
  })
}

function getOpenid() {
  if (openidFetched) return Promise.resolve(openid || 'local')

  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      openid = 'local'
      openidFetched = true
      return openid
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        openid = openid || 'local'
        openidFetched = true
        resolve(openid)
      }, 5000)

      wx.cloud.callFunction({
        name: 'getOpenid',
        success: (res) => {
          clearTimeout(timer)
          openid = (res.result && res.result.openid) || 'local'
          openidFetched = true
          resolve(openid)
        },
        fail: () => {
          clearTimeout(timer)
          openid = 'local'
          openidFetched = true
          resolve(openid)
        }
      })
    })
  })
}

function validateBook(book) {
  if (!book || typeof book !== 'object') return false
  const title = (book.title || '').trim()
  const isbn = (book.isbn || '').trim()
  if (!title && !isbn) return false
  if (isbn && !/^\d{10}(\d{3})?$/.test(isbn)) return false
  return true
}

function getBooks(page) {
  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      return wx.getStorageSync(BOOKS_KEY) || []
    }
    const pageNum = page || 0
    return getOpenid().then((uid) => {
      return booksCol
        .where({ _openid: uid })
        .orderBy('createdAt', 'desc')
        .skip(pageNum * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get()
        .then((res) => res.data)
        .catch(() => wx.getStorageSync(BOOKS_KEY) || [])
    })
  })
}

function getAllBooks() {
  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      return wx.getStorageSync(BOOKS_KEY) || []
    }
    return getOpenid().then((uid) => {
      return booksCol
        .where({ _openid: uid })
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get()
        .then((res) => res.data)
        .catch(() => wx.getStorageSync(BOOKS_KEY) || [])
    })
  })
}

function buildCloudData(book) {
  const data = {}
  const fields = ['isbn', 'title', 'author', 'publisher', 'publishDate', 'pages', 'category', 'price', 'cover', 'read', 'readAt', 'description', 'notes', 'createdAt', 'updatedAt']
  for (const k of fields) {
    if (book[k] !== undefined) {
      data[k] = book[k]
    }
  }
  return data
}

function addBook(book) {
  if (!validateBook(book)) {
    return Promise.reject(new Error('书籍数据无效'))
  }

  const now = Date.now()
  book.updatedAt = now

  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      return addBookLocal(book, now)
    }

    return getOpenid().then((uid) => {
      if (book._id) {
        const id = book._id
        const data = buildCloudData(book)
        data.updatedAt = now
        return booksCol.doc(id).update({ data })
          .then(() => {
            book._id = id
            addBookLocal(book, now)
            return book
          })
          .catch((e) => {
            console.error('[storage] 云端更新失败:', e)
            return addBookLocal(book, now)
          })
      }

      book._openid = uid
      book.createdAt = now
      if (!book.cover) book.cover = randomCover()
      const data = buildCloudData(book)

      return booksCol.where({ isbn: book.isbn, _openid: uid }).get()
        .then((res) => {
          if (res.data.length > 0) {
            const existing = res.data[0]
            if (!data.cover && existing.cover) data.cover = existing.cover
            if (!data.cover) data.cover = randomCover()
            data.updatedAt = now
            return booksCol.doc(existing._id).update({ data })
              .then(() => {
                book._id = existing._id
                addBookLocal(book, now)
                return book
              })
          }
          return booksCol.add({ data })
            .then((res) => {
              book._id = res._id
              addBookLocal(book, now)
              return book
            })
        })
        .catch((e) => {
          console.error('[storage] 云端操作失败:', e)
          return addBookLocal(book, now)
        })
    })
  })
}

function addBookLocal(book, now) {
  const books = wx.getStorageSync(BOOKS_KEY) || []
  const existingIdx = books.findIndex((b) => {
    if (book._id && b._id === book._id) return true
    if (book.id && b.id === book.id) return true
    if (book.isbn && b.isbn === book.isbn) return true
    return false
  })
  if (existingIdx !== -1) {
    const existing = books[existingIdx]
    for (const k in book) {
      if (k === '_openid') continue
      const v = book[k]
      if (v !== undefined && v !== '' && v !== null) {
        existing[k] = v
      } else if (k === 'read' || k === 'readAt') {
        existing[k] = v
      }
    }
    existing.updatedAt = now
    books[existingIdx] = existing
  } else {
    book.id = book.id || book._id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    if (!book.cover) book.cover = randomCover()
    book.createdAt = now
    book.updatedAt = now
    books.unshift(book)
  }
  wx.setStorageSync(BOOKS_KEY, books)
  return book
}

function deleteBook(id) {
  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      return deleteBookLocal(id)
    }
    return booksCol.doc(id).remove()
      .then(() => deleteBookLocal(id))
      .catch(() => deleteBookLocal(id))
  })
}

function deleteBookLocal(id) {
  const books = wx.getStorageSync(BOOKS_KEY) || []
  const filtered = books.filter((b) => b.id !== id && b._id !== id)
  wx.setStorageSync(BOOKS_KEY, filtered)
  return filtered
}

function updateReadStatus(id, read) {
  const now = Date.now()
  return ensureCloudAsync().then((ok) => {
    if (!ok) {
      return updateReadStatusLocal(id, read, now)
    }
    return booksCol.doc(id).update({
      data: { read: !!read, readAt: read ? now : null, updatedAt: now }
    }).then(() => {
      updateReadStatusLocal(id, read, now)
    }).catch(() => updateReadStatusLocal(id, read, now))
  })
}

function updateReadStatusLocal(id, read, now) {
  const books = wx.getStorageSync(BOOKS_KEY) || []
  const book = books.find((b) => b._id === id || b.id === id)
  if (book) {
    book.read = !!read
    book.readAt = read ? now : null
    book.updatedAt = now
    wx.setStorageSync(BOOKS_KEY, books)
  }
  return book
}

module.exports = {
  getBooks,
  getAllBooks,
  addBook,
  deleteBook,
  updateReadStatus,
  validateBook
}
