import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  const isLoggedIn = session.accessToken !== undefined;

  return (
    <main className="grid flex-1 place-items-center bg-zinc-950 p-8 text-zinc-100">
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
            Spotify&apos;s shuffle sucks — everybody knows it.
          </strong>
          <br />
          Connect your account to see a real shuffle.
        </p>

        {isLoggedIn ? (
          <form action="/shuffleify/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-full bg-[#e888c0] px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-[#f098c8]"
            >
              Log out
            </button>
          </form>
        ) : (
          <a
            href="/shuffleify/api/auth/login"
            className="rounded-full bg-[#e888c0] px-8 py-3 text-base font-semibold text-black transition-colors hover:bg-[#f098c8]"
          >
            Log in with Spotify
          </a>
        )}
      </div>
    </main>
  );
}
