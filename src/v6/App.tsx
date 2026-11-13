/* Kring Root App Container: mounts locked 6 Nov v8 app by default, preserving #venue-onboard / #venue-consent / #venue-bill & v6 test routes. */
import './screens/onboarding'
import './screens/signup'
import './screens/explore'
import './screens/stories'
import './screens/booking'
import './screens/deals'
import './screens/chat'
import './screens/meet'
import './screens/checkin'
import './screens/venueBill'
import './screens/venueOnboard'
import './screens/venueConsent'
import './screens/account'
import './screens/saved'
import './screens/host'
import './screens/settings'
import { Stage } from './core/router'
import { InstallPwaBanner } from './components/InstallPwaBanner'
import { KringAppV8 } from '../v8/KringAppV8'

export function App({ start = 'welcome' }: { start?: string }) {
  if (start === 'v8') {
    return <KringAppV8 />
  }
  return (
    <>
      <Stage start={start} />
      <InstallPwaBanner />
    </>
  )
}

export default App
