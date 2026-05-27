const cloud = require('wx-server-sdk')
const fetch = require('node-fetch')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const TIMEOUT = 8000
const MAX_RETRIES = 2

const DUSHU_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

const DOUBAN_HEADERS = {
  ...DUSHU_HEADERS,
  'Referer': 'https://book.douban.com/',
}

function extract(text, pattern) {
  const m = text.match(pattern)
  return m ? m[1].trim() : ''
}

async function fetchWithTimeout(url, options = {}) {
  const { timeout = TIMEOUT, retries = MAX_RETRIES, ...fetchOptions } = options
  let lastError
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await Promise.race([
        fetch(url, fetchOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), timeout))
      ])
      return resp
    } catch (e) {
      lastError = e
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastError
}

async function fetchFromDushu(isbn) {
  const searchResp = await fetchWithTimeout(
    `https://www.dushu.com/search.aspx?qd=${isbn}`,
    { headers: DUSHU_HEADERS }
  )
  const searchHtml = await searchResp.text()

  if (searchHtml.includes('没有找到') || searchHtml.includes('未找到')) {
    throw new Error('未找到')
  }

  const resultSection = searchHtml.match(/<div class="result-list">([\s\S]*?)<\/div>/)
  const searchArea = resultSection ? resultSection[1] : searchHtml

  const bookIdMatch = searchArea.match(/href="\/book\/(\d+)\//)
  if (!bookIdMatch) throw new Error('未找到')

  const detailResp = await fetchWithTimeout(
    `https://www.dushu.com/book/${bookIdMatch[1]}/`,
    { headers: DUSHU_HEADERS }
  )
  const html = await detailResp.text()

  const titleMatch = html.match(/<div class="book-title"><h1>([^<]+)<\/h1>/)
  const title = titleMatch ? titleMatch[1].trim() : ''

  const authorMatch = html.match(/作\s*者[：:]<\/td>\s*<td>([^<]+)<\/td>/)
  const author = authorMatch ? authorMatch[1].trim() : ''

  const pubMatch = html.match(/出版社[：:]<\/td>\s*<td>([^<]+)<\/td>/)
  const publisher = pubMatch ? pubMatch[1].trim() : ''

  const dateMatch = html.match(/出版时间[：:]<\/td>\s*<td[^>]*>([^<]+)<\/td>/)
  const publishDate = dateMatch ? dateMatch[1].trim() : ''

  const priceMatch = html.match(/定\s*价[：:]\s*<span[^>]*>[¥￥]?([\d.]+)/)
  const price = priceMatch ? priceMatch[1] : ''

  const pagesMatch = html.match(/页\s*数[：:]<\/td>\s*<td[^>]*>(\d+)/)
  const pages = pagesMatch ? pagesMatch[1] : ''

  let description = ''
  const descMatch = html.match(/<div class="text txtsummary">([\s\S]*?)<\/div>/)
  if (descMatch) {
    description = descMatch[1].replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/\s+/g, ' ').trim()
  }

  let cover = ''
  const coverMatch = html.match(/<img[^>]*src="(https:\/\/img\.dushu\.com\/[^"]+\.jpg)"/)
  if (coverMatch) {
    cover = coverMatch[1]
  }

  let category = ''
  const crumbsMatch = html.match(/当前位置[：:]\s*([\s\S]*?)<span/)
  if (crumbsMatch) {
    const crumbs = crumbsMatch[1].replace(/<[^>]+>/g, '').split(/\s*[>|]\s*/)
    if (crumbs.length > 2) {
      category = crumbs.slice(1, -1).filter(c => c && c !== '首页' && c !== '出版图书').join(', ')
    }
  }

  if (!title) throw new Error('未获取到书名')

  return { title, author, publisher, publishDate, pages, price, category, description, cover: '', source: 'dushu' }
}

async function searchDouban(isbn) {
  const url = 'https://search.douban.com/book/subject_search?search_text=' + isbn + '&cat=1001'
  const resp = await fetchWithTimeout(url, { headers: DOUBAN_HEADERS })
  const html = await resp.text()
  const match = html.match(/https:\/\/book\.douban\.com\/subject\/(\d+)/)
  return match ? match[0] : null
}

