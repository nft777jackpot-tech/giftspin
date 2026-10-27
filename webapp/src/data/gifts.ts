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

// Демо-витрина без сервера. С сервером витрина — то, что лежит на складе (setCatalog).
// id совпадает со slug коллекции на Fragment, по нему строится ссылка на картинку
export const GIFTS: Gift[] = [
  { id: 'plushpepe', name: 'Plush Pepe', price: 4200 },
  { id: 'heartlocket', name: 'Heart Locket', price: 1350 },
  { id: 'durovscap', name: "Durov's Cap", price: 520 },
  { id: 'preciouspeach', name: 'Precious Peach', price: 260 },
  { id: 'mightyarm', name: 'Mighty Arm', price: 140 },
  { id: 'astralshard', name: 'Astral Shard', price: 85 },
  { id: 'lootbag', name: 'Loot Bag', price: 58 },
  { id: 'scaredcat', name: 'Scared Cat', price: 46 },
  { id: 'magicpotion', name: 'Magic Potion', price: 42 },
  { id: 'genielamp', name: 'Genie Lamp', price: 38 },
  { id: 'lowrider', name: 'Low Rider', price: 34 },
  { id: 'swisswatch', name: 'Swiss Watch', price: 29 },
  { id: 'kissedfrog', name: 'Kissed Frog', price: 27 },
  { id: 'signetring', name: 'Signet Ring', price: 24 },
  { id: 'nekohelmet', name: 'Neko Helmet', price: 22 },
  { id: 'vintagecigar', name: 'Vintage Cigar', price: 21 },
  { id: 'ionicdryer', name: 'Ionic Dryer', price: 18 },
  { id: 'toybear', name: 'Toy Bear', price: 17 },
  { id: 'diamondring', name: 'Diamond Ring', price: 14 },
  { id: 'eternalrose', name: 'Eternal Rose', price: 13 },
  { id: 'lovepotion', name: 'Love Potion', price: 11 },
  { id: 'tophat', name: 'Top Hat', price: 9.5 },
  { id: 'trappedheart', name: 'Trapped Heart', price: 7.8 },
  { id: 'crystalball', name: 'Crystal Ball', price: 7.2 },
  { id: 'recordplayer', name: 'Record Player', price: 6.9 },
  { id: 'sakuraflower', name: 'Sakura Flower', price: 5.6 },
  { id: 'skullflower', name: 'Skull Flower', price: 5.1 },
  { id: 'jellybunny', name: 'Jelly Bunny', price: 4.6 },
  { id: 'witchhat', name: 'Witch Hat', price: 3.9 },
  { id: 'evileye', name: 'Evil Eye', price: 3.7 },
  { id: 'spyagaric', name: 'Spy Agaric', price: 3.5 },
  { id: 'tamagadget', name: 'Tama Gadget', price: 3.3 },
  { id: 'berrybox', name: 'Berry Box', price: 3.1 },
  { id: 'hexpot', name: 'Hex Pot', price: 2.9 },
  { id: 'snakebox', name: 'Snake Box', price: 2.8 },
  { id: 'jesterhat', name: 'Jester Hat', price: 2.7 },
  { id: 'gingercookie', name: 'Ginger Cookie', price: 2.6 },
  { id: 'spicedwine', name: 'Spiced Wine', price: 2.5 },
  { id: 'hypnolollipop', name: 'Hypno Lollipop', price: 2.4 },
  { id: 'starnotepad', name: 'Star Notepad', price: 2.3 },
  { id: 'petsnake', name: 'Pet Snake', price: 2.2 },
  { id: 'partysparkler', name: 'Party Sparkler', price: 2.1 },
  { id: 'homemadecake', name: 'Homemade Cake', price: 2.0 },
  { id: 'bdaycandle', name: 'B-Day Candle', price: 1.9 },
  { id: 'lolpop', name: 'Lol Pop', price: 1.8 },
  { id: 'lunarsnake', name: 'Lunar Snake', price: 1.7 },
  { id: 'deskcalendar', name: 'Desk Calendar', price: 1.6 },
]

// Монеты TON из webapp/public/coins. В общий список подарков не входят: их нет в апгрейде, джекпоте и инвентаре.
// Редкость своя, иначе по цене все монеты были бы обычными
export const COINS: Gift[] = [
  { id: 'ton-0.01', name: '0.01 TON', price: 0.01, coin: true, rarity: 'common' },
  { id: 'ton-0.02', name: '0.02 TON', price: 0.02, coin: true, rarity: 'common' },
  { id: 'ton-0.05', name: '0.05 TON', price: 0.05, coin: true, rarity: 'uncommon' },
  { id: 'ton-0.1', name: '0.1 TON', price: 0.1, coin: true, rarity: 'uncommon' },
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
