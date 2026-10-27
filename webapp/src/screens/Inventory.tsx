import { useMemo, useState } from 'react'
import { GiftCard } from '../components/GiftCard'
import { Money } from '../components/Money'
import { toast } from '../components/Toaster'
import { getGift } from '../data/gifts'
import { fmtAmount } from '../lib/format'
import { haptic } from '../lib/telegram'
import { useNav } from '../state/nav'
import { useStore } from '../state/store'

type Sort = 'desc' | 'asc' | 'new'

export function Inventory() {
  const { inventory, sellItems, openSheet } = useStore()
  const { setTab } = useNav()
  const [picked, setPicked] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('desc')

  const total = inventory.reduce((s, i) => s + getGift(i.giftId).price, 0)
  const pickedValue = inventory.filter((i) => picked.includes(i.uid)).reduce((s, i) => s + getGift(i.giftId).price, 0)

  const list = useMemo(() => {
    if (sort === 'new') return inventory
    const k = sort === 'desc' ? -1 : 1
    return [...inventory].sort((a, b) => k * (getGift(a.giftId).price - getGift(b.giftId).price))
  }, [inventory, sort])

  const toggle = (uid: string) => {
    haptic.select()
    setPicked((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]))
  }

  const sell = () => {
    const sum = sellItems(picked)
    setPicked([])
    haptic.success()
    toast(`Продано на ${fmtAmount(sum)} TON`, 'success')
  }

  return (
    <div className="screen">
      <h1 className="screen-title">Инвентарь</h1>

      <div className="inv-summary">
        <div>
          <div className="inv-summary__label">Подарков</div>
          <div className="inv-summary__value">{inventory.length}</div>
        </div>
        <div>
          <div className="inv-summary__label">Стоимость</div>
          <Money ton={total} size={18} className="inv-summary__value" />
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setPicked(picked.length === inventory.length ? [] : inventory.map((i) => i.uid))}
          disabled={!inventory.length}
        >
          {picked.length === inventory.length && inventory.length ? 'Снять всё' : 'Выбрать всё'}
        </button>
      </div>

      <div className="chips-row">
        {(
          [
            ['desc', 'Дороже'],
            ['asc', 'Дешевле'],
            ['new', 'Новые'],
          ] as [Sort, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" className={`chip ${sort === id ? 'is-active' : ''}`} onClick={() => setSort(id)}>
            {label}
          </button>
        ))}
      </div>

      {inventory.length ? (
        <div className="gift-grid">
          {list.map((i) => (
            <GiftCard key={i.uid} giftId={i.giftId} num={i.num} showNum selected={picked.includes(i.uid)} onClick={() => toggle(i.uid)} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty__icon">🎁</div>
          <p>Здесь появятся ваши подарки</p>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setTab('cases')}>
            Открыть кейс
          </button>
        </div>
      )}

      {picked.length > 0 && (
        <div className="action-bar">
          <button type="button" className="btn btn--ghost" onClick={() => openSheet('withdraw')}>
            Вывести
          </button>
          <button type="button" className="btn btn--primary" onClick={sell}>
            Продать {picked.length} · <Money ton={pickedValue} size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
