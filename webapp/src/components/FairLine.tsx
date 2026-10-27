import { shortHash } from '../lib/format'
import { t } from '../lib/i18n'
import type { VerifyInput } from '../lib/verify'
import { useNav } from '../state/nav'
import { IconShield } from './icons'

interface Props {
  /** Хеш сида, показанный до раунда. */
  hash: string
  /** После раунда сид раскрыт и раунд можно проверить. */
  verify?: VerifyInput
}

/** Строка под игровым полем: хеш раунда, а после раунда — кнопка проверки. */
export function FairLine({ hash, verify }: Props) {
  const { open } = useNav()
  return (
    <div className="fair-line">
      <IconShield size={14} />
      <span className="fair-line__label">{t('Хеш раунда')}</span>
      <code className="fair-line__hash">{shortHash(hash)}</code>
      {verify && (
        <button type="button" className="link-btn" onClick={() => open({ name: 'fair', verify })}>
          {t('Проверить')}
        </button>
      )}
    </div>
  )
}
