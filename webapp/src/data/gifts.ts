import CATALOG from './catalog.json'

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface Gift {
  id: string
  name: string
  /** Минимальная цена коллекции в TON. Демо-значения, позже приходят с бэкенда. */
  price: number
  /** Монета TON: приз кейса, а не NFT. Сразу зачисляется на баланс. */
  coin?: boolean
  /** Редкость задана явно, а не по цене. */
  rarity?: Rarity
  /** Номер экземпляра для картинки на витрине: со склада — настоящий подарок, который можно выиграть. */
  num?: number
}


/**
 * Красивые модели: номер экземпляра на Fragment, который показываем на витрине, в кейсах и в апгрейде.
 * Выбраны вручную среди самых редких моделей коллекции.
 */
const SHOWCASE: Record<string, number> = {
  luckylocket: 771, // Faberge Egg
  diamondring: 30161, // Cobalt Rose
  rarebird: 8951, // Frozen Gold
  crystalball: 10218, // Femme Fatale
  hangingstar: 1116, // Sparkles
  evileye: 43613, // Jarvis
  bunnymuffin: 37371, // Unicorn
  jollychimp: 57649, // Golden Monkey
  bowtie: 20461, // Farfalle
  faithamulet: 34644, // Dark Night
  springbasket: 65872, // Rabbit Habit
  lightsword: 94064, // Wrath of Vader
  snowglobe: 35908, // Party Cat
  cloverpin: 97015, // Moon Power
  moneypot: 24127, // Sauron
  jackinthebox: 63112, // Sponge Box
  swagbag: 7518, // Cookie Dude
  libertyfigure: 189973, // Rebel Royal
  partysparkler: 15759, // Premium
  lolpop: 204653, // Andromeda
  heroichelmet: 1033, // Equalizer
  astralshard: 556, // Dark Soul
  iongem: 1160, // Pink Floyd
  magicpotion: 3311, // Star Power
  nekohelmet: 861, // Sky Diver
  bondedring: 2582, // Asteroid
  genielamp: 3228, // Aladdin
  electricskull: 4119, // Terminator
  skystilettos: 18545, // Fortuna
  ionicdryer: 15786, // Arc Reactor
  surgeboard: 16780, // Duke
  inputkey: 438, // Quad Damage
  moonpendant: 51391, // Starry Night
  stellarrocket: 102021, // To The Moon
  miragelamp: 4443, // Warm Pixel
  starnotepad: 1656, // Pepe Diary
  tamagadget: 9978, // Classic Blue
  chillflame: 241732, // Eye of Sauron
  vicecream: 216527, // Gold Leaf
  durovscap: 302, // Artwork
  nailbracelet: 129, // Interstellar
  minioscar: 374, // Grenadine
  poolfloat: 171288, // Khokhloma
  icecream: 301309, // Resistance
  whipcupcake: 259257, // Starfish
  moussecake: 149828, // Hollow Night
  homemadecake: 74300, // Birthday
  gingercookie: 48150, // Universe
  candycane: 160509, // Mythic Candy
  cookieheart: 454, // Lucky Charm
  berrybox: 6492, // Lady Bites
  jellybunny: 71199, // Sticky Red
  happybrownie: 39335, // Kawaii
  hypnolollipop: 55973, // Tamagotchi
  plushpepe: 1515, // Cozy Galaxy
  heartlocket: 1290, // Uranus
  resistancedog: 7362, // Aura
  preciouspeach: 1125, // Shocking
  scaredcat: 2273, // Bubblegum
  mightyarm: 1064, // Crystal Fist
  lootbag: 13909, // Glacier
  westsidesign: 4719, // Sapphire
  kissedfrog: 2957, // Lilie Pond
  swisswatch: 1251, // The Grid
  trappedheart: 15409, // Comic Book
}

// Все коллекции подарков Telegram с минимальной ценой на Fragment (scripts/fragment-catalog.mjs).
// Это демо-витрина без сервера; с сервером витрина — то, что лежит на складе (setCatalog).
// id совпадает со slug коллекции на Fragment, по нему строится ссылка на картинку
export const GIFTS: Gift[] = (CATALOG as { id: string; name: string; price: number }[])
  .filter((g) => g.price > 0)
  .map((g) => ({ id: g.id, name: g.name, price: g.price, num: SHOWCASE[g.id] }))

