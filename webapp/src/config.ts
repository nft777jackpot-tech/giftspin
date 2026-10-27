export const BRAND = 'GiftSpin'

/** Доля ставок, которая в среднем возвращается игрокам: 0.9 = RTP 90%. */
export const RTP = 0.9


/** Аккаунт, на который игроки отправляют подарки для пополнения. */
export const DEPOSIT_ACCOUNT = '@giftspin_bank'

/** Бот с Mini App, канал проекта (задание на подписку и посты о крупных выигрышах) и поддержка. */
export const BOT_USERNAME = 'NFTJACKPOTCASINO_BOT'
export const CHANNEL = '@NFTJackpotAnnounce'
export const SUPPORT_BOT_COMMAND = '/support'

/** Выигрыш от этой суммы в TON бот публикует в канале проекта. */
export const BIG_WIN_TON = 100

/** Рефералу достаётся эта доля комиссии казино со ставок приглашённых: 0.2 = 20%. */
export const REF_SHARE = 0.2

/** Призовой фонд недельного турнира в TON и его деление между местами. */
export const TOURNAMENT_POOL = 500
export const TOURNAMENT_SPLIT = [0.3, 0.2, 0.12, 0.09, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03]

/** Telegram ID админов. Настоящая проверка прав будет на бэкенде, здесь только показ пункта меню. */
export const ADMIN_IDS: number[] = []

/**
 * Описание приложения для TON Connect: кошелёк показывает из него название и иконку.
 * Пока сайт не выложен, берём демо-описание команды TON. После хостинга — свой файл на своём домене.
 */
export const TON_CONNECT_MANIFEST = 'https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json'

/** Пока нет бэкенда, все игры крутятся на клиенте на демо-балансе. */
export const DEMO = true
