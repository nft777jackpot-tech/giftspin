import Fastify from 'fastify'
import { fromNano } from '@ton/core'
import { config, NETWORK } from './config.ts'
import './db.ts'
import { pollDeposits } from './deposits.ts'
import { registerRoutes } from './routes.ts'
import { friendly, hotAddress, hotBalance, initWallet } from './ton.ts'
import { pollUpdates, recoverGiftTransfers, syncStock } from './warehouse.ts'
import { processNextWithdrawal, recoverInterrupted } from './withdrawals.ts'

const app = Fastify({ logger: { level: 'info' }, bodyLimit: 16 * 1024 })

await initWallet()
recoverInterrupted()
recoverGiftTransfers()
registerRoutes(app)
await app.listen({ port: config.port, host: config.host })

app.log.info(`Сеть: ${NETWORK}. Кошелёк проекта: ${friendly(hotAddress())}. Склад подарков: ${config.warehouse}`)
hotBalance()
  .then((b) => app.log.info(`Баланс горячего кошелька: ${fromNano(b)} TON`))
  .catch((e) => app.log.warn(`Не удалось получить баланс кошелька: ${String(e)}`))

/** Повторяет задачу с паузой между запусками, без наложения, и не падает на ошибках сети. */
function loop(name: string, everyMs: number, task: () => Promise<void>) {
  const run = async () => {
    try {
      await task()
    } catch (e) {
      app.log.warn({ err: String(e) }, `${name}: ошибка, повторим`)
    }
    setTimeout(run, everyMs)
  }
  setTimeout(run, 1000)
}

loop('депозиты', config.depositPollMs, () => pollDeposits(app.log))
loop('выводы', config.withdrawPollMs, () => processNextWithdrawal(app.log))
if (config.warehouse !== 'off') loop('склад', config.stockSyncMs, () => syncStock(app.log))
// getUpdates сам ждёт до 25 секунд, поэтому пауза между запросами короткая
if (config.warehouse === 'telegram') loop('бот', 1000, () => pollUpdates(app.log))
