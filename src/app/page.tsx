import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  const isLoggedIn = session.accessToken !== undefined;

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
        <p className="max-w-md text-lg text-zinc-400">
          Spotify sucks — everyone knows it. See what a real shuffle would look like.
        </p>

        {isLoggedIn ? (
          <form action="/shuffleify/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-medium hover:bg-zinc-900"
            >
              Log out
            </button>
          </form>
        ) : (
          <a
            href="/shuffleify/api/auth/login"
            className="rounded-full bg-pink-500 px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-pink-400"
          >
            Log in with Spotify
          </a>
        )}
      </div>
    </main>
  );
}
