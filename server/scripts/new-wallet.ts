// Создаёт горячий кошелёк проекта и записывает секретную фразу в server/.env.
// В консоль выводится только адрес: фразу никуда не копируйте и никому не отправляйте
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto'
import { WalletContractV4 } from '@ton/ton'

const envPath = fileURLToPath(new URL('../.env', import.meta.url))
const examplePath = fileURLToPath(new URL('../.env.example', import.meta.url))

const current = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
const existing = current.match(/^WALLET_MNEMONIC=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, '')
const testnet = !/^TON_NETWORK=mainnet$/m.test(current)

async function addressOf(words: string[]) {
  const kp = await mnemonicToPrivateKey(words)
  return WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey }).address.toString({ testOnly: testnet, bounceable: false })
}

// Не затираем существующий кошелёк: на нём могут быть деньги игроков
if (existing && existing.split(/\s+/).length === 24) {
  console.log('Кошелёк уже создан, новый не создаю.')
  console.log(`Адрес: ${await addressOf(existing.split(/\s+/))}`)
  process.exit(0)
}

const words = await mnemonicNew(24)
const address = await addressOf(words)

let env = current || readFileSync(examplePath, 'utf8')
const set = (key: string, value: string) => {
  env = new RegExp(`^${key}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`) : `${env.trimEnd()}\n${key}=${value}\n`
}
set('WALLET_MNEMONIC', `"${words.join(' ')}"`)
if (!/^ADMIN_TOKEN=\S+/m.test(env)) set('ADMIN_TOKEN', randomBytes(24).toString('hex'))

writeFileSync(envPath, env, { mode: 0o600 })
chmodSync(envPath, 0o600)

console.log(`Кошелёк проекта создан (${testnet ? 'testnet' : 'mainnet'}).`)
console.log(`Адрес: ${address}`)
console.log('Секретная фраза и пароль админки записаны в server/.env (доступ только у вас).')
if (testnet) console.log('Пополните его тестовыми TON через бота @testgiver_ton_bot в Telegram.')
