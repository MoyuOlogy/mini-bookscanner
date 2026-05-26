Component({
  data: {
    selected: 0
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset
      wx.switchTab({
        url: data.path
      })
    }
  }
})