// Монеты TON из webapp/public/coins. В общий список подарков не входят: их нет в апгрейде, джекпоте и инвентаре.
// Редкость своя, иначе по цене все монеты были бы обычными
export const COINS: Gift[] = [
  // «Ничего не выпало»: приз с нулевой ценой, рисуется красным крестом
  { id: 'ton-0', name: '❌ Ничего', price: 0, coin: true, rarity: 'common' },
  { id: 'ton-0.01', name: '0.01 TON', price: 0.01, coin: true, rarity: 'common' },
  { id: 'ton-0.02', name: '0.02 TON', price: 0.02, coin: true, rarity: 'common' },
  { id: 'ton-0.05', name: '0.05 TON', price: 0.05, coin: true, rarity: 'uncommon' },
  { id: 'ton-0.1', name: '0.1 TON', price: 0.1, coin: true, rarity: 'uncommon' },
  { id: 'ton-0.2', name: '0.2 TON', price: 0.2, coin: true, rarity: 'uncommon' },
  { id: 'ton-0.3', name: '0.3 TON', price: 0.3, coin: true, rarity: 'rare' },
  { id: 'ton-0.4', name: '0.4 TON', price: 0.4, coin: true, rarity: 'rare' },
  { id: 'ton-0.5', name: '0.5 TON', price: 0.5, coin: true, rarity: 'rare' },
  { id: 'ton-1', name: '1 TON', price: 1, coin: true, rarity: 'epic' },
  { id: 'ton-2', name: '2 TON', price: 2, coin: true, rarity: 'legendary' },
]

const BY_ID = new Map([...GIFTS, ...COINS].map((g) => [g.id, g]))

export const findGift = (id: string): Gift | null => BY_ID.get(id) ?? null

export function getGift(id: string): Gift {
  const gift = BY_ID.get(id)
  if (!gift) throw new Error(`Unknown gift: ${id}`)
  return gift
}

export const isCoin = (id: string) => BY_ID.get(id)?.coin === true

let catalog: Gift[] = GIFTS

/** Подарки, которые сейчас можно выиграть: со склада, если сервер запущен, иначе демо-список. */
export const giftCatalog = () => catalog

/** Добавляет или обновляет коллекции, например со склада: цены сервера важнее демо-цен. */
export function registerGifts(list: Gift[]) {
  for (const g of list) BY_ID.set(g.id, { ...BY_ID.get(g.id), ...g })
}

/** Витрина со склада. null — вернуть демо-список. */
export function setCatalog(list: Gift[] | null) {
  if (list) registerGifts(list)
  catalog = list ?? GIFTS
}

/** Случайный подарок с витрины не дороже maxPrice, например для ставок ботов. */
export function randomGift(maxPrice = Infinity): Gift | null {
  const list = catalog.filter((g) => g.price <= maxPrice)
  return list.length ? list[Math.floor(Math.random() * list.length)] : null
}

/** Подарок с витрины, ближайший по цене. */
export function nearestGift(price: number): Gift | null {
  return catalog.reduce<Gift | null>((best, g) => (!best || Math.abs(g.price - price) < Math.abs(best.price - price) ? g : best), null)
}

/** Абсолютная ссылка: её же отдаём в сторис Telegram. Учитывает папку сайта, например на GitHub Pages. */
const coinImage = (id: string) => new URL(`${import.meta.env.BASE_URL}coins/${id}.png`, location.href).href

export function giftImage(id: string, num: number): string {
  if (isCoin(id)) return coinImage(id)
  return `https://nft.fragment.com/gift/${id}-${num}.webp`
}

/** Модель коллекции без фона и узора, прозрачный WebP 128×128. */
export function giftModelImage(id: string): string {
  if (isCoin(id)) return coinImage(id)
  return `https://fragment.com/file/gifts/${id}/thumb.webp`
}

export function giftRarity(id: string): Rarity {
  const gift = getGift(id)
  return gift.rarity ?? rarityOf(gift.price)
}

export function rarityOf(price: number): Rarity {
  if (price >= 500) return 'legendary'
  if (price >= 50) return 'epic'
  if (price >= 10) return 'rare'
  if (price >= 3) return 'uncommon'
  return 'common'
}

/** Случайный номер экземпляра: у разных номеров разные модели и фоны. */
export function randomNum(): number {
  return 1 + Math.floor(Math.random() * 3000)
}
