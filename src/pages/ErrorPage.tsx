import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import isleOfTheDead from '../../images/error/isle-of-the-dead.png'

export default function ErrorPage() {
  const error = useRouteError()

  // No error means we landed here via the * catch-all route (unknown path)
  const is404 = !error || (isRouteErrorResponse(error) && error.status === 404)

  const heading = is404 ? 'No Passage Found' : 'An Error Has Occurred'
  const subheading = is404
    ? 'The entry you seek does not exist in the archive.'
    : 'Something went wrong while rendering this page.'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <div className="flex w-full max-w-2xl flex-col items-center gap-8">
        <div className="relative w-full overflow-hidden rounded-sm shadow-2xl">
          <img
            src={isleOfTheDead}
            alt="Isle of the Dead by Arnold Böcklin"
            className="w-full object-cover"
            style={{ filter: 'brightness(0.82) saturate(0.78)' }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 38%, rgba(12,10,8,0.72) 100%)',
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-display text-[9px] uppercase tracking-label text-white/30">
            {is404 ? '404' : 'Error'}
          </p>
          <h1 className="font-display text-[26px] leading-tight text-white/90">{heading}</h1>
          <p className="max-w-sm font-body text-[14px] leading-reading text-white/45">
            {subheading}
          </p>
        </div>

        <Link
          to="/"
          className="font-display text-[9px] uppercase tracking-label text-white/35 transition-colors hover:text-white/70"
        >
          Return to the Graph
        </Link>
      </div>
    </div>
  )
}
