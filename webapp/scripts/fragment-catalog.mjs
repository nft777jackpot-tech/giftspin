// Каталог подарков Telegram с Fragment: все коллекции, их минимальная цена и все модели.
// Запуск: node scripts/fragment-catalog.mjs (из папки webapp). Пишет:
//   src/data/catalog.json      — коллекции: id (slug), название, минимальная цена в TON, сколько выставлено
//   public/models/<slug>.json  — модели коллекции: [название, хеш картинки, сколько экземпляров]
// Картинка модели без фона: https://fragment.com/file/gifts/<slug>/model.<хеш>.webp
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'https://fragment.com'
const UA = { 'user-agent': 'Mozilla/5.0 (Macintosh) GiftSpin catalog' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function page(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: UA })
    if (res.ok) return res.text()
    await sleep(2000 * (attempt + 1))
  }
  throw new Error(`Fragment не ответил: ${url}`)
}

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
const num = (s) => Number(String(s).replace(/,/g, ''))

const index = await page(`${BASE}/gifts`)
const slugs = [...new Set([...index.matchAll(/href="\/gifts\/([a-z0-9]+)"/g)].map((m) => m[1]))]
console.log(`коллекций: ${slugs.length}`)

mkdirSync('public/models', { recursive: true })
const catalog = []
for (const slug of slugs) {
  const html = await page(`${BASE}/gifts/${slug}?sort=price_asc&filter=sale`)
  const name = decode(html.match(/<span class="item-name">([^<]+)<\/span>/)?.[1] ?? slug)
  const price = num(html.match(/tm-grid-item-value tm-value icon-before icon-ton">([\d.,]+)</)?.[1] ?? 0)
  // Блок моделей идёт до блока фонов
  const start = html.indexOf('attr-model')
  const end = html.indexOf('attr-backdrop', start)
  const block = start >= 0 ? html.slice(start, end > 0 ? end : undefined) : ''
  const models = [...block.matchAll(/data-value="([^"]+)">[\s\S]*?\/file\/gifts\/[a-z0-9]+\/model\.([A-Za-z0-9_-]+)\.webp"[\s\S]*?tm-main-filters-count">([\d,]+)</g)].map((m) => [decode(m[1]), m[2], num(m[3])])
  writeFileSync(`public/models/${slug}.json`, JSON.stringify(models))
  catalog.push({ id: slug, name, price })
  console.log(slug.padEnd(18), String(price).padStart(8), 'TON', String(models.length).padStart(4), 'моделей', name)
  await sleep(350)
}
catalog.sort((a, b) => b.price - a.price)
writeFileSync('src/data/catalog.json', JSON.stringify(catalog, null, 1) + '\n')
console.log(`готово: ${catalog.length} коллекций, ${new Date().toISOString().slice(0, 10)}`)
