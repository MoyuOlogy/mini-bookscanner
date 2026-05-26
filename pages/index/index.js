const storage = require('../../utils/storage')

Page({
  data: {
    bookCount: 0,
    readCount: 0,
    recentBooks: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadData()
  },

  loadData() {
    storage.getAllBooks().then((books) => {
      books.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      const readCount = books.filter(b => b.read).length
      this.setData({
        bookCount: books.length,
        readCount,
        recentBooks: books.slice(0, 5)
      })
    })
  },

  onScan() {
    wx.switchTab({ url: '/pages/scan/scan' })
  },

  onViewAll() {
    wx.switchTab({ url: '/pages/library/library' })
  },

  onAddManual() {
    wx.navigateTo({ url: '/pages/detail/detail' })
  },

  onBookTap(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  }
})