async function fetchDoubanDetail(url) {
  const resp = await fetchWithTimeout(url, { headers: DOUBAN_HEADERS })
  const html = await resp.text()

  let title = ''
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  if (h1Match) {
    const spanMatch = h1Match[1].match(/<span[^>]*>([\s\S]*?)<\/span>/)
    title = (spanMatch ? spanMatch[1] : h1Match[1]).replace(/<[^>]+>/g, '').trim()
  }

  const infoMatch = html.match(/<div id="info"[^>]*>([\s\S]*?)<\/div>/)
  const infoText = infoMatch ? infoMatch[1].replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#?\w+;/g, '') : ''

  let author = ''
  const authorLinks = infoMatch ? infoMatch[1].match(/作者[\s\S]*?<\/span>[\s\S]*?([\s\S]*?)<br/) : null
  if (authorLinks) {
    const authorHtml = authorLinks[1]
    const names = []
    const nameRegex = />([^<]+)<\/a>/g
    let nameMatch
    while ((nameMatch = nameRegex.exec(authorHtml)) !== null) {
      const name = nameMatch[1].trim()
      if (name && name !== '/') names.push(name)
    }
    author = names.join(', ')
  }
  if (!author) author = extract(infoText, /作者[：:]\s*(.+?)(?:\n|$)/)

  const publisher = extract(infoText, /出版社[：:]\s*(.+?)(?:\n|\/|$)/)
  const publishDate = extract(infoText, /出版年[：:]\s*(.+?)(?:\n|\/|$)/)
  const pages = extract(infoText, /页数[：:]\s*(\d+)/)
  const price = extract(infoText, /定价[：:]\s*(.+?)(?:\n|\/|$)/)

  let description = ''
  const introMatch = html.match(/<div class="intro">([\s\S]*?)<\/div>/)
  if (introMatch) {
    const paragraphs = []
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g
    let pMatch
    while ((pMatch = pRegex.exec(introMatch[1])) !== null) {
      paragraphs.push(pMatch[1].replace(/<[^>]+>/g, '').trim())
    }
    description = paragraphs.length ? paragraphs.join('\n') : introMatch[1].replace(/<[^>]+>/g, '').trim()
  }

  return { title, author, publisher, publishDate, pages, price, category: '', description, cover: '', source: 'douban' }
}

async function fetchFromGoogleBooks(isbn) {
  const resp = await fetchWithTimeout(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
    { headers: { 'User-Agent': DUSHU_HEADERS['User-Agent'] } }
  )
  const data = await resp.json()
  if (!data.totalItems || !data.items || !data.items[0]) throw new Error('未找到')
  const info = data.items[0].volumeInfo
  return {
    title: info.title || '',
    author: (info.authors || []).join(', '),
    publisher: info.publisher || '',
    publishDate: info.publishedDate || '',
    pages: String(info.pageCount || ''),
    category: (info.categories || []).join(', '),
    description: info.description || '',
    cover: (info.imageLinks && info.imageLinks.thumbnail) || '',
    source: 'google'
  }
}

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { isbn } = event

  if (!isbn || !/^\d{10}(\d{3})?$/.test(isbn)) {
    return { errCode: -1, errMsg: '无效的ISBN' }
  }

  try {
    const bookInfo = await fetchFromDushu(isbn)
    if (bookInfo.title) {
      return { errCode: 0, data: bookInfo, openid: OPENID }
    }
  } catch (e) {
    console.log('[fetchBookInfo] 读书网查询失败:', e.message)
  }

  try {
    const detailUrl = await searchDouban(isbn)
    if (detailUrl) {
      const bookInfo = await fetchDoubanDetail(detailUrl)
      return { errCode: 0, data: bookInfo, openid: OPENID }
    }
  } catch (e) {
    console.log('[fetchBookInfo] 豆瓣查询失败:', e.message)
  }

  try {
    const bookInfo = await fetchFromGoogleBooks(isbn)
    return { errCode: 0, data: bookInfo, openid: OPENID }
  } catch (e) {
    console.log('[fetchBookInfo] Google Books查询失败:', e.message)
  }

  return { errCode: -2, errMsg: '所有数据源均未找到该书籍', openid: OPENID }
}
