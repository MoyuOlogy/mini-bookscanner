const storage = require('../../utils/storage')

let searchTimer = null

Page({
  data: {
    books: [],
    filteredBooks: [],
    searchKey: '',
    bookCount: 0,
    readCount: 0,
    loading: false,
    refreshing: false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.loadBooks()
  },

  loadBooks() {
    this.setData({ loading: true })
    storage.getAllBooks().then((books) => {
      books.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      const readCount = books.filter(b => b.read).length
      this.setData({
        books,
        bookCount: books.length,
        readCount,
        loading: false,
        refreshing: false
      })
      this.filterBooks()
    }).catch(() => {
      this.setData({ loading: false, refreshing: false })
    })
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadBooks()
    wx.stopPullDownRefresh()
  },

  filterBooks() {
    const { books, searchKey } = this.data
    if (!searchKey) {
      this.setData({ filteredBooks: books })
      return
    }
    const q = searchKey.toLowerCase()
    const filtered = books.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.isbn || '').toLowerCase().includes(q) ||
      (b.publisher || '').toLowerCase().includes(q) ||
      (b.category || '').toLowerCase().includes(q)
    )
    this.setData({ filteredBooks: filtered })
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value })
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => this.filterBooks(), 300)
  },

  onClearSearch() {
    this.setData({ searchKey: '' })
    this.filterBooks()
  },

  onBookTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },

  onToggleRead(e) {
    const id = e.currentTarget.dataset.id
    const read = e.currentTarget.dataset.read
    storage.updateReadStatus(id, !read).then(() => {
      this.loadBooks()
    })
  },

  onDeleteBook(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这本书吗？此操作不可撤销。',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          storage.deleteBook(id).then(() => {
            this.loadBooks()
            wx.showToast({ title: '已删除', icon: 'success' })
          })
        }
      }
    })
  },

  onExport() {
    storage.getAllBooks().then((books) => {
      if (!books.length) {
        wx.showToast({ title: '暂无数据', icon: 'none' })
        return
      }
      wx.setClipboardData({
        data: JSON.stringify(books, null, 2),
        success() {
          wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
        }
      })
    })
  },

  onImport() {
    wx.showModal({
      title: '导入数据',
      content: '请先将JSON数据复制到剪贴板，然后点击确定导入',
      success: (res) => {
        if (res.confirm) {
          wx.getClipboardData({
            success: (clipRes) => {
              try {
                const data = JSON.parse(clipRes.data)
                if (!Array.isArray(data)) throw new Error('格式错误')
                let count = 0
                const tasks = data
                  .filter(book => book.title || book.isbn)
                  .map(book => {
                    count++
                    return storage.addBook(book)
                  })
                Promise.all(tasks).then(() => {
                  wx.showToast({ title: `导入${count}本书`, icon: 'success' })
                  this.loadBooks()
                })
              } catch (err) {
                wx.showToast({ title: '导入失败: 数据格式错误', icon: 'none' })
              }
            }
          })
        }
      }
    })
  }
})
