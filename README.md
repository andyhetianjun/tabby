# tabby

I built Tabby, a shared-expenses app for your phone, because I wanted to learn how to build a phone app from start to finish. Splitting shared costs is a small problem with a surprisingly tricky core: rounding cents fairly, and working out the fewest payments that settle everyone up.

**Try it:** [andyhetianjun.github.io/tabby](https://andyhetianjun.github.io/tabby/) runs the app in your browser with a made-up group, no server needed.

[![CI](https://github.com/andyhetianjun/tabby/actions/workflows/ci.yml/badge.svg)](https://github.com/andyhetianjun/tabby/actions/workflows/ci.yml)

## What it does

You make a group, add the people in it, and record each expense: what it was, who paid and how to split it (equally, by exact amounts, by shares or by percent). Tabby shows who owes whom, then gives a short list of payments that settles everything. If the connection drops, the app still shows the last saved data, and expenses you add offline are uploaded later.

The two tricky parts:

- **Cents.** $10.00 split three ways cannot be three equal amounts. Tabby stores money as whole cents (never decimals, which drift) and hands the leftover cent to someone, so the result is $3.34, $3.33, $3.33 and always adds back to exactly $10.00.
- **Settling up.** If four people owe each other money, you do not need a payment per debt. Tabby nets everything out and proposes few payments, never more than (people who owe or are owed) minus one. Finding the true minimum is a harder problem, so in rare cases it uses one more payment than the best possible answer.

## Features

- [Demo mode](docs/demo-mode.md): the app runs with no server, using the same split code on the device, with a made-up group to tap through. This is the live site above.
- [Splitting a receipt by items](docs/receipt-itemizing.md): assign each item to the people who shared it, and share tax and tip in proportion, with cents rounded fairly.

![Tabby in demo mode](docs/img/demo.png)

## How to use it

You need Node 20 or newer.

```bash
npm install
npm run dev:api      # server on http://localhost:3000
npm run dev:mobile   # the app, in a second terminal
```

To run in a browser, start the app and press `w`. To use a phone, install Expo Go, put the phone on the same Wi-Fi as your computer, scan the QR code, and on the sign-in screen set the server address to `http://<your computer's address>:3000` (`localhost` only works in a simulator or browser).

A walk through the app:

1. Sign in with any name and create a group.
2. Add two people, for example Sam and Priya.
3. Add an expense: Groceries, 100.00, paid by you, split equally. The preview shows $33.34 / $33.33 / $33.33.
4. Add another with "Exact amounts" or "Percent". The form refuses values that do not add up.
5. Open "Settle up" to see the short list of payments, and tap "Mark as paid" for each.
6. For the offline path, stop the server, add an expense, start the server again and reopen the group.

Without a phone, the same thing with curl:

```bash
B=http://localhost:3000
TOKEN=$(curl -s -XPOST $B/auth/register -H 'content-type: application/json' -d '{"name":"Andy"}' | jq -r .token)
curl -s -XPOST $B/groups -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Demo group","currency":"CAD"}'
```

## Design

The repo has three parts:

| Folder | What it is |
| --- | --- |
| `packages/core` | The money, splitting, balance and settle-up logic, plus the message formats shared by the server and the app |
| `apps/api` | The server. It uses SQLite (a database in one file) by default, or Postgres if `DATABASE_URL` is set |
| `apps/mobile` | The phone app, built with Expo and React Native |

The server and the app both use the same `core` code, so they cannot disagree about how a split is rounded. Shares and percent splits use the largest remainder method: everyone gets their rounded-down amount, then leftover cents go one at a time to whoever had the biggest fractional part. Sign-in is deliberately simple (a name and a random token, no passwords), fine for a demo and not meant for real accounts. I wrote the small database layer by hand instead of using an ORM so the SQLite and Postgres paths are easy to read side by side.

More detail is in [docs/design.md](docs/design.md). To use Postgres:

```bash
docker compose up -d db
DATABASE_URL=postgres://tabby:tabby@localhost:5433/tabby npm run dev:api
```

## Tests and CI

```bash
npm test            # core, API and mobile tests
npm run lint
npm run typecheck
cd apps/mobile && npx expo export --platform web   # the web build succeeds
```

What I last ran on my machine:

| Suite | Command | Result |
| --- | --- | --- |
| core (money, splitting, receipts, balances, settle-up, property tests) | `npm test -w @tabby/core` | 41 passed |
| API integration tests (in-memory SQLite) | `npm test -w @tabby/api` | 16 passed |
| API integration tests against Postgres 16 | `TEST_DATABASE_URL=... npm test -w @tabby/api` | 16 passed |
| mobile (React Native Testing Library, local data layer) | `npm test -w @tabby/mobile` | 32 passed |

The property tests generate 100 random cases per property. They check that shares always add up to the total and stay within one cent of the exact share, that equal splits differ by at most one cent, that group balances sum to zero, and that applying the settle-up payments brings every balance to zero using at most n-1 payments. `TEST_DATABASE_URL` empties the database it points at, so use a throwaway one.

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and the web export, and runs the API tests again against a Postgres service. `.github/workflows/pages.yml` builds the demo site and publishes it on GitHub Pages.

Untested: I have not run the app on a physical phone or a simulator. What I verified is the web export, the tests, the server over HTTP, and the demo site in headless Chrome (see [demo mode](docs/demo-mode.md)).

## What I'd do next

- Rotate who gets the leftover cent so the same person is not always first.
- Real sign-in and a way to recover a lost token.
- Edit an expense instead of delete and re-add.
- Uneven sharing of a single receipt item, and tax and tip as percentages.
- Let the offline queue also hold payments and deletes.
- Per-expense currency and conversion.
- Pagination for long expense lists.

## License

MIT
