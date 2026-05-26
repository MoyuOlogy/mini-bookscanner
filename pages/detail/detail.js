const storage = require('../../utils/storage')

Page({
  data: {
    id: '',
    isbn: '',
    title: '',
    author: '',
    publisher: '',
    publishDate: '',
    pages: '',
    category: '',
    price: '',
    description: '',
    notes: '',
    cover: '',
    read: false,
    isEdit: false,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.loadBook(options.id)
    } else if (options.isbn) {
      this.setData({ isbn: options.isbn })
    } else if (options.data) {
      try {
        const info = JSON.parse(decodeURIComponent(options.data))
        this.setData({
          isbn: options.isbn || info.isbn || '',
          title: info.title || '',
          author: info.author || '',
          publisher: info.publisher || '',
          publishDate: info.publishDate || '',
          pages: info.pages ? String(info.pages) : '',
          category: info.category || '',
          cover: info.cover || '',
          description: info.description || ''
        })
      } catch (e) {
        if (options.isbn) {
          this.setData({ isbn: options.isbn })
        }
      }
    }
  },

  loadBook(id) {
    storage.getBooks().then((books) => {
      const book = books.find((b) => b._id === id || b.id === id)
      if (book) {
        this.setData({
          isEdit: true,
          id: book._id || book.id,
          isbn: book.isbn || '',
          title: book.title || '',
          author: book.author || '',
          publisher: book.publisher || '',
          publishDate: book.publishDate || '',
          pages: book.pages ? String(book.pages) : '',
          category: book.category || '',
          price: book.price || '',
          cover: book.cover || '',
          read: book.read || false,
          description: book.description || '',
          notes: book.notes || ''
        })
        wx.setNavigationBarTitle({ title: book.title || '书籍详情' })
      }
    })
  },

  onInputChange(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  onToggleRead() {
    const newRead = !this.data.read
    this.setData({ read: newRead })
    this._readChanged = true

    if (this.data.id) {
      storage.updateReadStatus(this.data.id, newRead).then(() => {
        wx.showToast({ title: newRead ? '已标记已读' : '已标记未读', icon: 'success' })
      })
    }
  },

  onChooseCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath
        this.setData({ cover: tempFilePath })
      }
    })
  },

  onRemoveCover() {
    this.setData({ cover: '' })
  },

  onSave() {
    const title = this.data.title.trim()
    const isbn = this.data.isbn.trim()

    if (!title && !isbn) {
      wx.showToast({ title: '书名或ISBN至少填一项', icon: 'none' })
      return
    }

    const book = {
      isbn,
      title,
      author: this.data.author.trim(),
      publisher: this.data.publisher.trim(),
      publishDate: this.data.publishDate.trim(),
      pages: this.data.pages.trim(),
      category: this.data.category.trim(),
      price: this.data.price.trim(),
      cover: this.data.cover,
      read: this.data.read,
      description: this.data.description.trim(),
      notes: this.data.notes.trim()
    }

    if (this.data.id) {
      book._id = this.data.id
      book.id = this.data.id
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '保存中' })

    const uploadPromise = this.data.cover && this.data.cover.startsWith('wxfile://')
      ? this.uploadCover(this.data.cover)
      : Promise.resolve(this.data.cover)

    uploadPromise.then((coverUrl) => {
      book.cover = coverUrl || book.cover
      return storage.addBook(book)
    }).then(() => {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({
        title: this.data.isEdit ? '已更新' : '已保存',
        icon: 'success'
      })
      setTimeout(() => wx.navigateBack(), 1500)
    }).catch(() => {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  uploadCover(filePath) {
    return new Promise((resolve) => {
      const cloudPath = `covers/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: (res) => resolve(res.fileID),
        fail: () => resolve('')
      })
    })
  },

  onCancel() {
    wx.navigateBack()
  },

  onUnload() {
    if (this.data.id && this._readChanged) {
      storage.updateReadStatus(this.data.id, this.data.read)
    }
  }
})
