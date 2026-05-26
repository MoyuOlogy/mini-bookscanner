# 📚 书籍录入小程序

基于微信小程序 + 腾讯云开发（CloudBase）的书籍条形码扫描录入系统。

![WeChat Mini Program](https://img.shields.io/badge/WeChat-Mini%20Program-07C160)
![CloudBase](https://img.shields.io/badge/CloudBase-云开发-blue)

## 功能

- **扫码录入** — 扫描 ISBN 条形码，自动查询书籍信息
- **多源查询** — 读书网 → 豆瓣 → Google Books，逐级兜底
- **云数据库存储** — 数据存储在腾讯云开发数据库，支持多设备同步
- **用户隔离** — 每个用户独立的数据空间，基于微信 openid 自动隔离
- **书籍封面** — 10 种随机颜色封面，支持手动上传自定义封面
- **阅读状态** — 支持标记已读/未读，首页统计阅读数
- **手动编辑** — 支持手动填写/编辑书籍详细信息
- **搜索** — 按书名、作者、ISBN、出版社、分类搜索
- **下拉刷新** — 书库页面支持下拉刷新数据
- **导入/导出** — JSON 格式数据导入导出

## 数据源优先级

| 优先级 | 数据源 | 说明 |
|--------|--------|------|
| 1 | 读书网 (dushu.com) | 国内中文书籍，反爬宽松 |
| 2 | 豆瓣 (douban.com) | 中文书籍丰富，反爬较严 |
| 3 | Google Books | 国际书籍，需外网访问 |

## 项目结构

```
book-scanner（mini program）/
├── app.js                    # 小程序入口，云开发初始化
├── app.json                  # 小程序配置
├── app.wxss                  # 全局样式（CSS 变量）
├── project.config.json       # 项目配置
├── sitemap.json              # 站点地图
├── cloud/
│   ├── fetchBookInfo/        # 云函数：ISBN 查询
│   │   ├── index.js
│   │   └── package.json
│   └── getOpenid/            # 云函数：获取用户 openid
│       ├── index.js
│       └── package.json
├── pages/
│   ├── index/                # 首页（统计 + 快捷入口）
│   ├── library/              # 书库（列表 + 搜索 + 阅读状态）
│   ├── scan/                 # 扫码页（条形码扫描）
│   └── detail/               # 详情页（编辑 + 封面上传）
├── custom-tab-bar/           # 自定义底部导航栏
├── utils/
│   ├── storage.js            # 数据存储层（云数据库 + 本地降级）
│   └── util.js               # 工具函数
└── images/                   # 图标资源（SVG）
```

## 环境要求

- 微信开发者工具
- 基础库 2.19.4+
- 腾讯云开发环境

## 配置步骤

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd "book-scanner（mini program）"
```

### 2. 配置小程序

在微信开发者工具中打开项目，修改以下配置：

**`project.config.json`** — 替换 `appid`：

```json
{
  "appid": "你的小程序 appid"
}
```

**`app.js`** — 替换云开发环境 ID：

```js
wx.cloud.init({
  env: '你的云开发环境 ID',
  traceUser: true
})
```

### 3. 创建云开发数据库

在云开发控制台创建 `books` 集合，权限设置为「仅创建者可读写」。

### 4. 部署云函数

在微信开发者工具中，右键点击以下云函数目录，选择「上传并部署：云端安装依赖」：

- `cloud/fetchBookInfo` — ISBN 查询
- `cloud/getOpenid` — 获取用户 openid

## 使用方式

1. 打开小程序，进入「扫码」页面
2. 点击扫描图标，扫描书籍 ISBN 条形码
3. 系统自动查询并填充书籍信息
4. 确认或修改信息后点击「保存」
5. 在「书库」页面查看所有已录入书籍

## 技术架构

```
┌─────────────────────────────────────────────────┐
│  微信小程序前端                                   │
│  ├── pages/index      首页统计                   │
│  ├── pages/scan       扫码 + ISBN 查询           │
│  ├── pages/library    书库列表 + 搜索            │
│  └── pages/detail     详情编辑 + 封面上传        │
└──────────────────────┬──────────────────────────┘
                       │ wx.cloud.callFunction
                       ▼
┌─────────────────────────────────────────────────┐
│  云函数                                           │
│  ├── fetchBookInfo    多源 ISBN 查询             │
│  └── getOpenid        用户身份获取               │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  云数据库 (books 集合)                            │
│  └── 按 _openid 隔离的书籍数据                    │
└─────────────────────────────────────────────────┘
```

## 开发说明

### 存储层设计

`utils/storage.js` 实现了混合存储策略：
- 优先使用云数据库（带用户隔离）
- 云不可用时自动降级到本地 `wx.setStorageSync`
- 支持分页加载、数据校验、阅读状态管理

### 云函数设计

`cloud/fetchBookInfo` 实现了多源查询 fallback：
1. 读书网（dushu.com）— 解析搜索页 + 详情页
2. 豆瓣（douban.com）— HTML 爬虫解析
3. Google Books — REST API 查询

每个源都有超时控制（8秒）和重试机制（2次）。

## 致谢

本项目开发过程中借助了 [CloudBase AI Agent Skills](https://github.com/tencentcloudbase/skills) 进行代码生成与优化，包括：
- 小程序开发最佳实践
- 云函数开发规范
- 云数据库操作模式
- 用户认证与数据隔离方案

## License

MIT
