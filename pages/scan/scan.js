const storage = require('../../utils/storage')

Page({
  data: {
    isbn: '',
    status: '等待扫描...',
    loading: false,
    manualMode: false,
    lastBook: null
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  onScanCode() {
    wx.scanCode({
      scanType: ['barCode'],
      success: (res) => {
        console.log('[scan] 扫码原始结果:', res.result)
        const raw = res.result.replace(/[-\s]/g, '')
        console.log('[scan] 清理后:', raw)
        if (/^\d{13}$/.test(raw) && (raw.startsWith('978') || raw.startsWith('979'))) {
          this.setData({ isbn: raw })
          this.processISBN(raw)
        } else if (/^\d{12}$/.test(raw) && (raw.startsWith('978') || raw.startsWith('979'))) {
          const isbn13 = raw + this.calcISBN13Check(raw)
          this.setData({ isbn: isbn13 })
          this.processISBN(isbn13)
        } else if (/^\d{10}$/.test(raw)) {
          this.setData({ isbn: raw })
          this.processISBN(raw)
        } else {
          console.log('[scan] ISBN格式无效:', raw)
          wx.showModal({
            title: '无效条码',
            content: '扫描结果「' + raw + '」不是有效的ISBN',
            showCancel: false
          })
        }
      },
      fail: (err) => {
        console.log('[scan] 扫码失败:', err)
        wx.showToast({ title: '扫码取消', icon: 'none' })
      }
    })
  },

  calcISBN13Check(digits12) {
    let sum = 0
    for (let i = 0; i < 12; i++) {
      sum += parseInt(digits12[i]) * (i % 2 === 0 ? 1 : 3)
    }
    return String((10 - (sum % 10)) % 10)
  },

  onManualInput(e) {
    this.setData({ isbn: e.detail.value })
  },

  onManualSubmit() {
    const isbn = this.data.isbn.replace(/[-\s]/g, '')
    if (!/^\d{10}(\d{3})?$/.test(isbn)) {
      wx.showToast({ title: 'ISBN格式无效', icon: 'none' })
      return
    }
    this.processISBN(isbn)
  },

  toggleManualMode() {
    this.setData({ manualMode: !this.data.manualMode })
  },

  processISBN(isbn) {
    console.log('[scan] 开始处理ISBN:', isbn)
    this.setData({ loading: true, status: '正在查询...' })
    wx.showLoading({ title: '查询中' })

    wx.cloud.callFunction({
      name: 'fetchBookInfo',
      data: { isbn },
      success: (res) => {
        console.log('[scan] 云函数返回:', res.result)
        const result = res.result
        if (result && result.errCode === 0 && result.data) {
          const book = result.data
          book.isbn = isbn
          this.saveBook(book, true)
        } else {
          console.log('[scan] 云函数未查到信息:', result)
          this.saveBook({ isbn }, false)
        }
      },
      fail: (err) => {
        console.log('[scan] 云函数调用失败:', err)
        this.saveBook({ isbn }, false)
      }
    })
  },

  saveBook(book, hasInfo) {
    console.log('[scan] 保存书籍:', book, 'hasInfo:', hasInfo)
    const defaults = {
      title: '', author: '', publisher: '', publishDate: '',
      pages: '', category: '', price: '', description: '',
      notes: '', read: false
    }
    for (const key in defaults) {
      if (!book[key]) book[key] = defaults[key]
    }

    storage.addBook(book).then((result) => {
      console.log('[scan] 保存成功:', result)
      wx.hideLoading()
      this.setData({
        loading: false,
        status: '已保存',
        lastBook: { title: book.title || book.isbn, cover: book.cover }
      })
      if (hasInfo) {
        wx.showToast({ title: '已获取信息并保存', icon: 'success' })
      } else {
        wx.showToast({ title: '未查到信息，已保存ISBN', icon: 'none' })
      }
    }).catch((err) => {
      console.error('[scan] 保存失败:', err)
      wx.hideLoading()
      this.setData({ loading: false, status: '保存失败' })
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  onViewBook() {
    if (this.data.lastBook) {
      wx.navigateTo({ url: '/pages/detail/detail?isbn=' + this.data.isbn })
    }
  }
})
