// Confirmation view rendered after a successful logout. Reached via the 303
// redirect from /api/auth/logout. Same layout primitives as the landing page
// (hero image as the heading, body paragraph, CTA below) so the brand identity
// stays consistent across states. The Spotify-revocation link is mandatory
// per docs/oauth.md — logout only clears our cookie; Spotify still holds
// authorization until the user revokes it on Spotify's side.

export const metadata = {
  title: "Logged out — shuffleify",
};

export default function LoggedOut() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 p-8 text-zinc-100">
      <div className="flex flex-col items-center gap-6 text-center">
        <h1>
          {/* eslint-disable-next-line @next/next/no-img-element -- bypasses next/image basePath quirks in dev. */}
          <img
            src="/shuffleify/shuffleify-hero.webp"
            alt="shuffleify"
            width={1024}
            height={1024}
            className="h-64 w-64 sm:h-80 sm:w-80"
          />
        </h1>
        <p className="max-w-md text-xl font-medium text-zinc-300">
          <strong className="font-bold text-[#e888c0]">
            You have been logged out of shuffleify.
          </strong>
          <br />
          Spotify still has shuffleify on your{" "}
          <a
            href="https://www.spotify.com/account/apps/"
            target="_blank"
            rel="noreferrer noopener"
            className="whitespace-nowrap underline transition-colors hover:text-zinc-100"
          >
            authorized apps list
          </a>{" "}
          if you&apos;d like to unlink it.
        </p>
        <a
          href="/shuffleify/api/auth/login"
          className="rounded-full bg-[#e888c0] px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-[#f098c8]"
        >
          Log in again
        </a>
      </div>
    </main>
  );
}
