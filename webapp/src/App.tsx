import { useEffect, useMemo, useState } from 'react'
import { FloatingGifts } from './components/FloatingGifts'
import { Header } from './components/Header'
import { TabBar } from './components/TabBar'
import { Toaster } from './components/Toaster'
import Velaris from './components/ui/velaris'
import { BgContext, bgBase, bgColors, loadBg, saveBg, type BgState } from './lib/background'
import { detectLang, LangContext, saveLang, setCurrentLang, type Lang } from './lib/i18n'
import { setTgChrome } from './lib/telegram'
import { Battle } from './screens/Battle'
import { Battles } from './screens/Battles'
import { CaseView } from './screens/CaseView'
import { Cases } from './screens/Cases'
import { Coinflip } from './screens/Coinflip'
import { Contracts } from './screens/Contracts'
import { Crash } from './screens/Crash'
import { Dice } from './screens/Dice'
import { Fair } from './screens/Fair'
import { Games } from './screens/Games'
import { History } from './screens/History'
import { Inventory } from './screens/Inventory'
import { Jackpot } from './screens/Jackpot'
import { Mines } from './screens/Mines'
import { Plinko } from './screens/Plinko'
import { Profile } from './screens/Profile'
import { Referrals } from './screens/Referrals'
import { Roulette } from './screens/Roulette'
import { Tasks } from './screens/Tasks'
import { Tournament } from './screens/Tournament'
import { Upgrade } from './screens/Upgrade'
import { BackgroundSheet } from './sheets/BackgroundSheet'
import { DepositSheet } from './sheets/DepositSheet'
import { LangSheet } from './sheets/LangSheet'
import { PromoSheet } from './sheets/PromoSheet'
import { WithdrawSheet } from './sheets/WithdrawSheet'
import { BattlesProvider } from './state/battles'
import { NavProvider, useNav } from './state/nav'
import { StoreProvider } from './state/store'

function Screen() {
  const { tab, page } = useNav()
  if (page) {
    switch (page.name) {
      case 'crash':
        return <Crash />
      case 'roulette':
        return <Roulette />
      case 'jackpot':
        return <Jackpot />
      case 'case':
        return <CaseView key={page.id} id={page.id} />
      case 'battles':
        return <Battles />
      case 'battle':
        return <Battle key={page.id} id={page.id} />
      case 'coinflip':
        return <Coinflip />
      case 'contracts':
        return <Contracts />
      case 'mines':
        return <Mines />
      case 'plinko':
        return <Plinko />
      case 'dice':
        return <Dice />
      case 'fair':
        return <Fair key={JSON.stringify(page.verify ?? null)} preset={page.verify} />
      case 'history':
        return <History />
      case 'tasks':
        return <Tasks />
      case 'tournament':
        return <Tournament />
      case 'referrals':
        return <Referrals />
    }
  }
  switch (tab) {
    case 'games':
      return <Games />
    case 'cases':
      return <Cases />
    case 'upgrade':
      return <Upgrade />
    case 'inventory':
      return <Inventory />
    case 'profile':
      return <Profile />
  }
}

function ScrollTop() {
  const { tab, page } = useNav()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab, page])
  return null
}

export function App() {
  const [lang, setLangState] = useState<Lang>(detectLang)
  // Язык выставляется до отрисовки детей, поэтому t() везде видит свежее значение
  setCurrentLang(lang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const langCtx = useMemo(
    () => ({
      lang,
      setLang: (l: Lang) => {
        saveLang(l)
        setLangState(l)
      },
    }),
    [lang],
  )
  const [bg, setBgState] = useState<BgState>(loadBg)
  // Тон фона переключает и тему интерфейса: на белой основе нужны тёмный текст и светлые карточки
  useEffect(() => {
    document.documentElement.dataset.tone = bg.tone
    setTgChrome(bg.tone === 'light' ? '#eef1f7' : '#000000')
  }, [bg.tone])
  const bgCtx = useMemo(
    () => ({
      bg,
      setBg: (next: BgState) => {
        saveBg(next)
        setBgState(next)
      },
    }),
    [bg],
  )

  return (
    <LangContext.Provider value={langCtx}>
      <BgContext.Provider value={bgCtx}>
        <StoreProvider>
          <BattlesProvider>
            <NavProvider>
              <ScrollTop />
              {/* Фон прибит к экрану: так он не растягивается на длинных страницах и не ломает липкую шапку */}
              <Velaris className="fixed inset-0 -z-10" height="100%" bg={bgBase(bg.tone)} colors={bgColors(bg)} speed={1.2} grain={0.25} maxDpr={1} />
              {bg.floating && <FloatingGifts />}
              <div className="app">
                <Header />
                <main className="main">
                  <Screen />
                </main>
                <TabBar />
              </div>
              <DepositSheet />
              <WithdrawSheet />
              <PromoSheet />
              <LangSheet />
              <BackgroundSheet />
              <Toaster />
            </NavProvider>
          </BattlesProvider>
        </StoreProvider>
      </BgContext.Provider>
    </LangContext.Provider>
  )
}
