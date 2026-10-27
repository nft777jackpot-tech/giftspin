import { Money } from '../components/Money'
import { PageHead } from '../components/PageHead'
import { useStore, type Tx } from '../state/store'

const KIND: Record<Tx['kind'], string> = {
  deposit: 'Пополнение',
  withdraw: 'Вывод',
  bet: 'Ставка',
  win: 'Выигрыш',
  sell: 'Продажа',
  bonus: 'Бонус',
  ref: 'Рефералы',
}

const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function History() {
  const { history } = useStore()
  return (
    <div className="screen">
      <PageHead title="История операций" />
      {history.length === 0 ? (
        <div className="empty">Операций пока нет</div>
      ) : (
        <div className="panel tx-list">
          {history.map((t) => (
            <div key={t.id} className="tx">
              <div>
                <div className="tx__title">{t.title}</div>
                <div className="muted small">
                  {KIND[t.kind]} · {time.format(t.at)}
                </div>
              </div>
              <Money ton={t.amount} size={13} sign className={t.amount >= 0 ? 'pos' : 'neg'} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
